"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Capability, DgdStatus, ProjectRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/user";
import { requireProjectMember } from "@/server/membership";
import { can } from "@/lib/permissions/resolve";
import { calculateDgdTotals, checkDgdEligibility } from "@/lib/dgd/calculations";
import { inngest } from "@/inngest/client";
import { uploadFtmDocument } from "@/lib/storage";
import { validateFileMagicNumber } from "@/lib/validations/magic";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function revalidateDgd(projectId: string, orgId?: string) {
  revalidatePath(`/projects/${projectId}/dgd`);
  if (orgId) revalidatePath(`/projects/${projectId}/dgd/${orgId}`);
  revalidatePath(`/projects/${projectId}`);
}

async function auditDgd(userId: string | undefined, action: string, dgdId: string, payload?: object) {
  await prisma.auditLog.create({
    data: { userId, action, entity: "DgdRecord", entityId: dgdId, payload },
  });
}

const DISPUTE_DEADLINE_DAYS = 30;
const MOA_RESPONSE_DEADLINE_DAYS = 45;

// ─── Create Draft ────────────────────────────────────────────────────────────

const CreateDgdSchema = z.object({
  projectId: z.string().uuid(),
});

/**
 * ENTREPRISE creates a DGD draft (Projet de Décompte Final).
 * Pre-fills with live calculation data. Financial values are NOT frozen yet.
 */
export async function createDgdDraftAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = CreateDgdSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.SUBMIT_DGD);
  if (!allowed) throw new Error("Permission refusée.");

  if (member.role !== ProjectRole.ENTREPRISE) {
    throw new Error("Seules les entreprises peuvent créer un DGD.");
  }

  // Check eligibility (no open situations, no existing DGD)
  const ineligible = await checkDgdEligibility(data.projectId, member.organizationId);
  if (ineligible) throw new Error(ineligible);

  // Create the draft record (financial fields are null — they're frozen at submission)
  const dgd = await prisma.dgdRecord.create({
    data: {
      projectId: data.projectId,
      organizationId: member.organizationId,
      status: DgdStatus.DRAFT,
    },
  });

  await auditDgd(user.id, "DGD_DRAFT_CREATED", dgd.id);
  revalidateDgd(data.projectId, member.organizationId);
  return dgd.id;
}

// ─── Submit (Freeze Amounts) ─────────────────────────────────────────────────

const SubmitDgdSchema = z.object({
  dgdId: z.string().uuid(),
  projectId: z.string().uuid(),
});

/**
 * ENTREPRISE submits the DGD draft → PENDING_MOE.
 * Freezes all financial amounts at this point.
 */
