"use server";

import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/user";
import { requireProjectMember } from "@/server/membership";

export async function getSituationsForOrg(projectId: string, orgId: string) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  await requireProjectMember(user.id, projectId);

  return prisma.situationTravaux.findMany({
    where: { projectId, organizationId: orgId },
    include: {
      submittedBy: { include: { user: true } },
      moeReviewedBy: { include: { user: true } },
      moaValidatedBy: { include: { user: true } },
    },
    orderBy: { numero: "asc" },
  });
}

export async function getSituation(projectId: string, situationId: string) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  await requireProjectMember(user.id, projectId);

  return prisma.situationTravaux.findFirst({
    where: { id: situationId, projectId },
    include: {
      organization: true,
      submittedBy: { include: { user: true } },
      moeReviewedBy: { include: { user: true } },
      moaValidatedBy: { include: { user: true } },
      reviews: {
        orderBy: { createdAt: "asc" },
        include: { member: { include: { user: true } } },
      },
    },
  });
}

export async function getProjectSituations(projectId: string) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  await requireProjectMember(user.id, projectId);

  // Return latest situation per organization
  const all = await prisma.situationTravaux.findMany({
    where: { projectId },
    include: { organization: true },
    orderBy: { numero: "desc" },
  });

  // Deduplicate: one entry per org (the latest)
  const seen = new Set<string>();
  return all.filter((s) => {
    if (seen.has(s.organizationId)) return false;
    seen.add(s.organizationId);
    return true;
  });
}

export async function getCompanyContractSettings(projectId: string, orgId: string) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  await requireProjectMember(user.id, projectId);

  return prisma.companyContractSettings.findUnique({
    where: { projectId_organizationId: { projectId, organizationId: orgId } },
  });
}

export async function getProjectEnterpriseOrgs(projectId: string) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  await requireProjectMember(user.id, projectId);

  const members = await prisma.projectMember.findMany({
    where: { projectId, role: "ENTREPRISE" },
    include: { organization: true },
    distinct: ["organizationId"],
  });

  return members.map((m) => m.organization);
}

/** Sum of all accepted FTM amounts for a company on a project (MOA_FINAL phase only) */
export async function getOrgApprovedFtmTotalCents(
  projectId: string,
  orgId: string
): Promise<bigint> {
  const result = await prisma.ftmQuoteSubmission.aggregate({
    where: {
      organizationId: orgId,
      ftm: {
        projectId,
        phase: "ACCEPTED",
      },
    },
    _sum: { amountHtCents: true },
  });
  return result._sum.amountHtCents ?? BigInt(0);
}

/** Sum of all marché amounts for a company across all lots on a project */
export async function getOrgMarcheTotalCents(
  projectId: string,
  orgId: string
): Promise<bigint> {
  const result = await prisma.projectLotOrganization.aggregate({
    where: {
      organizationId: orgId,
      projectLot: { projectId },
    },
    _sum: { montantMarcheHtCents: true },
  });
  return result._sum.montantMarcheHtCents ?? BigInt(0);
}

/** ACCEPTED FTMs for a company with their approved quote amount — used for billing picker. */
export async function getAcceptedFtmsForOrg(projectId: string, orgId: string) {
  const submissions = await prisma.ftmQuoteSubmission.findMany({
    where: { organizationId: orgId, ftm: { projectId, phase: "ACCEPTED" } },
    select: {
      ftmId: true,
      amountHtCents: true,
      ftm: { select: { id: true, title: true, number: true } },
    },
  });

  // One entry per FTM (take latest submission by amountHtCents sum per ftm)
  const byFtm = new Map<string, { ftmId: string; title: string; number: number; quoteAmountCents: bigint }>();
  for (const s of submissions) {
    const existing = byFtm.get(s.ftmId);
    if (!existing || s.amountHtCents > existing.quoteAmountCents) {
      byFtm.set(s.ftmId, {
        ftmId: s.ftmId,
        title: s.ftm.title,
        number: s.ftm.number,
        quoteAmountCents: s.amountHtCents,
      });
    }
  }
  return [...byFtm.values()];
}

/** Sum of billedAmountCents for MOA_APPROVED billings of a given FTM for an org.
 *  Pass excludeSituationId to exclude the current situation when editing. */
export async function getFtmApprovedBilledCents(
  ftmRecordId: string,
  orgId: string,
  excludeSituationId?: string,
): Promise<bigint> {
  const result = await prisma.situationFtmBilling.aggregate({
    where: {
      ftmRecordId,
      organizationId: orgId,
      status: "MOA_APPROVED",
      ...(excludeSituationId ? { situationId: { not: excludeSituationId } } : {}),
    },
    _sum: { billedAmountCents: true },
  });
  return result._sum.billedAmountCents ?? BigInt(0);
}

/** Sum of frozenAmountCents for all active (MOA_APPROVED + MAINTAINED) penalties for a company */
export async function getOrgActivePenaltiesTotalCents(
  projectId: string,
  orgId: string,
): Promise<bigint> {
  const result = await prisma.penalty.aggregate({
    where: {
      projectId,
      organizationId: orgId,
      status: { in: ["MOA_APPROVED", "MAINTAINED"] },
    },
    _sum: { frozenAmountCents: true },
  });
  return result._sum.frozenAmountCents ?? BigInt(0);
}

