import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/user";
import { requireProjectMember } from "@/server/membership";
import { getProjectSituations, getProjectEnterpriseOrgs } from "@/server/situations/situation-queries";
import { prisma } from "@/lib/prisma";
import { ProjectRole, SituationStatus } from "@prisma/client";
import { FileText, ChevronRight, Clock, CheckCircle, XCircle, AlertCircle } from "lucide-react";

function formatPeriod(periodLabel: string): string {
  if (/^\d{4}-\d{2}$/.test(periodLabel)) {
    const [year, month] = periodLabel.split("-");
    const label = new Date(parseInt(year), parseInt(month) - 1, 1)
      .toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  return periodLabel;
}

const STATUS_CONFIG: Record<SituationStatus, { label: string; color: string; icon: React.ReactNode }> = {
  DRAFT: { label: "Brouillon", color: "bg-slate-100 text-slate-600", icon: <Clock className="h-3.5 w-3.5" /> },
  SUBMITTED: { label: "Soumis au MOE", color: "bg-blue-100 text-blue-700", icon: <Clock className="h-3.5 w-3.5" /> },
  MOE_CORRECTION: { label: "En correction", color: "bg-amber-100 text-amber-700", icon: <AlertCircle className="h-3.5 w-3.5" /> },
  MOE_APPROVED: { label: "Approuvé MOE", color: "bg-teal-100 text-teal-700", icon: <CheckCircle className="h-3.5 w-3.5" /> },
  MOA_APPROVED: { label: "Validé MOA", color: "bg-green-100 text-green-700", icon: <CheckCircle className="h-3.5 w-3.5" /> },
  MOE_REFUSED: { label: "Refusé MOE", color: "bg-red-100 text-red-700", icon: <XCircle className="h-3.5 w-3.5" /> },
  MOA_REFUSED: { label: "Refusé MOA", color: "bg-red-100 text-red-700", icon: <XCircle className="h-3.5 w-3.5" /> },
};

export default async function SituationsProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await getAuthUser();
  if (!user?.id) notFound();

  const pm = await requireProjectMember(user.id, projectId);

  // ENTREPRISE users go directly to their org's situation list
  if (pm.role === ProjectRole.ENTREPRISE) {
    redirect(`/projects/${projectId}/situations/${pm.organizationId}`);
  }

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
  if (!project) notFound();

  const [latestSituations, enterprises] = await Promise.all([
    getProjectSituations(projectId),
    getProjectEnterpriseOrgs(projectId),
  ]);

  const situationByOrg = new Map(latestSituations.map((s) => [s.organizationId, s]));

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <Link href={`/projects/${projectId}`} className="text-sm text-slate-600 underline">
          ← Revenir au tableau de bord
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Situations de travaux
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Avancements mensuels par entreprise — {project.name}
        </p>
      </div>

      {enterprises.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Aucune entreprise n&apos;est encore associée à ce projet.
        </div>
      ) : (
        <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {enterprises.map((org) => {
            const latest = situationByOrg.get(org.id);
            const cfg = latest ? STATUS_CONFIG[latest.status] : null;
            return (
              <Link
                key={org.id}
                href={`/projects/${projectId}/situations/${org.id}`}
                className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                    <FileText className="h-5 w-5 text-slate-600 dark:text-slate-300" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900 dark:text-slate-100">{org.name}</p>
                    {latest ? (
                      <p className="text-sm text-slate-500">
                        Situation n°{latest.numero} — {formatPeriod(latest.periodLabel)}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-400 italic">Aucune situation soumise</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {cfg && (
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.color}`}>
                      {cfg.icon}
                      {cfg.label}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 text-slate-400" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
