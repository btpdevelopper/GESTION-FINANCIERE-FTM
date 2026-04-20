import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthUser } from "@/lib/auth/user";
import { requireProjectMember } from "@/server/membership";
import { getPenaltiesDashboardData } from "@/server/penalties/penalty-queries";
import { prisma } from "@/lib/prisma";
import { ProjectRole } from "@prisma/client";
import { AlertTriangle, ChevronRight, ShieldAlert } from "lucide-react";
import { CountBadge, StatusBadge } from "@/components/ui";

function formatEur(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export default async function PenaltiesOverviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await getAuthUser();
  if (!user?.id) notFound();

  const pm = await requireProjectMember(user.id, projectId);

  // ENTREPRISE: redirect to own company view
  if (pm.role === ProjectRole.ENTREPRISE) {
    const { redirect } = await import("next/navigation");
    redirect(`/projects/${projectId}/penalties/${pm.organizationId}`);
  }

  // Only MOE and MOA can access the management overview
  if (pm.role !== ProjectRole.MOA && pm.role !== ProjectRole.MOE) notFound();

  const [project, dashboardData] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
    getPenaltiesDashboardData(projectId),
  ]);
  if (!project) notFound();

  const totalContested = dashboardData.reduce((s, d) => s + d.counts.contested, 0);
  const totalSubmitted = dashboardData.reduce((s, d) => s + d.counts.submitted, 0);

  return (
    <div className="max-w-5xl space-y-4">
      <div>
        <Link
          href={`/projects/${projectId}`}
          className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        >
          ← Tableau de bord
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Pénalités
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Gestion des pénalités par entreprise — {project.name}
        </p>
      </div>

      {/* Summary bar */}
      {(totalSubmitted > 0 || totalContested > 0) && (
        <div className="flex flex-wrap gap-3">
          {totalSubmitted > 0 && (
            <div className="flex items-center gap-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-300">
              <ShieldAlert className="h-3.5 w-3.5" />
              <strong>{totalSubmitted}</strong> pénalité{totalSubmitted > 1 ? "s" : ""} en attente d&apos;approbation MOA
            </div>
          )}
          {totalContested > 0 && (
            <div className="flex items-center gap-2 rounded border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-700 dark:border-orange-900/50 dark:bg-orange-950/20 dark:text-orange-300">
              <AlertTriangle className="h-3.5 w-3.5" />
              <strong>{totalContested}</strong> contestation{totalContested > 1 ? "s" : ""} à traiter
            </div>
          )}
        </div>
      )}

      {dashboardData.length === 0 ? (
        <div className="rounded border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Aucune entreprise associée à ce projet.
        </div>
      ) : (
        <div className="rounded border border-slate-200 dark:border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500">Entreprise</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Brouillons</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">En attente MOA</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Actives</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Contestées</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500">Total actif</th>
                <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-900">
              {dashboardData.map(({ org, counts, totalActiveCents }) => {
                const hasAction = counts.submitted > 0 || counts.contested > 0;
                return (
                  <tr
                    key={org.id}
                    className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${hasAction ? "border-l-4 border-l-amber-400" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-slate-900 dark:text-slate-100">{org.name}</span>
                        {hasAction && (
                          <CountBadge count={counts.submitted + counts.contested} />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-500">{counts.draft || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      {counts.submitted > 0 ? (
                        <StatusBadge status="SUBMITTED" label={String(counts.submitted)} />
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {counts.approved > 0 ? (
                        <StatusBadge status="MOA_APPROVED" label={String(counts.approved)} />
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {counts.contested > 0 ? (
                        <StatusBadge status="CONTESTED" label={String(counts.contested)} />
                      ) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-red-700 dark:text-red-400">
                      {totalActiveCents > 0 ? formatEur(totalActiveCents) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/projects/${projectId}/penalties/${org.id}`}
                        className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                      >
                        Gérer <ChevronRight className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
