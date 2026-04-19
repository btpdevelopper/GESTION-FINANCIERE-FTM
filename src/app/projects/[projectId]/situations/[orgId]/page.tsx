import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthUser } from "@/lib/auth/user";
import { requireProjectMember } from "@/server/membership";
import { getSituationsForOrg } from "@/server/situations/situation-queries";
import { prisma } from "@/lib/prisma";
import { Capability, ProjectRole, SituationStatus } from "@prisma/client";
import { can } from "@/lib/permissions/resolve";
import { ChevronRight, CheckCircle, XCircle, AlertCircle, Clock } from "lucide-react";
import { NewSituationForm } from "./new-situation-form";
import { StatusBadge } from "@/components/ui/badge";

const STATUS_CONFIG: Record<SituationStatus, { label: string; icon: React.ReactNode }> = {
  DRAFT: { label: "Brouillon", icon: <Clock className="h-3 w-3" /> },
  SUBMITTED: { label: "Soumis au MOE", icon: <Clock className="h-3 w-3" /> },
  MOE_CORRECTION: { label: "En correction", icon: <AlertCircle className="h-3 w-3" /> },
  MOE_APPROVED: { label: "Approuvé MOE", icon: <CheckCircle className="h-3 w-3" /> },
  MOA_APPROVED: { label: "Validé MOA", icon: <CheckCircle className="h-3 w-3" /> },
  MOE_REFUSED: { label: "Refusé MOE", icon: <XCircle className="h-3 w-3" /> },
  MOA_REFUSED: { label: "Refusé MOA", icon: <XCircle className="h-3 w-3" /> },
};

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
      s.status === SituationStatus.MOE_CORRECTION,
  );
  const lastSituation = situations[situations.length - 1] ?? null;
  const canCreate =
    canSubmit &&
    !hasOpenSituation &&
    (lastSituation === null || lastSituation.status === SituationStatus.MOA_APPROVED);

  return (
    <div className="max-w-3xl space-y-4">
      <div>
        <Link
          href={`/projects/${projectId}/situations`}
          className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        >
          ← Retour aux entreprises
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Situations — {org.name}
        </h1>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{project.name}</p>
      </div>

      {canCreate && <NewSituationForm projectId={projectId} />}

      {situations.length === 0 ? (
        <div className="rounded border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          Aucune situation soumise pour le moment.
        </div>
      ) : (
        <div className="divide-y divide-slate-100 rounded border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {[...situations].reverse().map((s) => {
            const cfg = STATUS_CONFIG[s.status];
            return (
              <Link
                key={s.id}
                href={`/projects/${projectId}/situations/${orgId}/${s.id}`}
                className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    Situation n°{s.numero} — {formatPeriod(s.periodLabel)}
                  </p>
                  <p className="text-xs text-slate-500">
                    Montant cumulé : {formatEur(s.cumulativeAmountHtCents)}
                    {s.status === SituationStatus.MOA_APPROVED && s.netAmountHtCents !== null && (
                      <>
                        {" · "}Net à payer :{" "}
                        <strong>{formatEur(s.netAmountHtCents)}</strong>
                      </>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={s.status} label={cfg.label} icon={cfg.icon} />
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
