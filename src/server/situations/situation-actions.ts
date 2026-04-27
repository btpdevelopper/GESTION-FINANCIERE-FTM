"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Capability, ForecastStatus, SituationStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/user";
import { requireProjectMember } from "@/server/membership";
import { can } from "@/lib/permissions/resolve";
import { computeFinancialSnapshot, computePenaltyAmount } from "@/lib/situations/calculations";
import { uploadFtmDocument } from "@/lib/storage";
import { validateFileMagicNumber } from "@/lib/validations/magic";
import {
  getOrgApprovedFtmTotalCents,
  getOrgMarcheTotalCents,
  getPastRefundedAmount,
  getPreviousApprovedCumulative,
  getPreviousApprovedRevisionCumulative,
  getAcceptedFtmsForOrg,
  getFtmApprovedBilledCents,
} from "./situation-queries";
import { getPenaltiesForSituation } from "@/server/penalties/penalty-queries";
import { sumActivePenalties } from "@/lib/penalties/calculations";
import { inngest } from "@/inngest/client";

const IMMUTABLE_STATUSES = [
  SituationStatus.MOA_APPROVED,
  SituationStatus.MOE_REFUSED,
  SituationStatus.MOA_REFUSED,
] as const;

type ImmutableStatus = (typeof IMMUTABLE_STATUSES)[number];

async function audit(
  userId: string | undefined,
  action: string,
  entityId: string,
  payload?: object
) {
  await prisma.auditLog.create({
    data: { userId, action, entity: "SituationTravaux", entityId, payload },
  });
}

function revalidate(projectId: string, orgId: string, situationId?: string) {
  revalidatePath(`/projects/${projectId}/situations`);
  revalidatePath(`/projects/${projectId}/situations/${orgId}`);
  if (situationId) {
    revalidatePath(`/projects/${projectId}/situations/${orgId}/${situationId}`);
  }
}

// ─── Create ─────────────────────────────────────────────────────────────────

const CreateSituationSchema = z.object({
  projectId: z.string().uuid(),
  periodLabel: z.string().min(1).max(100),
  cumulativeAmountHtCents: z.number().int().min(0),
  cumulativeRevisionAmountHtCents: z.number().int().min(0).default(0),
  documentUrl: z.string().max(1000).optional().nullable(),
  documentName: z.string().max(255).optional().nullable(),
});

export async function createSituationAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = CreateSituationSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.SUBMIT_SITUATION);
  if (!allowed) throw new Error("Permission refusée.");

  const orgId = member.organizationId;

  // Duplicate period: reject if a situation for the same month already exists
  const duplicate = await prisma.situationTravaux.findFirst({
    where: { projectId: data.projectId, organizationId: orgId, periodLabel: data.periodLabel },
  });
  if (duplicate) {
    throw new Error("Une situation existe déjà pour cette période. Chaque mois ne peut être soumis qu'une seule fois.");
  }

  // Sequentiality: ensure no open situation exists for this org
  const openSituation = await prisma.situationTravaux.findFirst({
    where: {
      projectId: data.projectId,
      organizationId: orgId,
      status: { in: [SituationStatus.DRAFT, SituationStatus.SUBMITTED, SituationStatus.MOE_CORRECTION] },
    },
  });
  if (openSituation) {
    throw new Error("Une situation est déjà en cours pour cette entreprise. Finalisez-la avant d'en créer une nouvelle.");
  }

  // Sequentiality: last situation must be MOA_APPROVED
  const lastSituation = await prisma.situationTravaux.findFirst({
    where: { projectId: data.projectId, organizationId: orgId },
    orderBy: { numero: "desc" },
  });
  if (lastSituation && lastSituation.status !== SituationStatus.MOA_APPROVED) {
    throw new Error("La situation précédente doit être validée par le MOA avant d'en créer une nouvelle.");
  }

  const nextNumero = lastSituation ? lastSituation.numero + 1 : 1;

  // Enforce server-side: if revision is not active for this org, ignore any revision amount
  const contractSettingsForCreate = await prisma.companyContractSettings.findUnique({
    where: { projectId_organizationId: { projectId: data.projectId, organizationId: orgId } },
    select: { revisionPrixActive: true },
  });
  const revisionCents = contractSettingsForCreate?.revisionPrixActive
    ? BigInt(data.cumulativeRevisionAmountHtCents)
    : BigInt(0);

  const situation = await prisma.situationTravaux.create({
    data: {
      projectId: data.projectId,
      organizationId: orgId,
      numero: nextNumero,
      periodLabel: data.periodLabel,
      status: SituationStatus.DRAFT,
      cumulativeAmountHtCents: BigInt(data.cumulativeAmountHtCents),
      cumulativeRevisionAmountHtCents: revisionCents,
      documentUrl: data.documentUrl ?? null,
      documentName: data.documentName ?? null,
    },
  });

  await audit(user.id, "SITUATION_CREATED", situation.id, { numero: nextNumero, periodLabel: data.periodLabel });
  revalidate(data.projectId, orgId, situation.id);
  return situation.id;
}