export async function submitDgdAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = SubmitDgdSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.SUBMIT_DGD);
  if (!allowed) throw new Error("Permission refusée.");

  const dgd = await prisma.dgdRecord.findFirst({
    where: { id: data.dgdId, projectId: data.projectId, organizationId: member.organizationId },
  });
  if (!dgd) throw new Error("DGD introuvable.");
  if (dgd.status !== DgdStatus.DRAFT) throw new Error("Seuls les brouillons peuvent être soumis.");

  // Re-verify eligibility (situations may have changed since draft creation)
  const openSituation = await prisma.situationTravaux.findFirst({
    where: {
      projectId: data.projectId,
      organizationId: member.organizationId,
      status: { notIn: ["MOA_APPROVED", "MOE_REFUSED", "MOA_REFUSED"] },
    },
    select: { numero: true },
  });
  if (openSituation) {
    throw new Error(`La situation N°${openSituation.numero} est encore en cours. Clôturez toutes les situations avant de soumettre le DGD.`);
  }

  // Freeze financial amounts
  const totals = await calculateDgdTotals(data.projectId, member.organizationId);

  await prisma.$transaction(async (tx) => {
    await tx.dgdRecord.update({
      where: { id: data.dgdId },
      data: {
        status: DgdStatus.PENDING_MOE,
        marcheBaseHtCents: totals.marcheBaseHtCents,
        ftmAcceptedTotalHtCents: totals.ftmAcceptedTotalHtCents,
        marcheActualiseHtCents: totals.marcheActualiseHtCents,
        penaltiesTotalHtCents: totals.penaltiesTotalHtCents,
        retenueGarantieCents: totals.retenueGarantieCents,
        acomptesVersesHtCents: totals.acomptesVersesHtCents,
        soldeDgdHtCents: totals.soldeDgdHtCents,
        submittedAt: new Date(),
        submittedByMemberId: member.id,
      },
    });

    await tx.dgdReview.create({
      data: {
        dgdRecordId: data.dgdId,
        memberId: member.id,
        eventType: "SUBMITTED",
      },
    });
  });

  const org = await prisma.organization.findUnique({ where: { id: member.organizationId }, select: { name: true } });

  await inngest.send({
    name: "dgd/submitted",
    data: {
      projectId: data.projectId,
      dgdId: data.dgdId,
      organizationId: member.organizationId,
      organizationName: org?.name ?? "",
      soldeDgdHtCents: totals.soldeDgdHtCents.toString(),
    },
  });

  await auditDgd(user.id, "DGD_SUBMITTED", data.dgdId, {
    soldeDgdHtCents: totals.soldeDgdHtCents.toString(),
  });
  revalidateDgd(data.projectId, member.organizationId);
}

// ─── MOE Analysis ────────────────────────────────────────────────────────────

const MoeAnalyzeDgdSchema = z.object({
  dgdId: z.string().uuid(),
  projectId: z.string().uuid(),
  decision: z.enum(["ACCEPT", "MODIFY", "REJECT"]),
  comment: z.string().min(1, "Un commentaire est obligatoire."),
  adjustedSoldeHtCents: z.number().int().optional().nullable(),
});

/**
 * MOE analyzes the DGD:
 * - ACCEPT: forward to MOA as-is → PENDING_MOA
 * - MODIFY: adjust the solde and forward → PENDING_MOA
 * - REJECT: send back to ENTREPRISE → DRAFT
 */
export async function moeAnalyzeDgdAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = MoeAnalyzeDgdSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  if (data.decision === "MODIFY" && (data.adjustedSoldeHtCents === null || data.adjustedSoldeHtCents === undefined)) {
    throw new Error("Le montant ajusté est obligatoire pour une modification.");
  }

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.REVIEW_DGD_MOE);
  if (!allowed) throw new Error("Permission refusée.");

  const dgd = await prisma.dgdRecord.findFirst({
    where: { id: data.dgdId, projectId: data.projectId },
  });
  if (!dgd) throw new Error("DGD introuvable.");
  if (dgd.status !== DgdStatus.PENDING_MOE) {
    throw new Error("Seuls les DGD en attente du MOE peuvent être analysés.");
  }

  const nextStatus = data.decision === "REJECT" ? DgdStatus.DRAFT : DgdStatus.PENDING_MOA;
  const adjustedSolde = data.decision === "MODIFY" && data.adjustedSoldeHtCents != null
    ? BigInt(data.adjustedSoldeHtCents)
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.dgdRecord.update({
      where: { id: data.dgdId },
      data: {
        status: nextStatus,
        moeComment: data.comment,
        moeAdjustedSoldeHtCents: adjustedSolde,
        moeReviewedAt: new Date(),
        moeReviewedByMemberId: member.id,
        // On rejection, clear submission fields so ENTREPRISE can re-submit
        ...(data.decision === "REJECT" ? {
          submittedAt: null,
          submittedByMemberId: null,
        } : {}),
      },
    });

    await tx.dgdReview.create({
      data: {
        dgdRecordId: data.dgdId,
        memberId: member.id,
        eventType: "MOE_REVIEWED",
        decision: data.decision,
        comment: data.comment,
        adjustedSoldeCents: adjustedSolde,
      },
    });
  });

  await inngest.send({
    name: "dgd/moe-reviewed",
    data: {
      projectId: data.projectId,
      dgdId: data.dgdId,
      organizationId: dgd.organizationId,
      decision: data.decision,
      comment: data.comment,
    },
  });

  await auditDgd(user.id, `DGD_MOE_${data.decision}`, data.dgdId, {
    decision: data.decision,
    comment: data.comment,
    adjustedSolde: adjustedSolde?.toString() ?? null,
  });
  revalidateDgd(data.projectId, dgd.organizationId);
}

