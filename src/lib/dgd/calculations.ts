import type { CompanyContractSettings } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// ─── Types ───────────────────────────────────────────────────────────────────

export type DgdTotals = {
  marcheBaseHtCents: bigint;
  ftmAcceptedTotalHtCents: bigint;
  marcheActualiseHtCents: bigint;
  penaltiesTotalHtCents: bigint;
  retenueGarantieCents: bigint;
  cautionBancaireActive: boolean;
  acomptesVersesHtCents: bigint;
  soldeDgdHtCents: bigint;
};

export type DgdLotBreakdown = {
  lotId: string;
  lotLabel: string;
  montantMarcheHtCents: bigint;
};

export type DgdTotalsWithLots = DgdTotals & {
  lots: DgdLotBreakdown[];
};

// ─── Core calculation ────────────────────────────────────────────────────────

/**
 * Computes the full DGD financial breakdown for a given organization on a project.
 *
 * Reuses existing query patterns from situation-queries for marché, FTMs, and penalties.
 * Adds the gross cumulative acomptes query (last approved situation cumulative).
 *
 * The retenue de garantie uses CompanyContractSettings.retenueGarantiePercent
 * and is zeroed if cautionBancaireActive is true.
 *
 * Formula:
 *   soldeDgd = marchéActualisé - pénalités - retenueGarantie - acomptesVersés
 */
export async function calculateDgdTotals(
  projectId: string,
  organizationId: string,
): Promise<DgdTotalsWithLots> {
  const [
    marcheBase,
    ftmAccepted,
    activePenalties,
    lastApprovedCumulative,
    contractSettings,
    lots,
  ] = await Promise.all([
    getOrgMarcheBase(projectId, organizationId),
    getOrgAcceptedFtmTotal(projectId, organizationId),
    getOrgActivePenaltiesTotal(projectId, organizationId),
    getOrgLastApprovedCumulative(projectId, organizationId),
    getContractSettings(projectId, organizationId),
    getOrgLotBreakdown(projectId, organizationId),
  ]);

  const marcheActualise = marcheBase + ftmAccepted;
  const cautionActive = contractSettings?.cautionBancaireActive ?? false;
  const retenue = computeRetenueGarantie(marcheActualise, contractSettings, cautionActive);
  const solde = marcheActualise - activePenalties - retenue - lastApprovedCumulative;

  return {
    marcheBaseHtCents: marcheBase,
    ftmAcceptedTotalHtCents: ftmAccepted,
    marcheActualiseHtCents: marcheActualise,
    penaltiesTotalHtCents: activePenalties,
    retenueGarantieCents: retenue,
    cautionBancaireActive: cautionActive,
    acomptesVersesHtCents: lastApprovedCumulative,
    soldeDgdHtCents: solde,
    lots,
  };
}

// ─── Pure computation (no DB, testable) ──────────────────────────────────────

/**
 * Computes the retenue de garantie for the DGD.
 *
 * If cautionBancaireActive is true, returns 0 (the bank guarantee replaces the holdback).
 * Otherwise, uses retenueGarantiePercent from contract settings.
 * Percent is stored as Decimal(5,2) — e.g., 5.00 means 5%.
 */
export function computeRetenueGarantie(
  marcheActualiseHtCents: bigint,
  contractSettings: Pick<CompanyContractSettings, "retenueGarantieActive" | "retenueGarantiePercent"> | null,
  cautionBancaireActive: boolean,
): bigint {
  const zero = BigInt(0);
  if (cautionBancaireActive) return zero;
  if (!contractSettings?.retenueGarantieActive) return zero;
  if (!contractSettings.retenueGarantiePercent) return zero;

  // retenueGarantiePercent is Decimal(5,2), e.g. 5.00 for 5%
  // Convert to basis points: 5.00 → 500
  const basisPoints = BigInt(Math.round(Number(contractSettings.retenueGarantiePercent) * 100));
  return (marcheActualiseHtCents * basisPoints) / BigInt(10_000);
}

/**
 * Computes the DGD solde from pre-computed totals (pure function, no DB).
 * Useful for MOE adjustments and amicable resolutions.
 */
export function computeSoldeDgd(
  marcheActualiseHtCents: bigint,
  penaltiesTotalHtCents: bigint,
  retenueGarantieCents: bigint,
  acomptesVersesHtCents: bigint,
): bigint {
  return marcheActualiseHtCents - penaltiesTotalHtCents - retenueGarantieCents - acomptesVersesHtCents;
}

// ─── Query helpers (internal) ────────────────────────────────────────────────

/** Sum of all lot amounts for an org on a project (marché de base). */
async function getOrgMarcheBase(projectId: string, orgId: string): Promise<bigint> {
  const result = await prisma.projectLotOrganization.aggregate({
    where: {
      organizationId: orgId,
      projectLot: { projectId },
    },
    _sum: { montantMarcheHtCents: true },
  });
  return result._sum.montantMarcheHtCents ?? BigInt(0);
}