// ─── Update draft ────────────────────────────────────────────────────────────

const UpdateDraftSchema = z.object({
  situationId: z.string().uuid(),
  projectId: z.string().uuid(),
  periodLabel: z.string().min(1).max(100),
  cumulativeAmountHtCents: z.number().int().min(0),
  cumulativeRevisionAmountHtCents: z.number().int().min(0).default(0),
  documentUrl: z.string().max(1000).optional().nullable(),
  documentName: z.string().max(255).optional().nullable(),
  correctionComment: z.string().max(2000).optional().nullable(),
});

export async function updateSituationDraftAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = UpdateDraftSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  const member = await requireProjectMember(user.id, data.projectId);
  const situation = await prisma.situationTravaux.findFirst({
    where: { id: data.situationId, projectId: data.projectId, organizationId: member.organizationId },
  });
  if (!situation) throw new Error("Situation introuvable.");
  if ((IMMUTABLE_STATUSES as readonly string[]).includes(situation.status)) throw new Error("Cette situation ne peut plus être modifiée.");
  if (
    situation.status !== SituationStatus.DRAFT &&
    situation.status !== SituationStatus.MOE_CORRECTION
  ) {
    throw new Error("Seules les situations en brouillon ou en correction peuvent être modifiées.");
  }

  // Enforce period immutability in correction mode
  if (
    situation.status === SituationStatus.MOE_CORRECTION &&
    data.periodLabel !== situation.periodLabel
  ) {
    throw new Error("La période ne peut pas être modifiée lors d'une correction.");
  }

  // Duplicate period check: reject if another situation for this org already uses the same month
  if (data.periodLabel !== situation.periodLabel) {
    const duplicate = await prisma.situationTravaux.findFirst({
      where: {
        projectId: data.projectId,
        organizationId: member.organizationId,
        periodLabel: data.periodLabel,
        id: { not: data.situationId },
      },
    });
    if (duplicate) {
      throw new Error("Une situation existe déjà pour cette période. Chaque mois ne peut être soumis qu'une seule fois.");
    }
  }

  // When the MOE set an adjusted amount, proposing a different total requires a comment
  const newTotal = BigInt(data.cumulativeAmountHtCents) + BigInt(data.cumulativeRevisionAmountHtCents ?? 0);
  if (
    situation.status === SituationStatus.MOE_CORRECTION &&
    situation.moeAdjustedAmountHtCents !== null &&
    newTotal !== situation.moeAdjustedAmountHtCents &&
    !data.correctionComment?.trim()
  ) {
    throw new Error("Un commentaire est obligatoire lorsque vous proposez un montant différent de celui du MOE.");
  }

  // In correction mode a new document is required; otherwise preserve the existing one
  if (situation.status === SituationStatus.MOE_CORRECTION && data.documentUrl === undefined) {
    throw new Error("Vous devez joindre un nouveau document lors d'une correction.");
  }

  // Enforce server-side: if revision is not active for this org, ignore any revision amount
  const contractSettingsForUpdate = await prisma.companyContractSettings.findUnique({
    where: { projectId_organizationId: { projectId: data.projectId, organizationId: member.organizationId } },
    select: { revisionPrixActive: true },
  });
  const revisionCentsUpdate = contractSettingsForUpdate?.revisionPrixActive
    ? BigInt(data.cumulativeRevisionAmountHtCents ?? 0)
    : BigInt(0);

  await prisma.situationTravaux.update({
    where: { id: data.situationId },
    data: {
      periodLabel: data.periodLabel,
      cumulativeAmountHtCents: BigInt(data.cumulativeAmountHtCents),
      cumulativeRevisionAmountHtCents: revisionCentsUpdate,
      correctionComment: data.correctionComment ?? null,
      // Only overwrite document fields when a new file was explicitly provided
      ...(data.documentUrl !== undefined
        ? { documentUrl: data.documentUrl, documentName: data.documentName ?? null }
        : {}),
    },
  });

  revalidate(data.projectId, member.organizationId, data.situationId);
}

