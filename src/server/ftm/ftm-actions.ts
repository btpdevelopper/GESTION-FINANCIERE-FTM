"use server";

import { revalidatePath } from "next/cache";
import { randomBytes, createHash } from "crypto";
import {
  CreationMoeDecision,
  FtmPhase,
  MoaEtudesDecision,
  ProjectRole,
  ReviewContext,
  ReviewDecision,
  DeclineScope,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/user";
import { requireProjectMember } from "@/server/membership";
import { can } from "@/lib/permissions/resolve";
import { Capability } from "@prisma/client";
import { sendInvitationEmail } from "@/lib/email";

async function audit(userId: string | undefined, action: string, entity: string, entityId?: string, payload?: object) {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      entity,
      entityId,
      payload: payload as object | undefined,
    },
  });
}

export async function createFtmAction(input: {
  projectId: string;
  title: string;
  modificationSource: "MOA" | "MOE" | "ALEAS_EXECUTION";
  concernedOrgIds: string[];
  lots: { lotLabel?: string; descriptionTravaux: string; organizationId: string }[];
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, input.projectId);
  const ok = await can(pm.id, Capability.CREATE_FTM);
  if (!ok) throw new Error("Droit insuffisant pour créer un FTM.");

  const initiatorRole = pm.role;
  if (initiatorRole === ProjectRole.ENTREPRISE) {
    if (!input.concernedOrgIds.includes(pm.organizationId)) {
      throw new Error("Votre entreprise doit figurer parmi les entreprises concernées.");
    }
    if (!input.lots.some((l) => l.organizationId === pm.organizationId)) {
      throw new Error("Ajoutez un lot correspondant à votre entreprise.");
    }
  }

  const skipGate = initiatorRole === ProjectRole.MOE || initiatorRole === ProjectRole.MOA;

  const ftm = await prisma.$transaction(async (tx) => {
    const record = await tx.ftmRecord.create({
      data: {
        projectId: input.projectId,
        title: input.title,
        modificationSource: input.modificationSource,
        initiatorProjectMemberId: pm.id,
        phase: skipGate ? FtmPhase.ETUDES : FtmPhase.CREATION,
        creationMoeDecision: skipGate ? CreationMoeDecision.APPROVED : CreationMoeDecision.PENDING,
        creationMoeDecidedAt: skipGate ? new Date() : null,
        creationMoeDecidedById: skipGate ? pm.id : null,
      },
    });

    for (const orgId of input.concernedOrgIds) {
      await tx.ftmConcernedOrganization.create({
        data: { ftmId: record.id, organizationId: orgId },
      });
    }

    for (const lot of input.lots) {
      await tx.ftmLot.create({
        data: {
          ftmId: record.id,
          organizationId: lot.organizationId,
          lotLabel: lot.lotLabel ?? null,
          descriptionTravaux: lot.descriptionTravaux,
        },
      });
    }

    return record;
  });

  await audit(user.id, "FTM_CREATE", "FtmRecord", ftm.id, { title: input.title });
  revalidatePath(`/projects/${input.projectId}`);
  revalidatePath(`/projects/${input.projectId}/ftms`);
  return ftm;
}

export async function moeDecideCreationAction(input: {
  projectId: string;
  ftmId: string;
  decision: "APPROVED" | "DECLINED";
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, input.projectId);
  if (pm.role !== ProjectRole.MOE) throw new Error("Seul le MOE peut valider la création.");
  const ok = await can(pm.id, Capability.APPROVE_FTM_CREATION_MOE);
  if (!ok) throw new Error("Droit insuffisant.");

  const ftm = await prisma.ftmRecord.findFirst({
    where: { id: input.ftmId, projectId: input.projectId },
  });
  if (!ftm || ftm.phase !== FtmPhase.CREATION) throw new Error("FTM invalide.");

  const nextPhase =
    input.decision === "APPROVED" ? FtmPhase.ETUDES : FtmPhase.CANCELLED;
  const decision =
    input.decision === "APPROVED" ? CreationMoeDecision.APPROVED : CreationMoeDecision.DECLINED;

  await prisma.ftmRecord.update({
    where: { id: input.ftmId },
    data: {
      phase: nextPhase,
      creationMoeDecision: decision,
      creationMoeDecidedById: pm.id,
      creationMoeDecidedAt: new Date(),
    },
  });

  await audit(user.id, "FTM_CREATION_MOE", "FtmRecord", input.ftmId, input);
  revalidatePath(`/projects/${input.projectId}/ftms/${input.ftmId}`);
  return { ok: true };
}

