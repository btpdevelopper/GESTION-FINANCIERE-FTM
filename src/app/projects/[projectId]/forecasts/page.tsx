import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/user";
import { requireProjectMember } from "@/server/membership";
import { getProjectForecasts, getForecastsDashboardData } from "@/server/forecast/forecast-queries";
import { getProjectEnterpriseOrgs } from "@/server/situations/situation-queries";
import { ForecastsDashboard } from "./_components/forecasts-dashboard";
import { prisma } from "@/lib/prisma";
import { Capability, ForecastStatus, ProjectRole } from "@prisma/client";
import { can } from "@/lib/permissions/resolve";
import { FileBarChart, ChevronRight, AlertCircle, CheckCircle, XCircle, Clock } from "lucide-react";
import { StatusBadge, CountBadge } from "@/components/ui";
import { SetForecastWaivedButton } from "./set-forecast-waived-button";

const STATUS_CONFIG: Record<ForecastStatus, { label: string; icon: React.ReactNode }> = {
  DRAFT:          { label: "Brouillon",        icon: <Clock className="h-3 w-3" /> },
  SUBMITTED:      { label: "Soumis au MOE",    icon: <Clock className="h-3 w-3" /> },
  MOE_CORRECTION: { label: "En correction",    icon: <AlertCircle className="h-3 w-3" /> },
  MOE_APPROVED:   { label: "Approuvé MOE",     icon: <CheckCircle className="h-3 w-3" /> },
  MOA_APPROVED:   { label: "Validé MOA",       icon: <CheckCircle className="h-3 w-3" /> },
  MOE_REFUSED:    { label: "Refusé MOE",       icon: <XCircle className="h-3 w-3" /> },
  MOA_REFUSED:    { label: "Refusé MOA",       icon: <XCircle className="h-3 w-3" /> },
};

function isActionRequired(status: ForecastStatus, role: ProjectRole, orgId: string, forecastOrgId: string): boolean {
  if (role === ProjectRole.MOE) return status === ForecastStatus.SUBMITTED;
  if (role === ProjectRole.MOA) return status === ForecastStatus.MOE_APPROVED;
  if (role === ProjectRole.ENTREPRISE) return status === ForecastStatus.MOE_CORRECTION && forecastOrgId === orgId;
  return false;
}

export default async function ForecastsOverviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await getAuthUser();
  if (!user?.id) notFound();

  const pm = await requireProjectMember(user.id, projectId);

  if (pm.role === ProjectRole.ENTREPRISE) {
    redirect(`/projects/${projectId}/forecasts/${pm.organizationId}`);
  }

  const [project, enterprises, forecasts, canWaive, dashboardData] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
    getProjectEnterpriseOrgs(projectId),
    getProjectForecasts(projectId),
    can(pm.id, Capability.REVIEW_FORECAST_MOE),
    getForecastsDashboardData(projectId),
  ]);
  if (!project) notFound();

  // Fetch contract settings for waiver status
  const contractSettings = await prisma.companyContractSettings.findMany({
    where: { projectId, organizationId: { in: enterprises.map((e) => e.id) } },
    select: { organizationId: true, forecastWaived: true },
  });
  const waiverByOrg = new Map(contractSettings.map((s) => [s.organizationId, s.forecastWaived]));

  const forecastByOrg = new Map(forecasts.map((f) => [f.organizationId, f]));

  return (
    <div className="max-w-6xl space-y-4">
      <div>
        <Link
          href={`/projects/${projectId}`}
          className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        >
          ← Tableau de bord
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Prévisionnels
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Plans de facturation mensuels par entreprise — {project.name}
        </p>
      </div>

      <ForecastsDashboard data={dashboardData} />

      {enterprises.length === 0 ? (
        <div className="rounded border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Aucune entreprise n&apos;est encore associée à ce projet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {enterprises.map((org) => {
            const forecast = forecastByOrg.get(org.id);
            const waived = waiverByOrg.get(org.id) ?? false;
            const cfg = forecast ? STATUS_CONFIG[forecast.status] : null;
            const actionRequired =
              forecast &&
              isActionRequired(forecast.status, pm.role, pm.organizationId, forecast.organizationId);

            return (
              <div key={org.id} className="flex flex-col gap-2">
                <Link
                  href={`/projects/${projectId}/forecasts/${org.id}`}
                  className={`flex flex-col rounded border bg-white p-4 transition-colors hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/60 ${
                    actionRequired
                      ? "border-l-4 border-amber-400 border-r-slate-200 border-t-slate-200 border-b-slate-200 dark:border-r-slate-800 dark:border-t-slate-800 dark:border-b-slate-800"
                      : "border-slate-200 hover:border-slate-300 dark:border-slate-800 dark:hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-slate-100 dark:bg-slate-800">
                      <FileBarChart className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                    </div>
                    <div className="flex items-center gap-1.5">
                      {actionRequired && (
                        <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          À traiter
                        </span>
                      )}
                      {waived && (
                        <span className="rounded bg-slate-300 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-600 dark:text-slate-200">
                          Dispensé
                        </span>
                      )}
                      {cfg && (
                        <StatusBadge status={forecast!.status} label={cfg.label} icon={cfg.icon} />
                      )}
                    </div>
                  </div>
                  <div className="mt-3">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {org.name}
                    </p>
                    {forecast ? (
                      <p className="mt-0.5 text-xs text-slate-500">
                        Indice {forecast.indice}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs italic text-slate-400">
                        Aucun prévisionnel soumis
                      </p>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-1 text-xs text-slate-400">
                    Voir le prévisionnel
                    <ChevronRight className="h-3 w-3" />
                  </div>
                </Link>

                {canWaive && (
                  <SetForecastWaivedButton
                    projectId={projectId}
                    organizationId={org.id}
                    waived={waived}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