// ─── Submit ──────────────────────────────────────────────────────────────────

const SubmitSituationSchema = z.object({
  situationId: z.string().uuid(),
  projectId: z.string().uuid(),
});

export async function submitSituationAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = SubmitSituationSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.SUBMIT_SITUATION);
  if (!allowed) throw new Error("Permission refusée.");

  const [situation, contractSettings] = await Promise.all([
    prisma.situationTravaux.findFirst({
      where: { id: data.situationId, projectId: data.projectId, organizationId: member.organizationId },
    }),
    prisma.companyContractSettings.findUnique({
      where: { projectId_organizationId: { projectId: data.projectId, organizationId: member.organizationId } },
      select: { forecastWaived: true },
    }),
  ]);
  if (!situation) throw new Error("Situation introuvable.");
  if ((IMMUTABLE_STATUSES as readonly string[]).includes(situation.status)) throw new Error("Cette situation ne peut plus être modifiée.");
  if (
    situation.status !== SituationStatus.DRAFT &&
    situation.status !== SituationStatus.MOE_CORRECTION
  ) {
    throw new Error("Seules les situations en brouillon ou en correction peuvent être soumises.");
  }

  // Block submission while any FTM line still sits in a correction-needed state
  const unresolvedFtm = await prisma.situationFtmBilling.findFirst({
    where: {
      situationId: data.situationId,
      status: { in: ["MOE_CORRECTION_NEEDED", "MOA_CORRECTION_NEEDED"] },
    },
    select: { id: true },
  });
  if (unresolvedFtm) {
    throw new Error("Vous devez corriger ou retirer les FTMs signalés avant de re-soumettre.");
  }

  // Forecast prerequisite: unless explicitly waived, a MOA_APPROVED forecast must exist
  if (!contractSettings?.forecastWaived) {
    const approvedForecast = await prisma.forecast.findFirst({
      where: { projectId: data.projectId, organizationId: member.organizationId, status: ForecastStatus.MOA_APPROVED },
      select: { id: true },
    });
    if (!approvedForecast) {
      throw new Error(
        "Votre prévisionnel doit être validé par le MOA avant de soumettre une situation de travaux. Contactez le MOE si votre projet ne nécessite pas de prévisionnel."
      );
    }
  }

  await prisma.situationTravaux.update({
    where: { id: data.situationId },
    data: { status: SituationStatus.SUBMITTED, submittedById: member.id, submittedAt: new Date() },
  });

  await prisma.situationReview.create({
    data: {
      situationId: data.situationId,
      memberId: member.id,
      eventType: "SUBMITTED",
      amountHtCents: situation.cumulativeAmountHtCents,
      documentName: situation.documentName,
      documentUrl: situation.documentUrl,
      correctionComment: situation.correctionComment,
    },
  });

  await audit(user.id, "SITUATION_SUBMITTED", data.situationId, {
    numero: situation.numero,
    periodLabel: situation.periodLabel,
    cumulativeAmountHtCents: situation.cumulativeAmountHtCents.toString(),
  });

  const org = await prisma.organization.findUnique({
    where: { id: member.organizationId },
    select: { name: true },
  });
  await inngest.send({
    name: "situation/submitted",
    data: {
      projectId: data.projectId,
      situationId: data.situationId,
      organizationId: member.organizationId,
      organizationName: org?.name ?? "",
      periodLabel: situation.periodLabel,
      numero: situation.numero,
    },
  });

  revalidate(data.projectId, member.organizationId, data.situationId);
}

// ─── MOE review ─────────────────────────────────────────────────────────────

const MoeFtmLineReviewSchema = z.object({
  billingId: z.string().uuid(),
  decision: z.enum(["APPROVED", "REFUSED", "CORRECTION_NEEDED"]),
  comment: z.string().optional().nullable(),
}).refine(
  (v) => v.decision !== "CORRECTION_NEEDED" || (v.comment?.trim().length ?? 0) > 0,
  { message: "Un commentaire est obligatoire pour demander une correction d'un FTM." }
);