export async function saveEtudesAction(input: {
  projectId: string;
  ftmId: string;
  etudesDescription: string;
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, input.projectId);
  if (pm.role !== ProjectRole.MOE && pm.role !== ProjectRole.MOA) throw new Error("Réservé MOE/MOA.");
  const ok = await can(pm.id, Capability.EDIT_ETUDES);
  if (!ok) throw new Error("Droit insuffisant.");

  await prisma.ftmRecord.update({
    where: { id: input.ftmId, projectId: input.projectId },
    data: { etudesDescription: input.etudesDescription },
  });
  await audit(user.id, "FTM_ETUDES_SAVE", "FtmRecord", input.ftmId);
  revalidatePath(`/projects/${input.projectId}/ftms/${input.ftmId}`);
  return { ok: true };
}

export async function inviteEtudesParticipantAction(input: {
  projectId: string;
  ftmId: string;
  email: string;
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, input.projectId);
  const ok = await can(pm.id, Capability.INVITE_ETUDES_PARTICIPANT);
  if (!ok) throw new Error("Droit insuffisant.");

  const raw = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(raw).digest("hex");
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

  const existingUser = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });

  await prisma.ftmParticipantInvitation.create({
    data: {
      ftmId: input.ftmId,
      email: input.email.toLowerCase(),
      userId: existingUser?.id,
      tokenHash,
      expiresAt,
    },
  });

  await audit(user.id, "FTM_INVITE_ETUDES", "FtmParticipantInvitation", input.ftmId, {
    email: input.email,
  });

  // Envoyer l'email avec le token généré
  await sendInvitationEmail(input.email, raw, input.projectId, input.ftmId).catch((err) => {
    console.error("Non bloquant: Erreur lors de l'envoi d'email 72h:", err);
  });

  revalidatePath(`/projects/${input.projectId}/ftms/${input.ftmId}`);
  return { token: raw, expiresAt };
}

export async function moaDecideEtudesAction(input: {
  projectId: string;
  ftmId: string;
  decision: "APPROVED" | "DECLINED";
  comment?: string;
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, input.projectId);
  if (pm.role !== ProjectRole.MOA) throw new Error("Réservé MOA.");
  const ok = await can(pm.id, Capability.VALIDATE_ETUDES_MOA);
  if (!ok) throw new Error("Droit insuffisant.");

  const ftm = await prisma.ftmRecord.findFirst({
    where: { id: input.ftmId, projectId: input.projectId, phase: FtmPhase.ETUDES },
  });
  if (!ftm) throw new Error("FTM introuvable ou phase incorrecte.");

  const decision =
    input.decision === "APPROVED" ? MoaEtudesDecision.APPROVED : MoaEtudesDecision.DECLINED;
  const phase = input.decision === "APPROVED" ? FtmPhase.ETUDES : FtmPhase.CANCELLED;

  await prisma.ftmRecord.update({
    where: { id: input.ftmId },
    data: {
      moaEtudesDecision: decision,
      moaEtudesDecidedById: pm.id,
      moaEtudesDecidedAt: new Date(),
      moaEtudesComment: input.comment ?? null,
      phase,
    },
  });

  await audit(user.id, "FTM_MOA_ETUDES", "FtmRecord", input.ftmId, input);
  revalidatePath(`/projects/${input.projectId}/ftms/${input.ftmId}`);
  return { ok: true };
}

export async function setDeadlinesAndOpenQuotingAction(input: {
  projectId: string;
  ftmId: string;
  deadlines: { organizationId: string; dateLimiteDevis: string }[];
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, input.projectId);
  if (pm.role !== ProjectRole.MOE && pm.role !== ProjectRole.MOA) throw new Error("Réservé MOE/MOA.");
  const ok =
    (await can(pm.id, Capability.SET_DEADLINES_AFTER_ETUDES)) ||
    (await can(pm.id, Capability.VALIDATE_ETUDES_MOA));
  if (!ok) throw new Error("Droit insuffisant.");

  const ftm = await prisma.ftmRecord.findFirst({
    where: {
      id: input.ftmId,
      projectId: input.projectId,
      phase: FtmPhase.ETUDES,
      moaEtudesDecision: MoaEtudesDecision.APPROVED,
    },
  });
  if (!ftm) throw new Error("Les études doivent être approuvées par le MOA.");

  await prisma.$transaction(async (tx) => {
    for (const d of input.deadlines) {
      await tx.ftmConcernedOrganization.updateMany({
        where: { ftmId: input.ftmId, organizationId: d.organizationId },
        data: { dateLimiteDevis: new Date(d.dateLimiteDevis) },
      });
    }
    await tx.ftmRecord.update({
      where: { id: input.ftmId },
      data: { phase: FtmPhase.QUOTING },
    });
  });

  await audit(user.id, "FTM_OPEN_QUOTING", "FtmRecord", input.ftmId);
  revalidatePath(`/projects/${input.projectId}/ftms/${input.ftmId}`);
  return { ok: true };
}

