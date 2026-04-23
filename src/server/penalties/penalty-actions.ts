"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Capability, PenaltyStatus, ProjectRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/user";
import { requireProjectMember } from "@/server/membership";
import { can } from "@/lib/permissions/resolve";
import {
  computePenaltyFrozenAmount,
  canCancelPenalty,
  isPenaltyContestable,
  canMaintainPenalty,
} from "@/lib/penalties/calculations";
import { getOrgMarcheTotalCents, getOrgApprovedFtmTotalCents, getOrgActivePenaltiesTotalCents } from "@/server/situations/situation-queries";

function revalidatePenalties(projectId: string, orgId?: string) {
  revalidatePath(`/projects/${projectId}/penalties`);
  if (orgId) revalidatePath(`/projects/${projectId}/penalties/${orgId}`);
  revalidatePath(`/projects/${projectId}`);
}

async function auditPenalty(userId: string | undefined, action: string, penaltyId: string, payload?: object) {
  await prisma.auditLog.create({
    data: { userId, action, entity: "Penalty", entityId: penaltyId, payload },
  });
}

// ─── Create ──────────────────────────────────────────────────────────────────

const CreatePenaltySchema = z.object({
  projectId: z.string().uuid(),
  organizationId: z.string().uuid(),
  label: z.string().min(1).max(200),
  justification: z.string().min(1, "La justification est obligatoire."),
  amountType: z.enum(["FIXED", "PCT_BASE_MARCHE", "PCT_ACTUAL_MARCHE"]),
  // For FIXED: amount in cents. For PCT: percentage × 100 (e.g. 5% → 500).
  inputValue: z.number().int().min(1, "La valeur doit être supérieure à 0."),
  applicationTarget: z.enum(["SITUATION", "DGD"]).default("SITUATION"),
  situationId: z.string().uuid().optional().nullable(),
});

export async function createPenaltyAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = CreatePenaltySchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.CREATE_PENALTY);
  if (!allowed) throw new Error("Permission refusée.");

  if (data.applicationTarget === "SITUATION" && data.situationId) {
    const situation = await prisma.situationTravaux.findFirst({
      where: { id: data.situationId, projectId: data.projectId, organizationId: data.organizationId },
    });
    if (!situation) throw new Error("Situation introuvable ou non éligible.");
    if (situation.status === "MOA_APPROVED") throw new Error("Cette situation est déjà validée.");
  }

  const penalty = await prisma.penalty.create({
    data: {
      projectId: data.projectId,
      organizationId: data.organizationId,
      label: data.label,
      justification: data.justification,
      amountType: data.amountType,
      inputValue: BigInt(data.inputValue),
      applicationTarget: data.applicationTarget,
      situationId: data.applicationTarget === "SITUATION" ? (data.situationId ?? null) : null,
      status: PenaltyStatus.DRAFT,
      createdByMemberId: member.id,
    },
  });

  await auditPenalty(user.id, "PENALTY_CREATED", penalty.id, {
    label: data.label,
    amountType: data.amountType,
    inputValue: data.inputValue,
  });
  revalidatePenalties(data.projectId, data.organizationId);
  return penalty.id;
}

// ─── Update draft ─────────────────────────────────────────────────────────────

const UpdatePenaltySchema = z.object({
  penaltyId: z.string().uuid(),
  projectId: z.string().uuid(),
  label: z.string().min(1).max(200),
  justification: z.string().min(1, "La justification est obligatoire."),
  amountType: z.enum(["FIXED", "PCT_BASE_MARCHE", "PCT_ACTUAL_MARCHE"]),
  inputValue: z.number().int().min(1),
  applicationTarget: z.enum(["SITUATION", "DGD"]).default("SITUATION"),
  situationId: z.string().uuid().optional().nullable(),
});

export async function updatePenaltyDraftAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = UpdatePenaltySchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.CREATE_PENALTY);
  if (!allowed) throw new Error("Permission refusée.");

  const penalty = await prisma.penalty.findFirst({
    where: { id: data.penaltyId, projectId: data.projectId },
  });
  if (!penalty) throw new Error("Pénalité introuvable.");
  if (penalty.status !== PenaltyStatus.DRAFT) throw new Error("Seuls les brouillons peuvent être modifiés.");

  if (data.applicationTarget === "SITUATION" && data.situationId) {
    const situation = await prisma.situationTravaux.findFirst({
      where: { id: data.situationId, projectId: data.projectId, organizationId: penalty.organizationId },
    });
    if (!situation) throw new Error("Situation introuvable ou non éligible.");
    if (situation.status === "MOA_APPROVED") throw new Error("Cette situation est déjà validée.");
  }

  await prisma.penalty.update({
    where: { id: data.penaltyId },
    data: {
      label: data.label,
      justification: data.justification,
      amountType: data.amountType,
      inputValue: BigInt(data.inputValue),
      applicationTarget: data.applicationTarget,
      situationId: data.applicationTarget === "SITUATION" ? (data.situationId ?? null) : null,
    },
  });

  revalidatePenalties(data.projectId, penalty.organizationId);
}