// ─── MOA Validation ──────────────────────────────────────────────────────────

const MoaValidateDgdSchema = z.object({
  dgdId: z.string().uuid(),
  projectId: z.string().uuid(),
  decision: z.enum(["APPROVE", "REJECT"]),
  comment: z.string().optional().nullable(),
});

/**
 * MOA validates the DGD:
 * - APPROVE: DGD is officially signed → APPROVED, dispute deadline set
 * - REJECT: send back to MOE for re-analysis → PENDING_MOE
 */
export async function moaValidateDgdAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = MoaValidateDgdSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  if (data.decision === "REJECT" && !data.comment?.trim()) {
    throw new Error("Un commentaire est obligatoire en cas de rejet.");
  }

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.VALIDATE_DGD_MOA);
  if (!allowed) throw new Error("Permission refusée.");

  const dgd = await prisma.dgdRecord.findFirst({
    where: { id: data.dgdId, projectId: data.projectId },
  });
  if (!dgd) throw new Error("DGD introuvable.");
  if (dgd.status !== DgdStatus.PENDING_MOA) {
    throw new Error("Seuls les DGD en attente du MOA peuvent être validés.");
  }

  const now = new Date();

  if (data.decision === "APPROVE") {
    const disputeDeadline = new Date(now.getTime() + DISPUTE_DEADLINE_DAYS * 24 * 60 * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      await tx.dgdRecord.update({
        where: { id: data.dgdId },
        data: {
          status: DgdStatus.APPROVED,
          moaComment: data.comment ?? null,
          moaValidatedAt: now,
          moaValidatedByMemberId: member.id,
          disputeDeadline,
        },
      });

      await tx.dgdReview.create({
        data: {
          dgdRecordId: data.dgdId,
          memberId: member.id,
          eventType: "MOA_VALIDATED",
          decision: "APPROVE",
          comment: data.comment ?? null,
        },
      });
    });

    await inngest.send({
      name: "dgd/approved",
      data: {
        projectId: data.projectId,
        dgdId: data.dgdId,
        organizationId: dgd.organizationId,
        disputeDeadline: disputeDeadline.toISOString(),
      },
    });
  } else {
    // REJECT → back to PENDING_MOE
    await prisma.$transaction(async (tx) => {
      await tx.dgdRecord.update({
        where: { id: data.dgdId },
        data: {
          status: DgdStatus.PENDING_MOE,
          moaComment: data.comment ?? null,
          moaValidatedAt: now,
          moaValidatedByMemberId: member.id,
          // Clear MOE review so they re-analyze
          moeComment: null,
          moeAdjustedSoldeHtCents: null,
          moeReviewedAt: null,
          moeReviewedByMemberId: null,
        },
      });

      await tx.dgdReview.create({
        data: {
          dgdRecordId: data.dgdId,
          memberId: member.id,
          eventType: "MOA_VALIDATED",
          decision: "REJECT",
          comment: data.comment ?? null,
        },
      });
    });

    await inngest.send({
      name: "dgd/moa-rejected",
      data: {
        projectId: data.projectId,
        dgdId: data.dgdId,
        organizationId: dgd.organizationId,
        comment: data.comment ?? "",
      },
    });
  }

  await auditDgd(user.id, `DGD_MOA_${data.decision}`, data.dgdId, {
    decision: data.decision,
    comment: data.comment,
  });
  revalidateDgd(data.projectId, dgd.organizationId);
}