const MoeReviewSchema = z.object({
  situationId: z.string().uuid(),
  projectId: z.string().uuid(),
  decision: z.enum(["APPROVED", "CORRECTION_NEEDED", "REFUSED"]),
  comment: z.string().min(1, "Un commentaire est obligatoire."),
  moeAdjustedBaseAmountHtCents: z.number().int().min(0).optional().nullable(),
  moeAdjustedRevisionAmountHtCents: z.number().int().min(0).optional().nullable(),
  penaltyType: z.enum(["NONE", "FREE_AMOUNT", "DAILY_RATE"]).optional().nullable(),
  penaltyDelayDays: z.number().int().min(0).optional().nullable(),
  penaltyAmountCents: z.number().int().min(0).optional().nullable(),
  ftmReviews: z.array(MoeFtmLineReviewSchema).optional(),
});

export async function moeReviewSituationAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = MoeReviewSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.REVIEW_SITUATION_MOE);
  if (!allowed) throw new Error("Permission refusée.");

  const situation = await prisma.situationTravaux.findFirst({
    where: { id: data.situationId, projectId: data.projectId },
  });
  if (!situation) throw new Error("Situation introuvable.");
  if ((IMMUTABLE_STATUSES as readonly string[]).includes(situation.status)) throw new Error("Cette situation ne peut plus être modifiée.");
  if (situation.status !== SituationStatus.SUBMITTED) {
    throw new Error("Seules les situations soumises peuvent être revues par le MOE.");
  }

  // Consistency guard: if any FTM line was marked CORRECTION_NEEDED,
  // the situation decision must be CORRECTION_NEEDED (or REFUSED, which supersedes).
  const ftmReviews = data.ftmReviews ?? [];
  const anyLineCorrection = ftmReviews.some((r) => r.decision === "CORRECTION_NEEDED");
  if (anyLineCorrection && data.decision === "APPROVED") {
    throw new Error(
      "Des FTMs sont marqués à corriger. Renvoyez la situation en correction avant d'approuver."
    );
  }

  // Compute final penalty amount
  const contractSettings = await prisma.companyContractSettings.findUnique({
    where: { projectId_organizationId: { projectId: data.projectId, organizationId: situation.organizationId } },
  });
  const effectivePenaltyType = data.penaltyType ?? contractSettings?.penaltyType ?? "NONE";
  const penaltyAmount = computePenaltyAmount(
    effectivePenaltyType,
    data.penaltyType === "DAILY_RATE" ? (contractSettings?.penaltyDailyRateCents ?? null) : null,
    data.penaltyDelayDays ?? null,
    data.penaltyAmountCents !== null && data.penaltyAmountCents !== undefined
      ? BigInt(data.penaltyAmountCents)
      : null
  );

  const nextStatus =
    data.decision === "APPROVED"
      ? SituationStatus.MOE_APPROVED
      : data.decision === "CORRECTION_NEEDED"
      ? SituationStatus.MOE_CORRECTION
      : SituationStatus.MOE_REFUSED;

  // Compute MOE total adjusted amount from separate base + revision adjustments
  const hasBaseAdjust = data.moeAdjustedBaseAmountHtCents != null;
  const hasRevisionAdjust = data.moeAdjustedRevisionAmountHtCents != null;
  let moeAdjustedTotal: bigint | null = null;
  let moeAdjustedRevision: bigint | null = null;
  if (hasBaseAdjust || hasRevisionAdjust) {
    const adjustedBase = hasBaseAdjust
      ? BigInt(data.moeAdjustedBaseAmountHtCents!)
      : situation.cumulativeAmountHtCents;
    const adjustedRevision = hasRevisionAdjust
      ? BigInt(data.moeAdjustedRevisionAmountHtCents!)
      : situation.cumulativeRevisionAmountHtCents;
    moeAdjustedTotal = adjustedBase + adjustedRevision;
    moeAdjustedRevision = adjustedRevision;
  }

  await prisma.$transaction([
    prisma.situationTravaux.update({
      where: { id: data.situationId },
      data: {
        status: nextStatus,
        moeStatus: data.decision,
        moeReviewedById: member.id,
        moeReviewedAt: new Date(),
        moeComment: data.comment,
        moeAdjustedAmountHtCents: moeAdjustedTotal,
        moeAdjustedRevisionAmountHtCents: moeAdjustedRevision,
        penaltyType: effectivePenaltyType as "NONE" | "FREE_AMOUNT" | "DAILY_RATE",
        penaltyDelayDays: data.penaltyDelayDays ?? null,
        penaltyAmountCents: penaltyAmount > BigInt(0) ? penaltyAmount : null,
      },
    }),
    ...ftmReviews.map((r) => {
      const newStatus =
        r.decision === "APPROVED"
          ? "MOE_APPROVED"
          : r.decision === "REFUSED"
          ? "MOE_REFUSED"
          : "MOE_CORRECTION_NEEDED";
      return prisma.situationFtmBilling.updateMany({
        where: { id: r.billingId, situationId: data.situationId, status: "PENDING" },
        data: { status: newStatus, moeComment: r.comment?.trim() || null },
      });
    }),
  ]);

  await prisma.situationReview.create({
    data: {
      situationId: data.situationId,
      memberId: member.id,
      eventType: "MOE_REVIEWED",
      decision: data.decision,
      comment: data.comment,
      adjustedAmountHtCents: moeAdjustedTotal,
      penaltyAmountCents: penaltyAmount > BigInt(0) ? penaltyAmount : null,
    },
  });

  await audit(user.id, "SITUATION_MOE_REVIEWED", data.situationId, {
    decision: data.decision,
    comment: data.comment,
    adjustedAmount: moeAdjustedTotal?.toString() ?? null,
    penaltyAmountCents: penaltyAmount.toString(),
  });

  await inngest.send({
    name: "situation/moe-reviewed",
    data: {
      projectId: data.projectId,
      situationId: data.situationId,
      organizationId: situation.organizationId,
      numero: situation.numero,
      decision: data.decision,
      comment: data.comment ?? null,
    },
  });

  revalidate(data.projectId, situation.organizationId, data.situationId);
}

