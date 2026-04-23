"use server";

import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/user";
import { requireProjectMember } from "@/server/membership";
import { PenaltyStatus, SituationStatus } from "@prisma/client";

const ACTIVE_PENALTY_STATUSES: PenaltyStatus[] = [PenaltyStatus.MOA_APPROVED, PenaltyStatus.MAINTAINED];

const PENALTY_INCLUDE = {
  createdBy: { include: { user: true } },
  organization: { select: { id: true, name: true } },
  situation: { select: { id: true, numero: true, periodLabel: true } },
  reviews: {
    orderBy: { createdAt: "asc" as const },
    include: { member: { include: { user: true } } },
  },
} as const;

/** All penalties across all companies (MOE/MOA global view). */
export async function getProjectPenalties(projectId: string) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  await requireProjectMember(user.id, projectId);

  return prisma.penalty.findMany({
    where: { projectId },
    include: PENALTY_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

/** All penalties for a single company (per-company view). */
export async function getCompanyPenalties(projectId: string, orgId: string) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  await requireProjectMember(user.id, projectId);

  return prisma.penalty.findMany({
    where: { projectId, organizationId: orgId },
    include: PENALTY_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

/** Active (MOA_APPROVED or MAINTAINED) penalties linked to a specific situation. */
export async function getPenaltiesForSituation(situationId: string) {
  return prisma.penalty.findMany({
    where: {
      situationId,
      status: { in: ACTIVE_PENALTY_STATUSES },
    },
    select: { id: true, label: true, frozenAmountCents: true, status: true },
  });
}

/** Own penalties visible to an ENTREPRISE user for contesting. */
export async function getOwnPenalties(projectId: string, orgId: string) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, projectId);

  if (pm.role !== "ENTREPRISE" || pm.organizationId !== orgId) {
    throw new Error("Accès refusé.");
  }

  return prisma.penalty.findMany({
    where: {
      projectId,
      organizationId: orgId,
      OR: [
        { status: { in: [PenaltyStatus.MOA_APPROVED, PenaltyStatus.CONTESTED, PenaltyStatus.MAINTAINED] } },
        { status: PenaltyStatus.CANCELLED, reviews: { some: { action: "CONTESTED" } } },
      ],
    },
    include: PENALTY_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Upcoming situations eligible as penalty targets:
 * any situation not yet MOA_APPROVED for this org.
 */
export async function getEligibleSituationsForPenalty(projectId: string, orgId: string) {
  return prisma.situationTravaux.findMany({
    where: {
      projectId,
      organizationId: orgId,
      status: { notIn: [SituationStatus.MOA_APPROVED, SituationStatus.MOE_REFUSED, SituationStatus.MOA_REFUSED] },
    },
    select: { id: true, numero: true, periodLabel: true, status: true },
    orderBy: { numero: "asc" },
  });
}

/** Summary counts per org for the global dashboard. */
export async function getPenaltiesDashboardData(projectId: string) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  await requireProjectMember(user.id, projectId);

  const [members, allPenalties] = await Promise.all([
    prisma.projectMember.findMany({
      where: { projectId, role: "ENTREPRISE" },
      include: { organization: { select: { id: true, name: true } } },
      distinct: ["organizationId"],
    }),
    prisma.penalty.findMany({
      where: { projectId },
      select: {
        organizationId: true,
        status: true,
        frozenAmountCents: true,
      },
    }),
  ]);

  const seen = new Set<string>();
  const orgs = members
    .filter((m) => { if (seen.has(m.organizationId)) return false; seen.add(m.organizationId); return true; })
    .map((m) => m.organization);

  const byOrg = new Map<string, typeof allPenalties>();
  for (const p of allPenalties) {
    const arr = byOrg.get(p.organizationId) ?? [];
    arr.push(p);
    byOrg.set(p.organizationId, arr);
  }

  return orgs.map((org) => {
    const penalties = byOrg.get(org.id) ?? [];
    const active = penalties.filter((p) => ACTIVE_PENALTY_STATUSES.includes(p.status as PenaltyStatus));
    const totalActiveCents = active.reduce((s, p) => s + Number(p.frozenAmountCents ?? 0), 0);

    return {
      org: { id: org.id, name: org.name },
      counts: {
        draft: penalties.filter((p) => p.status === PenaltyStatus.DRAFT).length,
        submitted: penalties.filter((p) => p.status === PenaltyStatus.SUBMITTED).length,
        approved: active.length,
        contested: penalties.filter((p) => p.status === PenaltyStatus.CONTESTED).length,
        cancelled: penalties.filter((p) => p.status === PenaltyStatus.CANCELLED || p.status === PenaltyStatus.MOA_REFUSED).length,
      },
      totalActiveCents,
    };
  });
}