// ─── Submit ───────────────────────────────────────────────────────────────────

const SubmitPenaltySchema = z.object({
  penaltyId: z.string().uuid(),
  projectId: z.string().uuid(),
});

export async function submitPenaltyAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = SubmitPenaltySchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.CREATE_PENALTY);
  if (!allowed) throw new Error("Permission refusée.");

  const penalty = await prisma.penalty.findFirst({
    where: { id: data.penaltyId, projectId: data.projectId },
  });
  if (!penalty) throw new Error("Pénalité introuvable.");
  if (penalty.status !== PenaltyStatus.DRAFT) throw new Error("Seuls les brouillons peuvent être soumis.");

  // Freeze the amount at submission time using current marché, FTMs, and already-active penalties
  const [marcheCents, ftmCents, activePenaltiesCents] = await Promise.all([
    getOrgMarcheTotalCents(data.projectId, penalty.organizationId),
    getOrgApprovedFtmTotalCents(data.projectId, penalty.organizationId),
    getOrgActivePenaltiesTotalCents(data.projectId, penalty.organizationId),
  ]);
  const frozenAmount = computePenaltyFrozenAmount(
    penalty.amountType,
    penalty.inputValue,
    marcheCents,
    ftmCents,
    activePenaltiesCents,
  );

  await prisma.penalty.update({
    where: { id: data.penaltyId },
    data: {
      status: PenaltyStatus.SUBMITTED,
      frozenAmountCents: frozenAmount,
    },
  });

  await prisma.penaltyReview.create({
    data: {
      penaltyId: data.penaltyId,
      memberId: member.id,
      action: "SUBMITTED",
    },
  });

  await auditPenalty(user.id, "PENALTY_SUBMITTED", data.penaltyId, {
    frozenAmountCents: frozenAmount.toString(),
  });
  revalidatePenalties(data.projectId, penalty.organizationId);
}

// ─── MOA review ──────────────────────────────────────────────────────────────

const MoaReviewPenaltySchema = z.object({
  penaltyId: z.string().uuid(),
  projectId: z.string().uuid(),
  decision: z.enum(["APPROVED", "REFUSED"]),
  comment: z.string().optional().nullable(),
});

export async function moaReviewPenaltyAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = MoaReviewPenaltySchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  if (data.decision === "REFUSED" && !data.comment?.trim()) {
    throw new Error("Un commentaire est obligatoire en cas de refus.");
  }

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.VALIDATE_PENALTY_MOA);
  if (!allowed) throw new Error("Permission refusée.");

  const penalty = await prisma.penalty.findFirst({
    where: { id: data.penaltyId, projectId: data.projectId },
  });
  if (!penalty) throw new Error("Pénalité introuvable.");
  if (penalty.status !== PenaltyStatus.SUBMITTED) throw new Error("Seules les pénalités soumises peuvent être examinées par le MOA.");

  const nextStatus = data.decision === "APPROVED" ? PenaltyStatus.MOA_APPROVED : PenaltyStatus.MOA_REFUSED;

  await prisma.penalty.update({
    where: { id: data.penaltyId },
    data: { status: nextStatus },
  });

  await prisma.penaltyReview.create({
    data: {
      penaltyId: data.penaltyId,
      memberId: member.id,
      action: data.decision === "APPROVED" ? "MOA_APPROVED" : "MOA_REFUSED",
      comment: data.comment ?? null,
    },
  });

  // Revalidate situation page if linked (company will now see the penalty)
  if (penalty.situationId) {
    revalidatePath(`/projects/${data.projectId}/situations/${penalty.organizationId}/${penalty.situationId}`);
  }

  await auditPenalty(user.id, `PENALTY_MOA_${data.decision}`, data.penaltyId, { comment: data.comment });
  revalidatePenalties(data.projectId, penalty.organizationId);
}

// ─── Cancel ───────────────────────────────────────────────────────────────────

const CancelPenaltySchema = z.object({
  penaltyId: z.string().uuid(),
  projectId: z.string().uuid(),
  comment: z.string().optional().nullable(),
});