// ─── Contest (Dispute) ───────────────────────────────────────────────────────

const ContestDgdSchema = z.object({
  dgdId: z.string().uuid(),
  projectId: z.string().uuid(),
  justification: z.string().min(10, "La justification doit comporter au moins 10 caractères."),
  disputeDocumentUrl: z.string().optional().nullable(),
  disputeDocumentName: z.string().optional().nullable(),
});

/**
 * ENTREPRISE contests the DGD within the legal dispute deadline (30 days).
 * Uploads a Mémoire en réclamation.
 */
export async function contestDgdAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = ContestDgdSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.CONTEST_DGD);
  if (!allowed) throw new Error("Permission refusée.");

  if (member.role !== ProjectRole.ENTREPRISE) {
    throw new Error("Seules les entreprises peuvent contester un DGD.");
  }

  const dgd = await prisma.dgdRecord.findFirst({
    where: { id: data.dgdId, projectId: data.projectId, organizationId: member.organizationId },
  });
  if (!dgd) throw new Error("DGD introuvable.");
  if (dgd.status !== DgdStatus.APPROVED) {
    throw new Error("Seuls les DGD approuvés peuvent être contestés.");
  }

  // Check the dispute deadline
  if (dgd.disputeDeadline && new Date() > dgd.disputeDeadline) {
    throw new Error("Le délai de contestation est expiré. Le DGD est définitif.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.dgdRecord.update({
      where: { id: data.dgdId },
      data: {
        status: DgdStatus.DISPUTED,
        disputedAt: new Date(),
        disputeJustification: data.justification,
        ...(data.disputeDocumentUrl ? {
          disputeDocumentUrl: data.disputeDocumentUrl,
          disputeDocumentName: data.disputeDocumentName ?? null,
        } : {}),
      },
    });

    await tx.dgdReview.create({
      data: {
        dgdRecordId: data.dgdId,
        memberId: member.id,
        eventType: "DISPUTED",
        decision: "CONTESTED",
        comment: data.justification,
      },
    });
  });

  await inngest.send({
    name: "dgd/disputed",
    data: {
      projectId: data.projectId,
      dgdId: data.dgdId,
      organizationId: member.organizationId,
      justification: data.justification,
    },
  });

  await auditDgd(user.id, "DGD_CONTESTED", data.dgdId, { justification: data.justification });
  revalidateDgd(data.projectId, member.organizationId);
}

// ─── Resolve Amicably ────────────────────────────────────────────────────────

const ResolveAmicablySchema = z.object({
  dgdId: z.string().uuid(),
  projectId: z.string().uuid(),
  adjustedSoldeHtCents: z.number().int(),
  comment: z.string().min(1, "Un commentaire est obligatoire."),
  amicableDocumentUrl: z.string().optional().nullable(),
  amicableDocumentName: z.string().optional().nullable(),
});

/**
 * MOA resolves the dispute amicably — negotiates a new solde and uploads the
 * signed settlement agreement (Protocole d'accord transactionnel).
 * Restricted to MOA: only the project owner can formally close a dispute.
 */
