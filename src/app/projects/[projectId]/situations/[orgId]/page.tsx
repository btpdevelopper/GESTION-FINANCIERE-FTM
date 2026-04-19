import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthUser } from "@/lib/auth/user";
import { requireProjectMember } from "@/server/membership";
import { getSituationsForOrg } from "@/server/situations/situation-queries";
import { prisma } from "@/lib/prisma";
import { Capability, ProjectRole, SituationStatus } from "@prisma/client";
import { can } from "@/lib/permissions/resolve";
import { Plus, ChevronRight, CheckCircle, XCircle, AlertCircle, Clock } from "lucide-react";
import { NewSituationForm } from "./new-situation-form";

const STATUS_CONFIG: Record<SituationStatus, { label: string; color: string; icon: React.ReactNode }> = {
  DRAFT: { label: "Brouillon", color: "bg-slate-100 text-slate-600", icon: <Clock className="h-3.5 w-3.5" /> },
  SUBMITTED: { label: "Soumis au MOE", color: "bg-blue-100 text-blue-700", icon: <Clock className="h-3.5 w-3.5" /> },
  MOE_CORRECTION: { label: "En correction", color: "bg-amber-100 text-amber-700", icon: <AlertCircle className="h-3.5 w-3.5" /> },
  MOE_APPROVED: { label: "Approuvé MOE", color: "bg-teal-100 text-teal-700", icon: <CheckCircle className="h-3.5 w-3.5" /> },
  MOA_APPROVED: { label: "Validé MOA", color: "bg-green-100 text-green-700", icon: <CheckCircle className="h-3.5 w-3.5" /> },
  MOE_REFUSED: { label: "Refusé MOE", color: "bg-red-100 text-red-700", icon: <XCircle className="h-3.5 w-3.5" /> },
  MOA_REFUSED: { label: "Refusé MOA", color: "bg-red-100 text-red-700", icon: <XCircle className="h-3.5 w-3.5" /> },
};

function formatPeriod(periodLabel: string): string {
  if (/^\d{4}-\d{2}$/.test(periodLabel)) {
    const [year, month] = periodLabel.split("-");
    const label = new Date(parseInt(year), parseInt(month) - 1, 1)
      .toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  return periodLabel;
}

function formatEur(cents: bigint | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return (Number(cents) / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export default async function OrgSituationsPage({
  params,
}: {
  params: Promise<{ projectId: string; orgId: string }>;
}) {
  const { projectId, orgId } = await params;
  const user = await getAuthUser();
  if (!user?.id) notFound();

  const pm = await requireProjectMember(user.id, projectId);

  // ENTREPRISE can only view their own org
  if (pm.role === ProjectRole.ENTREPRISE && pm.organizationId !== orgId) notFound();

  const [project, org, situations, canSubmit] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
    getSituationsForOrg(projectId, orgId),
    can(pm.id, Capability.SUBMIT_SITUATION),
  ]);

  if (!project || !org) notFound();

  const hasOpenSituation = situations.some(
    (s) =>
      s.status === SituationStatus.DRAFT ||
      s.status === SituationStatus.SUBMITTED ||
      s.status === SituationStatus.MOE_CORRECTION
  );
  const lastSituation = situations[situations.length - 1] ?? null;
  const canCreate =
    canSubmit &&
    !hasOpenSituation &&
    (lastSituation === null || lastSituation.status === SituationStatus.MOA_APPROVED);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link href={`/projects/${projectId}/situations`} className="text-sm text-slate-600 underline">
          ← Retour aux entreprises
        </Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Situations — {org.name}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{project.name}</p>
      </div>

      {canCreate && (
        <NewSituationForm projectId={projectId} />
      )}

      {situations.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Aucune situation soumise pour le moment.
        </div>
      ) : (
        <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {[...situations].reverse().map((s) => {
            const cfg = STATUS_CONFIG[s.status];
            return (
              <Link
                key={s.id}
                href={`/projects/${projectId}/situations/${orgId}/${s.id}`}
                className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <div>
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    Situation n°{s.numero} — {formatPeriod(s.periodLabel)}
                  </p>
                  <p className="text-sm text-slate-500">
                    Montant cumulé : {formatEur(s.cumulativeAmountHtCents)}
                    {s.status === SituationStatus.MOA_APPROVED && s.netAmountHtCents !== null && (
                      <> · Net à payer : <strong>{formatEur(s.netAmountHtCents)}</strong></>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${cfg.color}`}>
                    {cfg.icon}
                    {cfg.label}
                  </span>
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
