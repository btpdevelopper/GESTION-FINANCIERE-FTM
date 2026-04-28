import { prisma } from "@/lib/prisma";
import { fetchInseeIndex } from "@/lib/revision/insee-fetcher";

export type RevisionConfigWithComponents = Awaited<ReturnType<typeof getRevisionIndexConfig>>;
export type PendingRegularizationWithSource = Awaited<
  ReturnType<typeof getPendingRegularizationsForOrg>
>[number];

/**
 * Returns the full config + components for an org, or null if none configured.
 */
export async function getRevisionIndexConfig(projectId: string, organizationId: string) {
  return prisma.revisionIndexConfig.findUnique({
    where: { projectId_organizationId: { projectId, organizationId } },
    include: { components: { orderBy: { label: "asc" } } },
  });
}

/**
 * For each index component, tries to fetch Index_n from INSEE for `period`.
 * Returns a map: componentId → { value, isProvisional, enteredByUser }.
 *
 * `isProvisional` is always true at this stage — the Inngest job
 * upgrades logs to definitive later.
 */
export async function resolveIndexValuesForPeriod(
  components: { id: string; idbank: string }[],
  period: string // "YYYY-MM"
): Promise<
  Map<
    string,
    { value: number | null; isProvisional: boolean; enteredByUser: boolean }
  >
> {
  const results = new Map<
    string,
    { value: number | null; isProvisional: boolean; enteredByUser: boolean }
  >();

  await Promise.all(
    components.map(async (comp) => {
      const obs = await fetchInseeIndex(comp.idbank, period);
      results.set(comp.id, {
        value: obs?.value ?? null,
        isProvisional: true, // always provisional at submission time
        enteredByUser: obs === null,
      });
    })
  );

  return results;
}

/**
 * Returns all PENDING regularizations for an org, enriched with source situation info.
 * Used to display the catch-up checklist when creating a new situation draft.
 */
export async function getPendingRegularizationsForOrg(
  projectId: string,
  organizationId: string
) {
  return prisma.pendingRegularization.findMany({
    where: { projectId, organizationId, status: "PENDING" },
    include: {
      sourceSituation: { select: { numero: true, periodLabel: true } },
      component: { select: { label: true, idbank: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}
