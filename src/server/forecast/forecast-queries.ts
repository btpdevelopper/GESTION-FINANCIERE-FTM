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