export async function postFtmChatAction(input: {
  projectId: string;
  ftmId: string;
  body: string;
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, input.projectId);
  const ok = await can(pm.id, Capability.POST_FTM_CHAT);
  if (!ok) throw new Error("Droit insuffisant.");

  await prisma.ftmChatMessage.create({
    data: {
      ftmId: input.ftmId,
      authorProjectMemberId: pm.id,
      body: input.body,
    },
  });
  revalidatePath(`/projects/${input.projectId}/ftms/${input.ftmId}`);
  return { ok: true };
}

export async function submitQuoteAction(input: {
  projectId: string;
  ftmId: string;
  ftmLotId: string;
  organizationId: string;
  amountHt: string;
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, input.projectId);
  if (pm.organizationId !== input.organizationId) throw new Error("Organisation incorrecte.");
  const ok = await can(pm.id, Capability.SUBMIT_QUOTE);
  if (!ok) throw new Error("Droit insuffisant.");

  const ftm = await prisma.ftmRecord.findFirst({
    where: { id: input.ftmId, projectId: input.projectId, phase: { in: [FtmPhase.QUOTING, FtmPhase.ANALYSIS] } },
  });
  if (!ftm) throw new Error("Soumission impossible à cette phase.");

  const lot = await prisma.ftmLot.findFirst({
    where: {
      id: input.ftmLotId,
      ftmId: input.ftmId,
      organizationId: input.organizationId,
    },
  });
  if (!lot) throw new Error("Lot / entreprise incohérents.");

  const last = await prisma.ftmQuoteSubmission.findFirst({
    where: { ftmLotId: input.ftmLotId, organizationId: input.organizationId },
    orderBy: { indice: "desc" },
  });
  const indice = (last?.indice ?? 0) + 1;

  const submission = await prisma.$transaction(async (tx) => {
    const sub = await tx.ftmQuoteSubmission.create({
      data: {
        ftmId: input.ftmId,
        ftmLotId: input.ftmLotId,
        organizationId: input.organizationId,
        indice,
        amountHt: input.amountHt,
      },
    });
    await tx.ftmRecord.update({
      where: { id: input.ftmId },
      data: { phase: FtmPhase.ANALYSIS },
    });
    return sub;
  });

  await audit(user.id, "FTM_QUOTE_SUBMIT", "FtmQuoteSubmission", submission.id);
  revalidatePath(`/projects/${input.projectId}/ftms/${input.ftmId}`);
  return submission;
}

