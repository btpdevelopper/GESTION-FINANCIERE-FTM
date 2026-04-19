"use server";

import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/user";
import { requireProjectMember } from "@/server/membership";
import { ForecastStatus } from "@prisma/client";

/** All enterprise orgs for a project, with their latest forecast indice and status. */
export async function getProjectForecasts(projectId: string) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  await requireProjectMember(user.id, projectId);

  const all = await prisma.forecast.findMany({
    where: { projectId },
    include: { organization: true },
    orderBy: { indice: "desc" },
  });

  // One entry per org — the latest indice
  const seen = new Set<string>();
  return all.filter((f) => {
    if (seen.has(f.organizationId)) return false;
    seen.add(f.organizationId);
    return true;
  });
}

/** Full forecast detail for a given org: the "active" indice (open or latest approved). */
export async function getForecast(projectId: string, orgId: string) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  await requireProjectMember(user.id, projectId);

  // Prefer open (non-terminal) indice; fallback to latest
  const open = await prisma.forecast.findFirst({
    where: {
      projectId,
      organizationId: orgId,
      status: { notIn: [ForecastStatus.MOA_APPROVED, ForecastStatus.MOE_REFUSED, ForecastStatus.MOA_REFUSED] },
    },
    orderBy: { indice: "desc" },
    include: {
      organization: true,
      entries: { orderBy: { periodLabel: "asc" } },
      reviews: {
        orderBy: { createdAt: "asc" },
        include: { member: { include: { user: true } } },
      },
      submittedBy: { include: { user: true } },
      moeReviewedBy: { include: { user: true } },
      moaValidatedBy: { include: { user: true } },
    },
  });
  if (open) return open;

  return prisma.forecast.findFirst({
    where: { projectId, organizationId: orgId },
    orderBy: { indice: "desc" },
    include: {
      organization: true,
      entries: { orderBy: { periodLabel: "asc" } },
      reviews: {
        orderBy: { createdAt: "asc" },
        include: { member: { include: { user: true } } },
      },
      submittedBy: { include: { user: true } },
      moeReviewedBy: { include: { user: true } },
      moaValidatedBy: { include: { user: true } },
    },
  });
}

/** All forecast indices for an org (for the indice selector). */
export async function getForecastIndices(projectId: string, orgId: string) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  await requireProjectMember(user.id, projectId);

  return prisma.forecast.findMany({
    where: { projectId, organizationId: orgId },
    orderBy: { indice: "asc" },
    select: { id: true, indice: true, status: true, createdAt: true },
  });
}

/** Full financial dashboard data for all enterprises — 6 queries, no N+1 */
export async function getForecastsDashboardData(projectId: string) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  await requireProjectMember(user.id, projectId);

  const [members, allForecasts, approvedSituations, marcheTotals, ftmTotals, contractSettings] =
    await Promise.all([
      prisma.projectMember.findMany({
        where: { projectId, role: "ENTREPRISE" },
        include: { organization: { select: { id: true, name: true } } },
        distinct: ["organizationId"],
      }),
      prisma.forecast.findMany({
        where: { projectId },
        orderBy: [{ organizationId: "asc" }, { indice: "desc" }],
        select: {
          id: true,
          organizationId: true,
          indice: true,
          status: true,
          entries: {
            select: { periodLabel: true, plannedAmountHtCents: true },
            orderBy: { periodLabel: "asc" },
          },
        },
      }),
      prisma.situationTravaux.findMany({
        where: { projectId, status: "MOA_APPROVED" },
        select: { organizationId: true, periodLabel: true, netAmountHtCents: true },
      }),
      prisma.projectLotOrganization.groupBy({
        by: ["organizationId"],
        where: { projectLot: { projectId } },
        _sum: { montantMarcheHtCents: true },
      }),
      prisma.ftmQuoteSubmission.groupBy({
        by: ["organizationId"],
        where: { ftm: { projectId, phase: "ACCEPTED" } },
        _sum: { amountHtCents: true },
      }),
      prisma.companyContractSettings.findMany({
        where: { projectId },
        select: { organizationId: true, forecastWaived: true },
      }),
    ]);

  const marcheByOrg = new Map(
    marcheTotals.map((m) => [m.organizationId, Number(m._sum.montantMarcheHtCents ?? BigInt(0))])
  );
  const ftmByOrg = new Map(
    ftmTotals.map((f) => [f.organizationId, Number(f._sum.amountHtCents ?? BigInt(0))])
  );
  const waiverByOrg = new Map(contractSettings.map((s) => [s.organizationId, s.forecastWaived]));

  // Group forecasts by org (already ordered desc by indice — first = latest)
  const forecastsByOrg = new Map<string, typeof allForecasts>();
  for (const f of allForecasts) {
    const arr = forecastsByOrg.get(f.organizationId) ?? [];
    arr.push(f);
    forecastsByOrg.set(f.organizationId, arr);
  }

  // Group actual situation payments by org + period
  const actualByOrgPeriod = new Map<string, Map<string, number>>();
  for (const s of approvedSituations) {
    if (!actualByOrgPeriod.has(s.organizationId)) actualByOrgPeriod.set(s.organizationId, new Map());
    const m = actualByOrgPeriod.get(s.organizationId)!;
    m.set(s.periodLabel, (m.get(s.periodLabel) ?? 0) + Number(s.netAmountHtCents ?? BigInt(0)));
  }

  const seen = new Set<string>();
  const orgs = members
    .filter((m) => {
      if (seen.has(m.organizationId)) return false;
      seen.add(m.organizationId);
      return true;
    })
    .map((m) => m.organization);

  return orgs.map((org) => {
    const forecasts = forecastsByOrg.get(org.id) ?? [];
    const latest = forecasts[0] ?? null;
    const latestApproved =
      forecasts.find((f) => f.status === ForecastStatus.MOA_APPROVED) ?? null;

    const approvedEntries = (latestApproved?.entries ?? []).map((e) => ({
      periodLabel: e.periodLabel,
      plannedAmountHtCents: Number(e.plannedAmountHtCents),
    }));
    const approvedTotal = approvedEntries.reduce((s, e) => s + e.plannedAmountHtCents, 0);

    const actualPeriodMap = actualByOrgPeriod.get(org.id) ?? new Map<string, number>();
    const actualByPeriod = [...actualPeriodMap.entries()].map(([periodLabel, netAmountHtCents]) => ({
      periodLabel,
      netAmountHtCents,
    }));

    const marcheBase = marcheByOrg.get(org.id) ?? 0;
    const ftmValide = ftmByOrg.get(org.id) ?? 0;

    return {
      org: { id: org.id, name: org.name },
      marcheActuel: marcheBase + ftmValide,
      forecastWaived: waiverByOrg.get(org.id) ?? false,
      latestStatus: latest?.status ?? null,
      latestIndice: latest?.indice ?? null,
      approvedEntries,
      approvedTotal,
      actualByPeriod,
    };
  });
}

/** Latest MOA_APPROVED forecast with entries — for billing analysis. */
export async function getApprovedForecastForOrg(projectId: string, orgId: string) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  await requireProjectMember(user.id, projectId);

  return prisma.forecast.findFirst({
    where: { projectId, organizationId: orgId, status: ForecastStatus.MOA_APPROVED },
    orderBy: { indice: "desc" },
    include: { entries: { orderBy: { periodLabel: "asc" } } },
  });
}