/** Sum of avanceTravauxRemboursementCents from all MOA_APPROVED situations before this one */
export async function getPastRefundedAmount(
  projectId: string,
  orgId: string,
  beforeNumero: number
): Promise<bigint> {
  const result = await prisma.situationTravaux.aggregate({
    where: {
      projectId,
      organizationId: orgId,
      status: "MOA_APPROVED",
      numero: { lt: beforeNumero },
    },
    _sum: { avanceTravauxRemboursementCents: true },
  });
  return result._sum.avanceTravauxRemboursementCents ?? BigInt(0);
}

/** Full financial dashboard data for all enterprises on a project — 4 queries, no N+1 */
export async function getSituationsDashboardData(projectId: string) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  await requireProjectMember(user.id, projectId);

  const [members, allSituations, marcheTotals, ftmTotals] = await Promise.all([
    prisma.projectMember.findMany({
      where: { projectId, role: "ENTREPRISE" },
      include: { organization: { select: { id: true, name: true } } },
      distinct: ["organizationId"],
    }),
    prisma.situationTravaux.findMany({
      where: { projectId },
      orderBy: [{ organizationId: "asc" }, { numero: "asc" }],
      select: {
        id: true,
        organizationId: true,
        numero: true,
        periodLabel: true,
        status: true,
        cumulativeAmountHtCents: true,
        moeAdjustedAmountHtCents: true,
        acceptedCumulativeHtCents: true,
        periodNetBeforeDeductionsHtCents: true,
        retenueGarantieAmountCents: true,
        avanceTravauxRemboursementCents: true,
        penaltyAmountCents: true,
        netAmountHtCents: true,
      },
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
  ]);

  const marcheByOrg = new Map(
    marcheTotals.map((m) => [m.organizationId, Number(m._sum.montantMarcheHtCents ?? BigInt(0))])
  );
  const ftmByOrg = new Map(
    ftmTotals.map((f) => [f.organizationId, Number(f._sum.amountHtCents ?? BigInt(0))])
  );

  const situationsByOrg = new Map<string, typeof allSituations>();
  for (const s of allSituations) {
    const arr = situationsByOrg.get(s.organizationId) ?? [];
    arr.push(s);
    situationsByOrg.set(s.organizationId, arr);
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
    const situations = (situationsByOrg.get(org.id) ?? []).map((s) => ({
      id: s.id,
      numero: s.numero,
      periodLabel: s.periodLabel,
      status: s.status as string,
      cumulativeAmountHtCents: Number(s.cumulativeAmountHtCents),
      moeAdjustedAmountHtCents: s.moeAdjustedAmountHtCents != null ? Number(s.moeAdjustedAmountHtCents) : null,
      acceptedCumulativeHtCents: s.acceptedCumulativeHtCents != null ? Number(s.acceptedCumulativeHtCents) : null,
      periodNetBeforeDeductionsHtCents: s.periodNetBeforeDeductionsHtCents != null ? Number(s.periodNetBeforeDeductionsHtCents) : null,
      retenueGarantieAmountCents: s.retenueGarantieAmountCents != null ? Number(s.retenueGarantieAmountCents) : null,
      avanceTravauxRemboursementCents: s.avanceTravauxRemboursementCents != null ? Number(s.avanceTravauxRemboursementCents) : null,
      penaltyAmountCents: s.penaltyAmountCents != null ? Number(s.penaltyAmountCents) : null,
      netAmountHtCents: s.netAmountHtCents != null ? Number(s.netAmountHtCents) : null,
    }));

    const marcheBase = marcheByOrg.get(org.id) ?? 0;
    const ftmValide = ftmByOrg.get(org.id) ?? 0;
    const marcheActuel = marcheBase + ftmValide;

    const approvedSituations = situations.filter((s) => s.status === "MOA_APPROVED");
    const lastApproved = approvedSituations[approvedSituations.length - 1] ?? null;
    const cumulatifApprouve = lastApproved?.acceptedCumulativeHtCents ?? 0;
    const totalNetPaye = approvedSituations.reduce((sum, s) => sum + (s.netAmountHtCents ?? 0), 0);

    return {
      org: { id: org.id, name: org.name },
      marcheBase,
      ftmValide,
      marcheActuel,
      cumulatifApprouve,
      totalNetPaye,
      situations,
    };
  });
}

/** Cumulative amount from last MOA_APPROVED situation for this org */
export async function getPreviousApprovedCumulative(
  projectId: string,
  orgId: string,
  beforeNumero: number
): Promise<bigint> {
  const prev = await prisma.situationTravaux.findFirst({
    where: {
      projectId,
      organizationId: orgId,
      status: "MOA_APPROVED",
      numero: { lt: beforeNumero },
    },
    orderBy: { numero: "desc" },
    select: { acceptedCumulativeHtCents: true },
  });
  return prev?.acceptedCumulativeHtCents ?? BigInt(0);
}