export async function resolveAmicablyAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = ResolveAmicablySchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.VALIDATE_DGD_MOA);
  if (!allowed) throw new Error("Permission refusée. Seul le MOA peut formaliser une résolution amiable.");

  const dgd = await prisma.dgdRecord.findFirst({
    where: { id: data.dgdId, projectId: data.projectId },
  });
  if (!dgd) throw new Error("DGD introuvable.");
  if (dgd.status !== DgdStatus.DISPUTED) {
    throw new Error("Seuls les DGD en réclamation peuvent être résolus à l'amiable.");
  }

  const adjustedSolde = BigInt(data.adjustedSoldeHtCents);

  await prisma.$transaction(async (tx) => {
    // Re-check status inside the transaction to guard against concurrent submissions.
    const current = await tx.dgdRecord.findUnique({
      where: { id: data.dgdId },
      select: { status: true },
    });
    if (!current || current.status !== DgdStatus.DISPUTED) {
      throw new Error("Ce DGD a déjà été résolu. Veuillez rafraîchir la page.");
    }

    await tx.dgdRecord.update({
      where: { id: data.dgdId },
      data: {
        status: DgdStatus.RESOLVED_AMICABLY,
        amicableComment: data.comment,
        amicableAdjustedSoldeHtCents: adjustedSolde,
        amicableResolvedAt: new Date(),
        ...(data.amicableDocumentUrl ? {
          amicableDocumentUrl: data.amicableDocumentUrl,
          amicableDocumentName: data.amicableDocumentName ?? null,
        } : {}),
      },
    });

    await tx.dgdReview.create({
      data: {
        dgdRecordId: data.dgdId,
        memberId: member.id,
        eventType: "RESOLVED_AMICABLY",
        decision: "RESOLVED",
        comment: data.comment,
        adjustedSoldeCents: adjustedSolde,
      },
    });
  });

  await inngest.send({
    name: "dgd/resolved-amicably",
    data: {
      projectId: data.projectId,
      dgdId: data.dgdId,
      organizationId: dgd.organizationId,
      adjustedSoldeHtCents: adjustedSolde.toString(),
    },
  });

  await auditDgd(user.id, "DGD_RESOLVED_AMICABLY", data.dgdId, {
    adjustedSolde: adjustedSolde.toString(),
    comment: data.comment,
  });
  revalidateDgd(data.projectId, dgd.organizationId);
}

// ─── Declare In Litigation ───────────────────────────────────────────────────

const DeclareInLitigationSchema = z.object({
  dgdId: z.string().uuid(),
  projectId: z.string().uuid(),
  comment: z.string().min(1, "Un commentaire justificatif est obligatoire."),
});

/**
 * MOA declares that negotiations failed and the dispute moves to litigation.
 * This freezes the DGD — no further standard edits possible.
 */
export async function declareInLitigationAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = DeclareInLitigationSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.VALIDATE_DGD_MOA);
  if (!allowed) throw new Error("Permission refusée. Seul le MOA peut déclarer un contentieux.");

  const dgd = await prisma.dgdRecord.findFirst({
    where: { id: data.dgdId, projectId: data.projectId },
  });
  if (!dgd) throw new Error("DGD introuvable.");
  if (dgd.status !== DgdStatus.DISPUTED) {
    throw new Error("Seuls les DGD en réclamation peuvent passer en contentieux.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.dgdRecord.update({
      where: { id: data.dgdId },
      data: {
        status: DgdStatus.IN_LITIGATION,
        litigationDeclaredAt: new Date(),
        litigationComment: data.comment,
      },
    });

    await tx.dgdReview.create({
      data: {
        dgdRecordId: data.dgdId,
        memberId: member.id,
        eventType: "IN_LITIGATION",
        decision: "LITIGATION_DECLARED",
        comment: data.comment,
      },
    });
  });

  await inngest.send({
    name: "dgd/in-litigation",
    data: {
      projectId: data.projectId,
      dgdId: data.dgdId,
      organizationId: dgd.organizationId,
      comment: data.comment,
    },
  });

  await auditDgd(user.id, "DGD_IN_LITIGATION", data.dgdId, { comment: data.comment });
  revalidateDgd(data.projectId, dgd.organizationId);
}

// ─── Resolve By Court ────────────────────────────────────────────────────────

const ResolveByCourtSchema = z.object({
  dgdId: z.string().uuid(),
  projectId: z.string().uuid(),
  courtSoldeHtCents: z.number().int(),
  comment: z.string().min(1, "Un commentaire est obligatoire."),
  courtDocumentUrl: z.string().optional().nullable(),
  courtDocumentName: z.string().optional().nullable(),
});

/**
 * MOA inputs the court-mandated final balance and uploads the court ruling (Jugement).
 * Permanently closes the contract.
 */