export async function cancelPenaltyAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = CancelPenaltySchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  const member = await requireProjectMember(user.id, data.projectId);
  const isMoa = await can(member.id, Capability.VALIDATE_PENALTY_MOA);
  const isMoe = await can(member.id, Capability.CREATE_PENALTY);
  if (!isMoa && !isMoe) throw new Error("Permission refusée.");

  const penalty = await prisma.penalty.findFirst({
    where: { id: data.penaltyId, projectId: data.projectId },
  });
  if (!penalty) throw new Error("Pénalité introuvable.");

  const actorRole: "MOE" | "MOA" = isMoa ? "MOA" : "MOE";
  if (!canCancelPenalty(penalty.status, actorRole)) {
    throw new Error("Cette pénalité ne peut pas être annulée dans son état actuel.");
  }

  await prisma.penalty.update({
    where: { id: data.penaltyId },
    data: { status: PenaltyStatus.CANCELLED },
  });

  await prisma.penaltyReview.create({
    data: {
      penaltyId: data.penaltyId,
      memberId: member.id,
      action: "CANCELLED",
      comment: data.comment ?? null,
    },
  });

  await auditPenalty(user.id, "PENALTY_CANCELLED", data.penaltyId, { comment: data.comment });
  revalidatePenalties(data.projectId, penalty.organizationId);
  if (penalty.situationId) {
    revalidatePath(`/projects/${data.projectId}/situations/${penalty.organizationId}/${penalty.situationId}`);
  }
}

// ─── Contest (ENTREPRISE) ─────────────────────────────────────────────────────

const ContestPenaltySchema = z.object({
  penaltyId: z.string().uuid(),
  projectId: z.string().uuid(),
  justification: z.string().min(10, "La justification de contestation doit comporter au moins 10 caractères."),
});

export async function contestPenaltyAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = ContestPenaltySchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.CONTEST_PENALTY);
  if (!allowed) throw new Error("Permission refusée.");

  if (member.role !== ProjectRole.ENTREPRISE) throw new Error("Seules les entreprises peuvent contester une pénalité.");

  const penalty = await prisma.penalty.findFirst({
    where: {
      id: data.penaltyId,
      projectId: data.projectId,
      organizationId: member.organizationId,
    },
  });
  if (!penalty) throw new Error("Pénalité introuvable.");
  if (!isPenaltyContestable(penalty.status)) throw new Error("Seules les pénalités approuvées peuvent être contestées.");

  await prisma.penalty.update({
    where: { id: data.penaltyId },
    data: { status: PenaltyStatus.CONTESTED },
  });

  await prisma.penaltyReview.create({
    data: {
      penaltyId: data.penaltyId,
      memberId: member.id,
      action: "CONTESTED",
      comment: data.justification,
    },
  });

  await auditPenalty(user.id, "PENALTY_CONTESTED", data.penaltyId, { justification: data.justification });
  revalidatePenalties(data.projectId, penalty.organizationId);
  if (penalty.situationId) {
    revalidatePath(`/projects/${data.projectId}/situations/${penalty.organizationId}/${penalty.situationId}`);
  }
}

// ─── Maintain (dismiss contest) ──────────────────────────────────────────────

const MaintainPenaltySchema = z.object({
  penaltyId: z.string().uuid(),
  projectId: z.string().uuid(),
  comment: z.string().optional().nullable(),
});

export async function maintainPenaltyAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = MaintainPenaltySchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  const member = await requireProjectMember(user.id, data.projectId);
  const isMoa = await can(member.id, Capability.VALIDATE_PENALTY_MOA);
  const isMoe = await can(member.id, Capability.CREATE_PENALTY);
  if (!isMoa && !isMoe) throw new Error("Permission refusée.");

  const penalty = await prisma.penalty.findFirst({
    where: { id: data.penaltyId, projectId: data.projectId },
  });
  if (!penalty) throw new Error("Pénalité introuvable.");
  if (!canMaintainPenalty(penalty.status)) throw new Error("Seules les pénalités contestées peuvent être maintenues.");

  await prisma.penalty.update({
    where: { id: data.penaltyId },
    data: { status: PenaltyStatus.MAINTAINED },
  });

  await prisma.penaltyReview.create({
    data: {
      penaltyId: data.penaltyId,
      memberId: member.id,
      action: "MAINTAINED",
      comment: data.comment ?? null,
    },
  });

  await auditPenalty(user.id, "PENALTY_MAINTAINED", data.penaltyId, { comment: data.comment });
  revalidatePenalties(data.projectId, penalty.organizationId);
  if (penalty.situationId) {
    revalidatePath(`/projects/${data.projectId}/situations/${penalty.organizationId}/${penalty.situationId}`);
  }
}