// ─── MOA validation ──────────────────────────────────────────────────────────

const MoaFtmLineReviewSchema = z.object({
  billingId: z.string().uuid(),
  decision: z.enum(["APPROVED", "REFUSED", "CORRECTION_NEEDED"]),
  comment: z.string().optional().nullable(),
}).refine(
  (v) => v.decision !== "CORRECTION_NEEDED" || (v.comment?.trim().length ?? 0) > 0,
  { message: "Un commentaire est obligatoire pour demander une correction d'un FTM." }
);

const MoaValidateSchema = z.object({
  situationId: z.string().uuid(),
  projectId: z.string().uuid(),
  decision: z.enum(["APPROVED", "REFUSED", "CORRECTION_NEEDED"]),
  comment: z.string().optional().nullable(),
  ftmReviews: z.array(MoaFtmLineReviewSchema).optional(),
});

export async function moaValidateSituationAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = MoaValidateSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  if (data.decision === "REFUSED" && !data.comment?.trim()) {
    throw new Error("Un commentaire est obligatoire en cas de refus.");
  }
  if (data.decision === "CORRECTION_NEEDED" && !data.comment?.trim()) {
    throw new Error("Un commentaire est obligatoire pour demander une correction.");
  }

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.VALIDATE_SITUATION_MOA);
  if (!allowed) throw new Error("Permission refusée.");

  const situation = await prisma.situationTravaux.findFirst({
    where: { id: data.situationId, projectId: data.projectId },
  });
  if (!situation) throw new Error("Situation introuvable.");
  if ((IMMUTABLE_STATUSES as readonly string[]).includes(situation.status)) throw new Error("Cette situation ne peut plus être modifiée.");
  if (situation.status !== SituationStatus.MOE_APPROVED) {
    throw new Error("Seules les situations approuvées par le MOE peuvent être validées par le MOA.");
  }

  const ftmReviewsMoa = data.ftmReviews ?? [];
  const anyLineCorrectionMoa = ftmReviewsMoa.some((r) => r.decision === "CORRECTION_NEEDED");
  if (anyLineCorrectionMoa && data.decision === "APPROVED") {
    throw new Error(
      "Des FTMs sont marqués à corriger. Renvoyez la situation en correction avant d'approuver."
    );
  }

  const ftmLineUpdates = ftmReviewsMoa.map((r) => {
    const newStatus =
      r.decision === "APPROVED"
        ? "MOA_APPROVED"
        : r.decision === "REFUSED"
        ? "MOA_REFUSED"
        : "MOA_CORRECTION_NEEDED";
    return prisma.situationFtmBilling.updateMany({
      where: { id: r.billingId, situationId: data.situationId, status: "MOE_APPROVED" },
      data: { status: newStatus, moaComment: r.comment?.trim() || null },
    });
  });

  // CORRECTION_NEEDED: roll situation back to MOE_CORRECTION so ENTREPRISE edits the flagged lines
  if (data.decision === "CORRECTION_NEEDED") {
    await prisma.$transaction([
      prisma.situationTravaux.update({
        where: { id: data.situationId },
        data: {
          status: SituationStatus.MOE_CORRECTION,
          moaStatus: "CORRECTION_NEEDED",
          moaValidatedById: member.id,
          moaValidatedAt: new Date(),
          moaComment: data.comment ?? null,
          // Clear the MOE approval so MOE re-reviews after ENTREPRISE fixes
          moeStatus: null,
          moeReviewedById: null,
          moeReviewedAt: null,
        },
      }),
      prisma.situationReview.create({
        data: {
          situationId: data.situationId,
          memberId: member.id,
          eventType: "MOA_VALIDATED",
          decision: "CORRECTION_NEEDED",
          comment: data.comment ?? null,
        },
      }),
      ...ftmLineUpdates,
    ]);
    await audit(user.id, "SITUATION_MOA_VALIDATED", data.situationId, {
      decision: "CORRECTION_NEEDED",
      comment: data.comment,
    });
    await inngest.send({
      name: "situation/moa-validated",
      data: {
        projectId: data.projectId,
        situationId: data.situationId,
        organizationId: situation.organizationId,
        numero: situation.numero,
        decision: "CORRECTION_NEEDED",
        comment: data.comment ?? null,
      },
    });
    revalidate(data.projectId, situation.organizationId, data.situationId);
    return;
  }

  if (data.decision === "REFUSED") {
    await prisma.$transaction([
      prisma.situationTravaux.update({
        where: { id: data.situationId },
        data: {
          status: SituationStatus.MOA_REFUSED,
          moaStatus: "REFUSED",
          moaValidatedById: member.id,
          moaValidatedAt: new Date(),
          moaComment: data.comment ?? null,
        },
      }),
      prisma.situationReview.create({
        data: {
          situationId: data.situationId,
          memberId: member.id,
          eventType: "MOA_VALIDATED",
          decision: "REFUSED",
          comment: data.comment ?? null,
        },
      }),
      ...ftmLineUpdates,
    ]);
    await audit(user.id, "SITUATION_MOA_VALIDATED", data.situationId, {
      decision: "REFUSED",
      comment: data.comment,
    });
    await inngest.send({
      name: "situation/moa-validated",
      data: {
        projectId: data.projectId,
        situationId: data.situationId,
        organizationId: situation.organizationId,
        numero: situation.numero,
        decision: "REFUSED",
        comment: data.comment ?? null,
      },
    });
    revalidate(data.projectId, situation.organizationId, data.situationId);
    return;
  }

  // APPROVED path — apply per-line FTM decisions first so the snapshot reflects them
  if (ftmLineUpdates.length > 0) {
    await prisma.$transaction(ftmLineUpdates);
  }

  // Compute and freeze financial snapshot
  const contractSettings = await prisma.companyContractSettings.findUnique({
    where: { projectId_organizationId: { projectId: data.projectId, organizationId: situation.organizationId } },
  });

  const [marcheTotal, ftmTotal, pastRefunded, previousCumulative, previousRevisionCumulative, dedicatedPenalties, ftmBillingLines] =
    await Promise.all([
      getOrgMarcheTotalCents(data.projectId, situation.organizationId),
      getOrgApprovedFtmTotalCents(data.projectId, situation.organizationId),
      getPastRefundedAmount(data.projectId, situation.organizationId, situation.numero),
      getPreviousApprovedCumulative(data.projectId, situation.organizationId, situation.numero),
      getPreviousApprovedRevisionCumulative(data.projectId, situation.organizationId, situation.numero),
      getPenaltiesForSituation(data.situationId),
      prisma.situationFtmBilling.findMany({
        where: { situationId: data.situationId, status: "MOA_APPROVED" },
        select: { billedAmountCents: true },
      }),
    ]);

  const totalEnveloppe = marcheTotal + ftmTotal;
  const dedicatedTotal = sumActivePenalties(dedicatedPenalties);
  const penaltyAmount = (situation.penaltyAmountCents ?? BigInt(0)) + dedicatedTotal;
  const ftmBilledTotal = ftmBillingLines.reduce((s, l) => s + l.billedAmountCents, BigInt(0));

  // Total cumulative = base + revision
  const totalCumulative = situation.cumulativeAmountHtCents + situation.cumulativeRevisionAmountHtCents;

  // Accepted revision cumulative (MOE may have adjusted it)
  const acceptedRevisionCumulative =
    situation.moeAdjustedRevisionAmountHtCents ?? situation.cumulativeRevisionAmountHtCents;
  const periodRevisionHtCents = acceptedRevisionCumulative - previousRevisionCumulative;

  // moeAdjustedAmountHtCents stores the MOE-adjusted total (base + revision).
  // Derive the MOE-adjusted base by subtracting the MOE-adjusted revision so the
  // avance progress percent (computed on base only) is accurate.
  const moeAdjustedBaseHtCents =
    situation.moeAdjustedAmountHtCents !== null
      ? situation.moeAdjustedAmountHtCents - acceptedRevisionCumulative
      : null;
  const previousBaseCumulative = previousCumulative - previousRevisionCumulative;

  let snapshot = null;
  if (contractSettings) {
    const base = computeFinancialSnapshot(
      {
        cumulativeBaseHtCents: situation.cumulativeAmountHtCents,
        cumulativeRevisionHtCents: situation.cumulativeRevisionAmountHtCents,
        previousCumulativeBaseHtCents: previousBaseCumulative,
        previousCumulativeRevisionHtCents: previousRevisionCumulative,
        contractSettings,
        pastRefundedAmountCents: pastRefunded,
        situationNumero: situation.numero,
        totalEnveloppeHtCents: totalEnveloppe,
        penaltyAmountCents: penaltyAmount,
      },
      {
        moeAdjustedBaseHtCents,
        moeAdjustedRevisionHtCents: situation.moeAdjustedRevisionAmountHtCents,
      }
    );
    snapshot = { ...base, netAmountHtCents: base.netAmountHtCents + ftmBilledTotal };
  } else {
    // No contract settings: simple period net, no deductions
    const accepted = situation.moeAdjustedAmountHtCents ?? totalCumulative;
    const periodNet = accepted - previousCumulative;
    snapshot = {
      acceptedCumulativeHtCents: accepted,
      previousCumulativeHtCents: previousCumulative,
      periodNetBeforeDeductionsHtCents: periodNet,
      retenueGarantieAmountCents: BigInt(0),
      avanceTravauxRemboursementCents: BigInt(0),
      netAmountHtCents: periodNet - (penaltyAmount ?? BigInt(0)) + ftmBilledTotal,
    };
  }

  await prisma.situationTravaux.update({
    where: { id: data.situationId },
    data: {
      status: SituationStatus.MOA_APPROVED,
      moaStatus: "APPROVED",
      moaValidatedById: member.id,
      moaValidatedAt: new Date(),
      moaComment: data.comment ?? null,
      acceptedCumulativeHtCents: snapshot.acceptedCumulativeHtCents,
      previousCumulativeHtCents: snapshot.previousCumulativeHtCents,
      periodNetBeforeDeductionsHtCents: snapshot.periodNetBeforeDeductionsHtCents,
      periodRevisionHtCents,
      retenueGarantieAmountCents: snapshot.retenueGarantieAmountCents,
      avanceTravauxRemboursementCents: snapshot.avanceTravauxRemboursementCents,
      ftmBilledAmountCents: ftmBilledTotal > BigInt(0) ? ftmBilledTotal : null,
      netAmountHtCents: snapshot.netAmountHtCents + ftmBilledTotal,
    },
  });

  await prisma.situationReview.create({
    data: {
      situationId: data.situationId,
      memberId: member.id,
      eventType: "MOA_VALIDATED",
      decision: "APPROVED",
      comment: data.comment ?? null,
    },
  });

  await audit(user.id, "SITUATION_MOA_VALIDATED", data.situationId, {
    decision: "APPROVED",
    comment: data.comment,
    netAmountHtCents: snapshot.netAmountHtCents.toString(),
  });

  await inngest.send({
    name: "situation/moa-validated",
    data: {
      projectId: data.projectId,
      situationId: data.situationId,
      organizationId: situation.organizationId,
      numero: situation.numero,
      decision: "APPROVED",
      comment: data.comment ?? null,
    },
  });

  revalidate(data.projectId, situation.organizationId, data.situationId);
}

