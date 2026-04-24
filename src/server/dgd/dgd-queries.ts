"use server";

import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/user";
import { requireProjectMember } from "@/server/membership";
import { getEffectiveSolde } from "@/lib/dgd/calculations";

// ─── Detail query ────────────────────────────────────────────────────────────

export async function getDgdForOrg(projectId: string, orgId: string) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  await requireProjectMember(user.id, projectId);

  return prisma.dgdRecord.findUnique({
    where: { projectId_organizationId: { projectId, organizationId: orgId } },
    include: {
      organization: { select: { id: true, name: true } },
      submittedBy: { include: { user: { select: { name: true, email: true } } } },
      moeReviewedBy: { include: { user: { select: { name: true, email: true } } } },
      moaValidatedBy: { include: { user: { select: { name: true, email: true } } } },
      reviews: {
        orderBy: { createdAt: "asc" },
        include: { member: { include: { user: { select: { name: true, email: true } } } } },
      },
    },
  });
}

// ─── Dashboard query (MOE/MOA consolidated view) ─────────────────────────────

export type DgdDashboardRow = {
  org: { id: string; name: string };
  marcheBase: number;
  ftmValide: number;
  marcheActuel: number;
  penalites: number;
  retenueGarantie: number;
  cautionBancaire: boolean;
  acomptesVerses: number;
  soldeDgd: number | null;
  effectiveSolde: number | null;
  status: string | null;
  dgdId: string | null;
  lots: { lotId: string; lotLabel: string; montantHtCents: number }[];
};

/**
 * Consolidated DGD dashboard data — 5 queries, no N+1.
 * Returns one row per ENTREPRISE organization with their DGD status and financials.
 */
export async function getDgdDashboardData(projectId: string): Promise<DgdDashboardRow[]> {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  await requireProjectMember(user.id, projectId);

  const [members, dgdRecords, marcheTotals, ftmTotals, lotDetails, contractSettings] = await Promise.all([
    prisma.projectMember.findMany({
      where: { projectId, role: "ENTREPRISE" },
      include: { organization: { select: { id: true, name: true } } },
      distinct: ["organizationId"],
    }),
    prisma.dgdRecord.findMany({
      where: { projectId },
      select: {
        id: true,
        organizationId: true,
        status: true,
        marcheBaseHtCents: true,
        ftmAcceptedTotalHtCents: true,
        marcheActualiseHtCents: true,
        penaltiesTotalHtCents: true,
        retenueGarantieCents: true,
        acomptesVersesHtCents: true,
        soldeDgdHtCents: true,
        moeAdjustedSoldeHtCents: true,
        amicableAdjustedSoldeHtCents: true,
        courtSoldeHtCents: true,
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
    prisma.projectLotOrganization.findMany({
      where: { projectLot: { projectId } },
      include: { projectLot: { select: { id: true, label: true } } },
    }),
    prisma.companyContractSettings.findMany({
      where: { projectId },
      select: { organizationId: true, cautionBancaireActive: true },
    }),
  ]);

  const marcheByOrg = new Map(
    marcheTotals.map((m) => [m.organizationId, Number(m._sum.montantMarcheHtCents ?? BigInt(0))])
  );
  const ftmByOrg = new Map(
    ftmTotals.map((f) => [f.organizationId, Number(f._sum.amountHtCents ?? BigInt(0))])
  );
  const dgdByOrg = new Map(dgdRecords.map((d) => [d.organizationId, d]));
  const cautionByOrg = new Map(contractSettings.map((c) => [c.organizationId, c.cautionBancaireActive]));

  const lotsByOrg = new Map<string, { lotId: string; lotLabel: string; montantHtCents: number }[]>();
  for (const lo of lotDetails) {
    const arr = lotsByOrg.get(lo.organizationId) ?? [];
    arr.push({
      lotId: lo.projectLot.id,
      lotLabel: lo.projectLot.label,
      montantHtCents: Number(lo.montantMarcheHtCents),
    });
    lotsByOrg.set(lo.organizationId, arr);
  }

  const seen = new Set<string>();
  const orgs = members
    .filter((m) => { if (seen.has(m.organizationId)) return false; seen.add(m.organizationId); return true; })
    .map((m) => m.organization);

  return orgs.map((org) => {
    const dgd = dgdByOrg.get(org.id) ?? null;
    const marcheBase = marcheByOrg.get(org.id) ?? 0;
    const ftmValide = ftmByOrg.get(org.id) ?? 0;
    const marcheActuel = marcheBase + ftmValide;
    const cautionBancaire = cautionByOrg.get(org.id) ?? false;

    let effectiveSolde: number | null = null;
    if (dgd) {
      const eff = getEffectiveSolde({
        soldeDgdHtCents: dgd.soldeDgdHtCents,
        moeAdjustedSoldeHtCents: dgd.moeAdjustedSoldeHtCents,
        amicableAdjustedSoldeHtCents: dgd.amicableAdjustedSoldeHtCents,
        courtSoldeHtCents: dgd.courtSoldeHtCents,
        status: dgd.status,
      });
      effectiveSolde = eff !== null ? Number(eff) : null;
    }

    return {
      org: { id: org.id, name: org.name },
      marcheBase,
      ftmValide,
      marcheActuel,
      penalites: dgd ? Number(dgd.penaltiesTotalHtCents ?? 0) : 0,
      retenueGarantie: dgd ? Number(dgd.retenueGarantieCents ?? 0) : 0,
      cautionBancaire,
      acomptesVerses: dgd ? Number(dgd.acomptesVersesHtCents ?? 0) : 0,
      soldeDgd: dgd?.soldeDgdHtCents != null ? Number(dgd.soldeDgdHtCents) : null,
      effectiveSolde,
      status: dgd?.status ?? null,
      dgdId: dgd?.id ?? null,
      lots: lotsByOrg.get(org.id) ?? [],
    };
  });
}

/**
 * Check if the current user's company can create a DGD.
 * Returns eligibility info for the UI banner.
 */
export async function getDgdEligibility(projectId: string) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, projectId);

  if (pm.role !== "ENTREPRISE") return { eligible: true, reason: null, role: pm.role };

  // Check for existing DGD
  const existingDgd = await prisma.dgdRecord.findUnique({
    where: { projectId_organizationId: { projectId, organizationId: pm.organizationId } },
    select: { id: true, status: true },
  });

  if (existingDgd) {
    return { eligible: false, reason: null, role: pm.role, existingDgd };
  }

  // Check for open situations
  const openSituations = await prisma.situationTravaux.findMany({
    where: {
      projectId,
      organizationId: pm.organizationId,
      status: { notIn: ["MOA_APPROVED", "MOE_REFUSED", "MOA_REFUSED"] },
    },
    select: { numero: true, status: true, periodLabel: true },
  });

  if (openSituations.length > 0) {
    return {
      eligible: false,
      reason: `${openSituations.length} situation(s) en cours doivent être clôturées avant de créer le DGD.`,
      role: pm.role,
      openSituations,
    };
  }

  // Check that at least one approved situation exists
  const approvedCount = await prisma.situationTravaux.count({
    where: { projectId, organizationId: pm.organizationId, status: "MOA_APPROVED" },
  });

  if (approvedCount === 0) {
    return {
      eligible: false,
      reason: "Aucune situation validée. Au moins une situation doit être validée (MOA_APPROVED) avant de créer le DGD.",
      role: pm.role,
    };
  }

  return { eligible: true, reason: null, role: pm.role };
}