export async function resolveByCourtAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = ResolveByCourtSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.VALIDATE_DGD_MOA);
  if (!allowed) throw new Error("Permission refusée. Seul le MOA peut enregistrer une décision de justice.");

  const dgd = await prisma.dgdRecord.findFirst({
    where: { id: data.dgdId, projectId: data.projectId },
  });
  if (!dgd) throw new Error("DGD introuvable.");
  if (dgd.status !== DgdStatus.IN_LITIGATION) {
    throw new Error("Seuls les DGD en contentieux peuvent être clôturés par décision de justice.");
  }

  const courtSolde = BigInt(data.courtSoldeHtCents);

  await prisma.$transaction(async (tx) => {
    await tx.dgdRecord.update({
      where: { id: data.dgdId },
      data: {
        status: DgdStatus.RESOLVED_BY_COURT,
        courtSoldeHtCents: courtSolde,
        courtResolvedAt: new Date(),
        ...(data.courtDocumentUrl ? {
          courtDocumentUrl: data.courtDocumentUrl,
          courtDocumentName: data.courtDocumentName ?? null,
        } : {}),
      },
    });

    await tx.dgdReview.create({
      data: {
        dgdRecordId: data.dgdId,
        memberId: member.id,
        eventType: "RESOLVED_BY_COURT",
        decision: "COURT_RULING",
        comment: data.comment,
        adjustedSoldeCents: courtSolde,
      },
    });
  });

  await inngest.send({
    name: "dgd/resolved-by-court",
    data: {
      projectId: data.projectId,
      dgdId: data.dgdId,
      organizationId: dgd.organizationId,
      courtSoldeHtCents: courtSolde.toString(),
    },
  });

  await auditDgd(user.id, "DGD_RESOLVED_BY_COURT", data.dgdId, {
    courtSolde: courtSolde.toString(),
    comment: data.comment,
  });
  revalidateDgd(data.projectId, dgd.organizationId);
}

// ─── Document Upload ──────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = ["application/pdf", "image/png", "image/jpeg"];
const MAX_SIZE_BYTES = 20 * 1024 * 1024;

/**
 * Upload a DGD document (mémoire en réclamation, protocole d'accord, jugement).
 * Any project member with a DGD capability may upload; the mutation action
 * enforces the business-level permission.
 */
export async function uploadDgdDocumentAction(
  formData: FormData
): Promise<{ path: string; name: string }> {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const projectId = formData.get("projectId") as string;
  const dgdId = formData.get("dgdId") as string;
  if (!projectId || !dgdId) throw new Error("Paramètres manquants.");

  const member = await requireProjectMember(user.id, projectId);

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Aucun fichier fourni.");
  if (file.size > MAX_SIZE_BYTES) throw new Error("Fichier trop volumineux (20 Mo max).");
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error("Format non autorisé. Formats acceptés : PDF, PNG, JPEG.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const header = buffer.subarray(0, 12);
  if (!validateFileMagicNumber(header, file.type, file.name)) {
    throw new Error("Le fichier ne correspond pas à son type déclaré.");
  }

  const storagePrefix = `dgd/${projectId}/${member.organizationId}`;
  const { path } = await uploadFtmDocument(storagePrefix, buffer, file.name, file.type);
  return { path, name: file.name };
}

// ─── Get Signed Document URL ─────────────────────────────────────────────────

import { getFtmDocumentUrl } from "@/lib/storage";

/**
 * Generate a short-lived signed URL for a DGD document.
 * Path must belong to this project to prevent cross-project document access.
 */
export async function getDgdDocumentSignedUrlAction(
  projectId: string,
  path: string
): Promise<string> {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  await requireProjectMember(user.id, projectId);
  if (!path.startsWith(`dgd/${projectId}/`)) {
    throw new Error("Chemin de document invalide.");
  }
  return getFtmDocumentUrl(path);
}