/** Sum of all ACCEPTED FTM quote amounts for an org on a project. */
async function getOrgAcceptedFtmTotal(projectId: string, orgId: string): Promise<bigint> {
  const result = await prisma.ftmQuoteSubmission.aggregate({
    where: {
      organizationId: orgId,
      ftm: { projectId, phase: "ACCEPTED" },
    },
    _sum: { amountHtCents: true },
  });
  return result._sum.amountHtCents ?? BigInt(0);
}

/** Sum of frozen amounts for all active (MOA_APPROVED + MAINTAINED) penalties. */
async function getOrgActivePenaltiesTotal(projectId: string, orgId: string): Promise<bigint> {
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

/**
 * Accepted cumulative amount from the last MOA_APPROVED situation.
 * This is the GROSS cumulative (before per-situation deductions),
 * representing the total value of work recognized by the MOE/MOA.
 */
async function getOrgLastApprovedCumulative(projectId: string, orgId: string): Promise<bigint> {
  const last = await prisma.situationTravaux.findFirst({
    where: {
      projectId,
      organizationId: orgId,
      status: "MOA_APPROVED",
    },
    orderBy: { numero: "desc" },
    select: { acceptedCumulativeHtCents: true },
  });
  return last?.acceptedCumulativeHtCents ?? BigInt(0);
}

/** Get contract settings for an org (retenue de garantie config + caution bancaire). */
async function getContractSettings(projectId: string, orgId: string) {
  return prisma.companyContractSettings.findUnique({
    where: { projectId_organizationId: { projectId, organizationId: orgId } },
  });
}

/** Lot-level breakdown for UI compartmentalization. */
async function getOrgLotBreakdown(projectId: string, orgId: string): Promise<DgdLotBreakdown[]> {
  const lotOrgs = await prisma.projectLotOrganization.findMany({
    where: {
      organizationId: orgId,
      projectLot: { projectId },
    },
    include: {
      projectLot: { select: { id: true, label: true } },
    },
  });

  return lotOrgs.map((lo) => ({
    lotId: lo.projectLot.id,
    lotLabel: lo.projectLot.label,
    montantMarcheHtCents: lo.montantMarcheHtCents,
  }));
}

// ─── Pre-condition checks ────────────────────────────────────────────────────

/**
 * Checks whether an ENTREPRISE is eligible to create/submit a DGD.
 * Returns null if eligible, or a descriptive error message if not.
 */
export async function checkDgdEligibility(
  projectId: string,
  organizationId: string,
): Promise<string | null> {
  // 1. Check if a DGD already exists for this org
  const existingDgd = await prisma.dgdRecord.findUnique({
    where: { projectId_organizationId: { projectId, organizationId } },
    select: { id: true, status: true },
  });
  if (existingDgd) {
    return `Un DGD existe déjà pour cette entreprise (statut: ${existingDgd.status}).`;
  }

  // 2. Check if any situations are still open (non-terminal)
  const openSituation = await prisma.situationTravaux.findFirst({
    where: {
      projectId,
      organizationId,
      status: { notIn: ["MOA_APPROVED", "MOE_REFUSED", "MOA_REFUSED"] },
    },
    select: { numero: true, status: true },
  });
  if (openSituation) {
    return `La situation N°${openSituation.numero} est encore en cours (${openSituation.status}). Toutes les situations doivent être clôturées avant de créer le DGD.`;
  }

  // 3. Ensure at least one approved situation exists
  const approvedCount = await prisma.situationTravaux.count({
    where: { projectId, organizationId, status: "MOA_APPROVED" },
  });
  if (approvedCount === 0) {
    return "Aucune situation validée (MOA_APPROVED) n'existe. Au moins une situation doit être validée avant de créer le DGD.";
  }

  return null;
}

/**
 * Terminal statuses where the DGD is locked and no further standard edits are possible.
 */
export const DGD_TERMINAL_STATUSES = [
  "APPROVED",
  "RESOLVED_AMICABLY",
  "IN_LITIGATION",
  "RESOLVED_BY_COURT",
] as const;

/**
 * Returns the effective final solde of a DGD, considering MOE adjustments,
 * amicable resolution, and court decisions.
 */
export function getEffectiveSolde(dgd: {
  soldeDgdHtCents: bigint | null;
  moeAdjustedSoldeHtCents: bigint | null;
  amicableAdjustedSoldeHtCents: bigint | null;
  courtSoldeHtCents: bigint | null;
  status: string;
}): bigint | null {
  if (dgd.status === "RESOLVED_BY_COURT" && dgd.courtSoldeHtCents !== null) {
    return dgd.courtSoldeHtCents;
  }
  if (dgd.status === "RESOLVED_AMICABLY" && dgd.amicableAdjustedSoldeHtCents !== null) {
    return dgd.amicableAdjustedSoldeHtCents;
  }
  if (dgd.moeAdjustedSoldeHtCents !== null) {
    return dgd.moeAdjustedSoldeHtCents;
  }
  return dgd.soldeDgdHtCents;
}