// ─── FTM billing lines ───────────────────────────────────────────────────────

const UpsertFtmBillingSchema = z.object({
  situationId: z.string().uuid(),
  projectId: z.string().uuid(),
  ftmRecordId: z.string().uuid(),
  percentage: z.number().int().min(1).max(100),
});

export async function upsertSituationFtmBillingAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = UpsertFtmBillingSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.SUBMIT_SITUATION);
  if (!allowed) throw new Error("Permission refusée.");

  const situation = await prisma.situationTravaux.findFirst({
    where: { id: data.situationId, projectId: data.projectId, organizationId: member.organizationId },
    select: { status: true, organizationId: true },
  });
  if (!situation) throw new Error("Situation introuvable.");
  if (situation.status !== SituationStatus.DRAFT && situation.status !== SituationStatus.MOE_CORRECTION) {
    throw new Error("Impossible de modifier les FTMs en dehors du brouillon ou de la correction.");
  }

  // Fetch the FTM quote amount for this org
  const acceptedFtms = await getAcceptedFtmsForOrg(data.projectId, member.organizationId);
  const ftmEntry = acceptedFtms.find((f) => f.ftmId === data.ftmRecordId);
  if (!ftmEntry) throw new Error("FTM introuvable ou non accepté.");

  const billedAmountCents = (ftmEntry.quoteAmountCents * BigInt(data.percentage)) / BigInt(100);

  // Cap check: MOA-approved billings for this FTM (excluding this situation)
  const alreadyBilledCents = await getFtmApprovedBilledCents(
    data.ftmRecordId,
    member.organizationId,
    data.situationId,
  );
  if (alreadyBilledCents + billedAmountCents > ftmEntry.quoteAmountCents) {
    const remainingPercent = Number(((ftmEntry.quoteAmountCents - alreadyBilledCents) * BigInt(100)) / ftmEntry.quoteAmountCents);
    throw new Error(
      `Dépassement du plafond : seulement ${remainingPercent}% restant à facturer pour ce FTM.`
    );
  }

  await prisma.situationFtmBilling.upsert({
    where: { situationId_ftmRecordId: { situationId: data.situationId, ftmRecordId: data.ftmRecordId } },
    create: {
      situationId: data.situationId,
      ftmRecordId: data.ftmRecordId,
      organizationId: member.organizationId,
      projectId: data.projectId,
      percentage: data.percentage,
      billedAmountCents,
      status: "PENDING",
    },
    update: {
      percentage: data.percentage,
      billedAmountCents,
      status: "PENDING",
    },
  });

  revalidate(data.projectId, member.organizationId, data.situationId);
}

