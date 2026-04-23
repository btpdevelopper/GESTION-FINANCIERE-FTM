"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { Capability, ForecastStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/user";
import { requireProjectMember } from "@/server/membership";
import { can } from "@/lib/permissions/resolve";
import { getOrgMarcheTotalCents } from "@/server/situations/situation-queries";

const IMMUTABLE_STATUSES = [
  ForecastStatus.MOA_APPROVED,
  ForecastStatus.MOE_REFUSED,
  ForecastStatus.MOA_REFUSED,
] as const;

async function audit(
  userId: string | undefined,
  action: string,
  entityId: string,
  payload?: object
) {
  await prisma.auditLog.create({
    data: { userId, action, entity: "Forecast", entityId, payload },
  });
}

function revalidateForecast(projectId: string, orgId: string) {
  revalidatePath(`/projects/${projectId}/forecasts`);
  revalidatePath(`/projects/${projectId}/forecasts/${orgId}`);
}

// ─── Save entries (create/update draft) ──────────────────────────────────────

const SaveEntriesSchema = z.object({
  projectId: z.string().uuid(),
  entries: z
    .array(
      z.object({
        periodLabel: z.string().regex(/^\d{4}-\d{2}$/, "Format YYYY-MM requis"),
        plannedAmountHtCents: z.number().int().min(0),
      })
    )
    .min(1, "Au moins une entrée est requise."),
});

export async function saveForecastEntriesAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = SaveEntriesSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.SUBMIT_FORECAST);
  if (!allowed) throw new Error("Permission refusée.");

  const orgId = member.organizationId;

  // Find existing open forecast or create indice 1
  const existingOpen = await prisma.forecast.findFirst({
    where: {
      projectId: data.projectId,
      organizationId: orgId,
      status: { notIn: [...IMMUTABLE_STATUSES] },
    },
    orderBy: { indice: "desc" },
  });

  if (existingOpen && (IMMUTABLE_STATUSES as readonly string[]).includes(existingOpen.status)) {
    throw new Error("Ce prévisionnel ne peut plus être modifié.");
  }

  if (
    existingOpen &&
    existingOpen.status !== ForecastStatus.DRAFT &&
    existingOpen.status !== ForecastStatus.MOE_CORRECTION
  ) {
    throw new Error("Le prévisionnel ne peut être modifié qu'en brouillon ou en correction.");
  }

  // If in correction: periods are locked — validate no new periods added
  if (existingOpen?.status === ForecastStatus.MOE_CORRECTION) {
    const existingPeriods = new Set(
      (
        await prisma.forecastEntry.findMany({
          where: { forecastId: existingOpen.id },
          select: { periodLabel: true },
        })
      ).map((e) => e.periodLabel)
    );
    const newPeriods = data.entries.map((e) => e.periodLabel);
    for (const p of newPeriods) {
      if (!existingPeriods.has(p)) {
        throw new Error(
          "Les périodes ne peuvent pas être modifiées lors d'une correction. Seuls les montants peuvent changer."
        );
      }
    }
    if (newPeriods.length !== existingPeriods.size) {
      throw new Error(
        "Les périodes ne peuvent pas être supprimées lors d'une correction."
      );
    }
  }

  const forecast = await prisma.$transaction(async (tx) => {
    let fc = existingOpen;

    if (!fc) {
      // No open forecast — create indice 1 (or next after last approved)
      const lastApproved = await tx.forecast.findFirst({
        where: { projectId: data.projectId, organizationId: orgId },
        orderBy: { indice: "desc" },
        select: { indice: true },
      });
      const nextIndice = lastApproved ? lastApproved.indice + 1 : 1;

      fc = await tx.forecast.create({
        data: {
          projectId: data.projectId,
          organizationId: orgId,
          indice: nextIndice,
          status: ForecastStatus.DRAFT,
        },
      });
    }

    // Replace entries
    await tx.forecastEntry.deleteMany({ where: { forecastId: fc.id } });
    await tx.forecastEntry.createMany({
      data: data.entries.map((e) => ({
        forecastId: fc!.id,
        periodLabel: e.periodLabel,
        plannedAmountHtCents: BigInt(e.plannedAmountHtCents),
      })),
    });

    return fc;
  });

  await audit(user.id, "FORECAST_ENTRIES_SAVED", forecast.id, {
    indice: forecast.indice,
    count: data.entries.length,
  });
  revalidateForecast(data.projectId, orgId);
  return forecast.id;
}

// ─── Submit ───────────────────────────────────────────────────────────────────

const SubmitForecastSchema = z.object({
  forecastId: z.string().uuid(),
  projectId: z.string().uuid(),
  correctionComment: z.string().max(2000).optional().nullable(),
});

