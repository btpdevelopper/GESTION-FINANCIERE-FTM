import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/user";
import { requireProjectMember } from "@/server/membership";
import { getProjectSituations, getProjectEnterpriseOrgs, getSituationsDashboardData } from "@/server/situations/situation-queries";
import { prisma } from "@/lib/prisma";
import { ProjectRole, SituationStatus } from "@prisma/client";
import { FileText, Clock, CheckCircle, XCircle, AlertCircle, ChevronRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { SituationsDashboard } from "./_components/situations-dashboard";

function formatPeriod(periodLabel: string): string {
  if (/^\d{4}-\d{2}$/.test(periodLabel)) {
    const [year, month] = periodLabel.split("-");
    const label = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  return periodLabel;
}

const STATUS_CONFIG: Record<SituationStatus, { label: string; icon: React.ReactNode }> = {
  DRAFT: { label: "Brouillon", icon: <Clock className="h-3 w-3" /> },
  SUBMITTED: { label: "Soumis au MOE", icon: <Clock className="h-3 w-3" /> },
  MOE_CORRECTION: { label: "En correction", icon: <AlertCircle className="h-3 w-3" /> },
  MOE_APPROVED: { label: "Approuvé MOE", icon: <CheckCircle className="h-3 w-3" /> },
  MOA_APPROVED: { label: "Validé MOA", icon: <CheckCircle className="h-3 w-3" /> },
  MOE_REFUSED: { label: "Refusé MOE", icon: <XCircle className="h-3 w-3" /> },
  MOA_REFUSED: { label: "Refusé MOA", icon: <XCircle className="h-3 w-3" /> },
};

function isActionRequired(
  status: SituationStatus,
  role: ProjectRole,
  orgId: string,
  situationOrgId: string,
): boolean {
  if (role === ProjectRole.MOE) return status === SituationStatus.SUBMITTED;
  if (role === ProjectRole.MOA) return status === SituationStatus.MOE_APPROVED;
  if (role === ProjectRole.ENTREPRISE)
    return status === SituationStatus.MOE_CORRECTION && situationOrgId === orgId;
  return false;
}

export default async function SituationsProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await getAuthUser();
  if (!user?.id) notFound();

  const pm = await requireProjectMember(user.id, projectId);

  if (pm.role === ProjectRole.ENTREPRISE) {
    redirect(`/projects/${projectId}/situations/${pm.organizationId}`);
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true },
  });
  if (!project) notFound();

  const [latestSituations, enterprises, dashboardData] = await Promise.all([
    getProjectSituations(projectId),
    getProjectEnterpriseOrgs(projectId),
    getSituationsDashboardData(projectId),
  ]);

  const situationByOrg = new Map(latestSituations.map((s) => [s.organizationId, s]));

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <Link
          href={`/projects/${projectId}`}
          className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        >
          ← Tableau de bord
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Situations de travaux
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Avancements mensuels par entreprise — {project.name}
        </p>
      </div>

      {/* Financial dashboard — MOE/MOA only (ENTREPRISE are redirected above) */}
      {dashboardData.length > 0 && (
        <SituationsDashboard data={dashboardData} projectId={projectId} />
      )}

      {/* Per-org quick-access cards */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Accès par entreprise
        </p>
        {enterprises.length === 0 ? (
          <div className="rounded border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
            Aucune entreprise n&apos;est encore associée à ce projet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {enterprises.map((org) => {
              const latest = situationByOrg.get(org.id);
              const cfg = latest ? STATUS_CONFIG[latest.status] : null;
              const actionRequired =
                latest &&
                isActionRequired(latest.status, pm.role, pm.organizationId, latest.organizationId);

              return (
                <Link
                  key={org.id}
                  href={`/projects/${projectId}/situations/${org.id}`}
                  className={`flex flex-col rounded border bg-white p-4 transition-colors hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/60 ${
                    actionRequired
                      ? "border-l-4 border-amber-400 border-r-slate-200 border-t-slate-200 border-b-slate-200 dark:border-r-slate-800 dark:border-t-slate-800 dark:border-b-slate-800"
                      : "border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-slate-100 dark:bg-slate-800">
                      <FileText className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      {actionRequired && (
                        <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          À traiter
                        </span>
                      )}
                      {cfg && (
                        <StatusBadge status={latest!.status} label={cfg.label} icon={cfg.icon} />
                      )}
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {org.name}
                    </p>
                    {latest ? (
                      <p className="mt-0.5 text-xs text-slate-500">
                        Situation n°{latest.numero} — {formatPeriod(latest.periodLabel)}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs italic text-slate-400">
                        Aucune situation soumise
                      </p>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-1 text-xs text-slate-400">
                    Voir les situations
                    <ChevronRight className="h-3 w-3" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
