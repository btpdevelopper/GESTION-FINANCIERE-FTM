import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthUser } from "@/lib/auth/user";
import { requireProjectMember } from "@/server/membership";
import { getCompanyPenalties, getEligibleSituationsForPenalty, getOwnPenalties } from "@/server/penalties/penalty-queries";
import { getOrgMarcheTotalCents, getOrgApprovedFtmTotalCents } from "@/server/situations/situation-queries";
import { Capability, PenaltyStatus, ProjectRole } from "@prisma/client";
import { can } from "@/lib/permissions/resolve";
import { prisma } from "@/lib/prisma";
import { CreatePenaltyForm } from "./_components/create-penalty-form";
import { PenaltyCard } from "./_components/penalty-card";

function formatEur(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

const ACTIVE_STATUSES = new Set<string>([PenaltyStatus.MOA_APPROVED, PenaltyStatus.MAINTAINED]);

export default async function PenaltyCompanyPage({
  params,
}: {
  params: Promise<{ projectId: string; orgId: string }>;
}) {
  const { projectId, orgId } = await params;
  const user = await getAuthUser();
  if (!user?.id) notFound();

  const pm = await requireProjectMember(user.id, projectId);

  const isEntreprise = pm.role === ProjectRole.ENTREPRISE;

  // ENTREPRISE can only see their own org
  if (isEntreprise && pm.organizationId !== orgId) notFound();

  // Role-based access: MOE/MOA always get in; ENTREPRISE only their own org
  if (!isEntreprise && pm.role !== ProjectRole.MOA && pm.role !== ProjectRole.MOE) notFound();

  const [canCreate, canMoaValidate, canContest] = await Promise.all([
    // MOE gets CREATE_PENALTY by role default; MOA gets VALIDATE by role default
    Promise.resolve(pm.role === ProjectRole.MOE || await can(pm.id, Capability.CREATE_PENALTY)),
    Promise.resolve(pm.role === ProjectRole.MOA || await can(pm.id, Capability.VALIDATE_PENALTY_MOA)),
    can(pm.id, Capability.CONTEST_PENALTY),
  ]);

  const [penalties, situations, marcheCents, ftmCents, org] = await Promise.all([
    isEntreprise
      ? getOwnPenalties(projectId, orgId)
      : getCompanyPenalties(projectId, orgId),
    !isEntreprise ? getEligibleSituationsForPenalty(projectId, orgId) : Promise.resolve([]),
    getOrgMarcheTotalCents(projectId, orgId),
    getOrgApprovedFtmTotalCents(projectId, orgId),
    prisma.organization.findUnique({ where: { id: orgId }, select: { name: true } }),
  ]);

  if (!org) notFound();

  const activePenalties = penalties.filter((p) => ACTIVE_STATUSES.has(p.status));
  const totalActiveCents = activePenalties.reduce(
    (s, p) => s + Number(p.frozenAmountCents ?? 0),
    0,
  );

  const backHref = isEntreprise
    ? `/projects/${projectId}`
    : `/projects/${projectId}/penalties`;

  return (
    <div className="max-w-3xl space-y-5">
      {/* Header */}
      <div>
        <Link
          href={backHref}
          className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        >
          {isEntreprise ? "← Tableau de bord" : "← Pénalités"}
        </Link>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Pénalités — {org.name}
            </h1>
            <div className="mt-0.5 flex flex-wrap gap-3 text-xs text-slate-500">
              <span>Marché de base : {formatEur(Number(marcheCents))}</span>
              {Number(ftmCents) > 0 && (
                <span>+ FTMs acceptés : {formatEur(Number(ftmCents))}</span>
              )}
              {totalActiveCents > 0 && (
                <span className="font-semibold text-red-600 dark:text-red-400">
                  Total actif : {formatEur(totalActiveCents)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Create form (MOE only) */}
      {canCreate && !isEntreprise && (
        <CreatePenaltyForm
          projectId={projectId}
          organizationId={orgId}
          marcheTotalCents={Number(marcheCents)}
          approvedFtmTotalCents={Number(ftmCents)}
          eligibleSituations={situations}
        />
      )}

      {/* Penalty list */}
      {penalties.length === 0 ? (
        <div className="rounded border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          {isEntreprise
            ? "Aucune pénalité approuvée pour votre entreprise sur ce projet."
            : "Aucune pénalité créée pour cette entreprise."}
        </div>
      ) : (
        <div className="space-y-3">
          {penalties.map((penalty) => (
            <PenaltyCard
              key={penalty.id}
              penalty={penalty}
              projectId={projectId}
              orgId={orgId}
              pmRole={pm.role}
              canCreate={canCreate}
              canMoaValidate={canMoaValidate}
              canContest={canContest && isEntreprise}
              marcheTotalCents={Number(marcheCents)}
              approvedFtmTotalCents={Number(ftmCents)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