const RemoveFtmBillingSchema = z.object({
  billingId: z.string().uuid(),
  projectId: z.string().uuid(),
});

export async function removeSituationFtmBillingAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = RemoveFtmBillingSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.SUBMIT_SITUATION);
  if (!allowed) throw new Error("Permission refusée.");

  const billing = await prisma.situationFtmBilling.findFirst({
    where: { id: data.billingId, organizationId: member.organizationId, projectId: data.projectId },
    include: { situation: { select: { status: true, organizationId: true } } },
  });
  if (!billing) throw new Error("Ligne FTM introuvable.");
  if (
    billing.situation.status !== SituationStatus.DRAFT &&
    billing.situation.status !== SituationStatus.MOE_CORRECTION
  ) {
    throw new Error("Impossible de supprimer une ligne FTM hors brouillon.");
  }

  await prisma.situationFtmBilling.delete({ where: { id: data.billingId } });
  revalidate(data.projectId, member.organizationId, billing.situationId);
}

// ─── Document upload ─────────────────────────────────────────────────────────

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
  "application/vnd.ms-excel", // xls
  "image/png",
  "image/jpeg",
];

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export async function uploadSituationDocumentAction(
  formData: FormData
): Promise<{ path: string; name: string }> {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const projectId = formData.get("projectId") as string;
  if (!projectId) throw new Error("projectId manquant.");

  const member = await requireProjectMember(user.id, projectId);
  const allowed = await can(member.id, Capability.SUBMIT_SITUATION);
  if (!allowed) throw new Error("Permission refusée.");

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) throw new Error("Aucun fichier fourni.");
  if (file.size > MAX_SIZE_BYTES) throw new Error("Fichier trop volumineux (20 Mo max).");
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error("Format non autorisé. Formats acceptés : PDF, Excel, PNG, JPEG.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const header = buffer.subarray(0, 12);
  if (!validateFileMagicNumber(header, file.type, file.name)) {
    throw new Error("Le fichier ne correspond pas à son type déclaré.");
  }

  const storagePrefix = `situations/${projectId}/${member.organizationId}`;
  const { path } = await uploadFtmDocument(storagePrefix, buffer, file.name, file.type);

  return { path, name: file.name };
}