export async function moeAnalyzeQuoteAction(input: {
  projectId: string;
  ftmId: string;
  quoteSubmissionId: string;
  decision: "ACCEPT" | "RESEND_CORRECTION" | "DECLINE";
  comment: string;
  declineScope?: "WHOLE_FTM" | "THIS_COMPANY_ONLY";
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, input.projectId);
  if (pm.role !== ProjectRole.MOE) throw new Error("Réservé MOE.");
  const ok = await can(pm.id, Capability.ANALYZE_QUOTE_MOE);
  if (!ok) throw new Error("Droit insuffisant.");

  const sub = await prisma.ftmQuoteSubmission.findFirst({
    where: { id: input.quoteSubmissionId, ftmId: input.ftmId },
  });
  if (!sub) throw new Error("Devis introuvable.");

  const decision =
    input.decision === "ACCEPT"
      ? ReviewDecision.ACCEPT
      : input.decision === "RESEND_CORRECTION"
        ? ReviewDecision.RESEND_CORRECTION
        : ReviewDecision.DECLINE;

  await prisma.$transaction(async (tx) => {
    await tx.ftmReview.create({
      data: {
        quoteSubmissionId: sub.id,
        context: ReviewContext.MOE_ANALYSIS,
        reviewerProjectMemberId: pm.id,
        decision,
        comment: input.comment,
        declineScope:
          decision === ReviewDecision.DECLINE && input.declineScope
            ? input.declineScope === "WHOLE_FTM"
              ? DeclineScope.WHOLE_FTM
              : DeclineScope.THIS_COMPANY_ONLY
            : null,
      },
    });

    if (decision === ReviewDecision.ACCEPT) {
      await tx.ftmRecord.update({
        where: { id: input.ftmId },
        data: { phase: FtmPhase.MOA_FINAL },
      });
    } else if (decision === ReviewDecision.RESEND_CORRECTION) {
      await tx.ftmRecord.update({
        where: { id: input.ftmId },
        data: { phase: FtmPhase.QUOTING },
      });
    } else if (decision === ReviewDecision.DECLINE) {
      if (input.declineScope === "WHOLE_FTM") {
        await tx.ftmRecord.update({
          where: { id: input.ftmId },
          data: { phase: FtmPhase.CANCELLED },
        });
      } else {
        await tx.ftmConcernedOrganization.deleteMany({
          where: { ftmId: input.ftmId, organizationId: sub.organizationId },
        });
        await tx.ftmRecord.update({
          where: { id: input.ftmId },
          data: { phase: FtmPhase.QUOTING },
        });
      }
    }
  });

  await audit(user.id, "FTM_MOE_ANALYSIS", "FtmReview", input.quoteSubmissionId, input);
  revalidatePath(`/projects/${input.projectId}/ftms/${input.ftmId}`);
  return { ok: true };
}

export async function moaFinalQuoteAction(input: {
  projectId: string;
  ftmId: string;
  quoteSubmissionId: string;
  decision: "ACCEPT" | "RESEND_CORRECTION" | "DECLINE";
  comment: string;
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, input.projectId);
  if (pm.role !== ProjectRole.MOA) throw new Error("Réservé MOA.");
  const ok = await can(pm.id, Capability.FINAL_VALIDATE_QUOTE_MOA);
  if (!ok) throw new Error("Droit insuffisant.");

  const sub = await prisma.ftmQuoteSubmission.findFirst({
    where: { id: input.quoteSubmissionId, ftmId: input.ftmId },
  });
  if (!sub) throw new Error("Devis introuvable.");

  const decision =
    input.decision === "ACCEPT"
      ? ReviewDecision.ACCEPT
      : input.decision === "RESEND_CORRECTION"
        ? ReviewDecision.RESEND_CORRECTION
        : ReviewDecision.DECLINE;

  await prisma.$transaction(async (tx) => {
    await tx.ftmReview.create({
      data: {
        quoteSubmissionId: sub.id,
        context: ReviewContext.MOA_FINAL_QUOTE,
        reviewerProjectMemberId: pm.id,
        decision,
        comment: input.comment,
      },
    });
    if (decision === ReviewDecision.ACCEPT) {
      await tx.ftmRecord.update({
        where: { id: input.ftmId },
        data: { phase: FtmPhase.ACCEPTED },
      });
    } else if (decision === ReviewDecision.RESEND_CORRECTION) {
      await tx.ftmRecord.update({
        where: { id: input.ftmId },
        data: { phase: FtmPhase.QUOTING },
      });
    } else {
      await tx.ftmRecord.update({
        where: { id: input.ftmId },
        data: { phase: FtmPhase.CANCELLED },
      });
    }
  });

  await audit(user.id, "FTM_MOA_FINAL", "FtmReview", input.quoteSubmissionId, input);
  revalidatePath(`/projects/${input.projectId}/ftms/${input.ftmId}`);
  return { ok: true };
}

export async function setDesignatedMoaValidatorAction(input: {
  projectId: string;
  ftmId: string;
  designatedMoaValidatorId: string | null;
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, input.projectId);
  const ok = await can(pm.id, Capability.ADMIN_PROJECT_PERMISSIONS);
  if (!ok) throw new Error("Droit insuffisant (administration projet).");

  await prisma.ftmRecord.update({
    where: { id: input.ftmId, projectId: input.projectId },
    data: { designatedMoaValidatorId: input.designatedMoaValidatorId },
  });
  revalidatePath(`/projects/${input.projectId}/ftms/${input.ftmId}`);
  return { ok: true };
}