export async function submitForecastAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = SubmitForecastSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.SUBMIT_FORECAST);
  if (!allowed) throw new Error("Permission refusée.");

  const forecast = await prisma.forecast.findFirst({
    where: { id: data.forecastId, projectId: data.projectId, organizationId: member.organizationId },
    include: { entries: true },
  });
  if (!forecast) throw new Error("Prévisionnel introuvable.");
  if (forecast.entries.length === 0) throw new Error("Ajoutez au moins une période avant de soumettre.");

  const marcheTotalBigInt = await getOrgMarcheTotalCents(data.projectId, member.organizationId);
  const marcheTotalCents = Number(marcheTotalBigInt);
  if (marcheTotalCents > 0) {
    const entryTotal = forecast.entries.reduce(
      (sum, e) => sum + Number(e.plannedAmountHtCents),
      0,
    );
    if (entryTotal !== marcheTotalCents) {
      throw new Error(
        "Le total prévu doit correspondre exactement au montant du marché avant de soumettre.",
      );
    }
  }

  if (
    forecast.status !== ForecastStatus.DRAFT &&
    forecast.status !== ForecastStatus.MOE_CORRECTION
  ) {
    throw new Error("Seuls les prévisionnels en brouillon ou en correction peuvent être soumis.");
  }
  if (forecast.status === ForecastStatus.MOE_CORRECTION && !data.correctionComment?.trim()) {
    throw new Error("Un commentaire est obligatoire lors d'une resoumission après correction.");
  }

  await prisma.forecast.update({
    where: { id: data.forecastId },
    data: {
      status: ForecastStatus.SUBMITTED,
      submittedById: member.id,
      submittedAt: new Date(),
      correctionComment: data.correctionComment ?? null,
    },
  });

  await prisma.forecastReview.create({
    data: {
      forecastId: data.forecastId,
      memberId: member.id,
      eventType: "SUBMITTED",
      correctionComment: data.correctionComment ?? null,
    },
  });

  await audit(user.id, "FORECAST_SUBMITTED", data.forecastId, { indice: forecast.indice });
  revalidateForecast(data.projectId, member.organizationId);
}

// ─── MOE review ───────────────────────────────────────────────────────────────

const MoeReviewForecastSchema = z.object({
  forecastId: z.string().uuid(),
  projectId: z.string().uuid(),
  decision: z.enum(["APPROVED", "CORRECTION_NEEDED", "REFUSED"]),
  comment: z.string().min(1, "Un commentaire est obligatoire."),
});

export async function moeReviewForecastAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = MoeReviewForecastSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.REVIEW_FORECAST_MOE);
  if (!allowed) throw new Error("Permission refusée.");

  const forecast = await prisma.forecast.findFirst({
    where: { id: data.forecastId, projectId: data.projectId },
  });
  if (!forecast) throw new Error("Prévisionnel introuvable.");
  if (forecast.status !== ForecastStatus.SUBMITTED) {
    throw new Error("Seuls les prévisionnels soumis peuvent être revus par le MOE.");
  }

  const nextStatus =
    data.decision === "APPROVED"
      ? ForecastStatus.MOE_APPROVED
      : data.decision === "CORRECTION_NEEDED"
      ? ForecastStatus.MOE_CORRECTION
      : ForecastStatus.MOE_REFUSED;

  await prisma.forecast.update({
    where: { id: data.forecastId },
    data: {
      status: nextStatus,
      moeStatus: data.decision,
      moeReviewedById: member.id,
      moeReviewedAt: new Date(),
      moeComment: data.comment,
    },
  });

  await prisma.forecastReview.create({
    data: {
      forecastId: data.forecastId,
      memberId: member.id,
      eventType: "MOE_REVIEWED",
      decision: data.decision,
      comment: data.comment,
    },
  });

  await audit(user.id, "FORECAST_MOE_REVIEWED", data.forecastId, {
    decision: data.decision,
    comment: data.comment,
  });
  revalidateForecast(data.projectId, forecast.organizationId);
}

// ─── MOA validation ───────────────────────────────────────────────────────────

const MoaValidateForecastSchema = z.object({
  forecastId: z.string().uuid(),
  projectId: z.string().uuid(),
  decision: z.enum(["APPROVED", "REFUSED", "CORRECTION_NEEDED"]),
  comment: z.string().optional().nullable(),
});

export async function moaValidateForecastAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = MoaValidateForecastSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  if ((data.decision === "REFUSED" || data.decision === "CORRECTION_NEEDED") && !data.comment?.trim()) {
    throw new Error("Un commentaire est obligatoire en cas de refus ou de renvoi en correction.");
  }

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.VALIDATE_FORECAST_MOA);
  if (!allowed) throw new Error("Permission refusée.");

  const forecast = await prisma.forecast.findFirst({
    where: { id: data.forecastId, projectId: data.projectId },
  });
  if (!forecast) throw new Error("Prévisionnel introuvable.");
  if (forecast.status !== ForecastStatus.MOE_APPROVED) {
    throw new Error("Seuls les prévisionnels approuvés par le MOE peuvent être validés par le MOA.");
  }

  const nextStatus =
    data.decision === "APPROVED"          ? ForecastStatus.MOA_APPROVED :
    data.decision === "CORRECTION_NEEDED" ? ForecastStatus.MOE_CORRECTION :
    ForecastStatus.MOA_REFUSED;

  await prisma.forecast.update({
    where: { id: data.forecastId },
    data: {
      status: nextStatus,
      moaStatus: data.decision,
      moaValidatedById: member.id,
      moaValidatedAt: new Date(),
      moaComment: data.comment ?? null,
    },
  });

  await prisma.forecastReview.create({
    data: {
      forecastId: data.forecastId,
      memberId: member.id,
      eventType: "MOA_VALIDATED",
      decision: data.decision,
      comment: data.comment ?? null,
    },
  });

  await audit(user.id, "FORECAST_MOA_VALIDATED", data.forecastId, {
    decision: data.decision,
    comment: data.comment,
  });
  revalidateForecast(data.projectId, forecast.organizationId);
}

// ─── Create new indice ────────────────────────────────────────────────────────

const NewIndiceSchema = z.object({
  projectId: z.string().uuid(),
});

export async function createNewForecastIndiceAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = NewIndiceSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.SUBMIT_FORECAST);
  if (!allowed) throw new Error("Permission refusée.");

  const orgId = member.organizationId;

  // Guard: no open forecast
  const openForecast = await prisma.forecast.findFirst({
    where: {
      projectId: data.projectId,
      organizationId: orgId,
      status: { notIn: [...IMMUTABLE_STATUSES] },
    },
  });
  if (openForecast) {
    throw new Error("Un prévisionnel est déjà en cours. Finalisez-le avant d'en créer un nouvel indice.");
  }

  // Guard: latest indice must be terminal (approved or refused)
  const lastForecast = await prisma.forecast.findFirst({
    where: { projectId: data.projectId, organizationId: orgId },
    orderBy: { indice: "desc" },
    include: { entries: true },
  });
  const terminalStatuses: ForecastStatus[] = [
    ForecastStatus.MOA_APPROVED,
    ForecastStatus.MOE_REFUSED,
    ForecastStatus.MOA_REFUSED,
  ];
  if (!lastForecast || !terminalStatuses.includes(lastForecast.status)) {
    throw new Error("Le prévisionnel doit être dans un état terminal (approuvé ou refusé) avant de créer un nouvel indice.");
  }
  // Redundant safety: confirm no higher indice exists (defensive against race conditions)
  const higherIndice = await prisma.forecast.findFirst({
    where: { projectId: data.projectId, organizationId: orgId, indice: { gt: lastForecast.indice } },
  });
  if (higherIndice) {
    throw new Error("Un indice plus récent existe déjà. Consultez le dernier indice pour créer un nouvel indice.");
  }

  const newForecast = await prisma.$transaction(async (tx) => {
    const fc = await tx.forecast.create({
      data: {
        projectId: data.projectId,
        organizationId: orgId,
        indice: lastForecast.indice + 1,
        status: ForecastStatus.DRAFT,
      },
    });

    // Copy entries from last approved indice as starting point
    if (lastForecast.entries.length > 0) {
      await tx.forecastEntry.createMany({
        data: lastForecast.entries.map((e) => ({
          forecastId: fc.id,
          periodLabel: e.periodLabel,
          plannedAmountHtCents: e.plannedAmountHtCents,
        })),
      });
    }

    return fc;
  });

  await audit(user.id, "FORECAST_NEW_INDICE", newForecast.id, { indice: newForecast.indice });
  revalidateForecast(data.projectId, orgId);
  return newForecast.id;
}

// ─── Toggle forecast waiver (MOE only) ───────────────────────────────────────

const WaiverSchema = z.object({
  projectId: z.string().uuid(),
  organizationId: z.string().uuid(),
  waived: z.boolean(),
});

export async function setForecastWaivedAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = WaiverSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.REVIEW_FORECAST_MOE);
  if (!allowed) throw new Error("Permission refusée.");

  await prisma.companyContractSettings.upsert({
    where: { projectId_organizationId: { projectId: data.projectId, organizationId: data.organizationId } },
    create: {
      projectId: data.projectId,
      organizationId: data.organizationId,
      forecastWaived: data.waived,
    },
    update: { forecastWaived: data.waived },
  });

  await audit(user.id, "FORECAST_WAIVER_SET", data.projectId, {
    organizationId: data.organizationId,
    waived: data.waived,
  });

  revalidatePath(`/projects/${data.projectId}/forecasts`);
  revalidatePath(`/projects/${data.projectId}/admin`);
}
