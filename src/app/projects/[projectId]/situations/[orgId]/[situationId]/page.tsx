import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthUser } from "@/lib/auth/user";
import { requireProjectMember } from "@/server/membership";
import { getSituation, getCompanyContractSettings, getOrgMarcheTotalCents, getOrgApprovedFtmTotalCents, getOrgActivePenaltiesTotalCents, getAcceptedFtmsForOrg } from "@/server/situations/situation-queries";
import { getOwnPenalties } from "@/server/penalties/penalty-queries";
import { getFtmDocumentUrl } from "@/lib/storage";
import { Capability, ForecastStatus, ProjectRole, SituationStatus } from "@prisma/client";
import { can } from "@/lib/permissions/resolve";
import { prisma } from "@/lib/prisma";
import { MoeReviewForm } from "./moe-review-form";
import { MoaValidateForm } from "./moa-validate-form";
import { UpdateDraftForm } from "./update-draft-form";
import { SituationTimeline } from "./situation-timeline";
import { CheckCircle, XCircle, AlertCircle, Clock, FileText, AlertTriangle, ShieldAlert, ChevronRight } from "lucide-react";
import { PenaltyStatus } from "@prisma/client";

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

const STATUS_CONFIG: Record<SituationStatus, { label: string; color: string }> = {
  DRAFT: { label: "Brouillon", color: "bg-slate-100 text-slate-600" },
  SUBMITTED: { label: "Soumis au MOE", color: "bg-blue-100 text-blue-700" },
  MOE_CORRECTION: { label: "En correction", color: "bg-amber-100 text-amber-700" },
  MOE_APPROVED: { label: "Approuvé MOE", color: "bg-teal-100 text-teal-700" },
  MOA_APPROVED: { label: "Validé MOA", color: "bg-green-100 text-green-700" },
  MOE_REFUSED: { label: "Refusé MOE", color: "bg-red-100 text-red-700" },
  MOA_REFUSED: { label: "Refusé MOA", color: "bg-red-100 text-red-700" },
};

export default async function SituationDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; orgId: string; situationId: string }>;
}) {
  const { projectId, orgId, situationId } = await params;
  const user = await getAuthUser();
  if (!user?.id) notFound();

  const pm = await requireProjectMember(user.id, projectId);

  // ENTREPRISE can only see their own org's situations
  if (pm.role === ProjectRole.ENTREPRISE && pm.organizationId !== orgId) notFound();

  const isEntreprise = pm.role === ProjectRole.ENTREPRISE;

  const [situation, contractSettings, canMoeReview, canMoaValidate, canSubmit, marcheTotalBigInt, ftmTotalBigInt, activePenaltiesBigInt, canContest, acceptedFtms] =
    await Promise.all([
      getSituation(projectId, situationId),
      getCompanyContractSettings(projectId, orgId),
      can(pm.id, Capability.REVIEW_SITUATION_MOE),
      can(pm.id, Capability.VALIDATE_SITUATION_MOA),
      can(pm.id, Capability.SUBMIT_SITUATION),
      getOrgMarcheTotalCents(projectId, orgId),
      getOrgApprovedFtmTotalCents(projectId, orgId),
      getOrgActivePenaltiesTotalCents(projectId, orgId),
      can(pm.id, Capability.CONTEST_PENALTY),
      isEntreprise
        ? getAcceptedFtmsForOrg(projectId, orgId)
        : Promise.resolve([] as Awaited<ReturnType<typeof getAcceptedFtmsForOrg>>),
    ]);

  if (!situation || situation.organizationId !== orgId) notFound();

  // Load penalties linked to this situation (for ENTREPRISE + MOE/MOA view)
  const linkedPenalties = await getOwnPenalties(projectId, orgId)
    .then((ps) => ps.filter((p) => p.situationId === situationId))
    .catch(() => []);

  // FTM billing lines for this situation
  const ftmBillings = await prisma.situationFtmBilling.findMany({
    where: { situationId },
    include: { ftmRecord: { select: { id: true, title: true, number: true } } },
    orderBy: { createdAt: "asc" },
  });

  // Fetch approved forecast (all entries) + previous approved situation in parallel
  const [approvedForecast, prevApprovedSituation] = await Promise.all([
    contractSettings?.forecastWaived !== true
      ? prisma.forecast.findFirst({
          where: { projectId, organizationId: orgId, status: ForecastStatus.MOA_APPROVED },
          orderBy: { indice: "desc" },
          select: {
            entries: {
              select: { periodLabel: true, plannedAmountHtCents: true },
              orderBy: { periodLabel: "asc" },
            },
          },
        })
      : Promise.resolve(null),
    prisma.situationTravaux.findFirst({
      where: {
        projectId,
        organizationId: orgId,
        status: SituationStatus.MOA_APPROVED,
        id: { not: situationId },
      },
      orderBy: { numero: "desc" },
      select: { acceptedCumulativeHtCents: true, cumulativeAmountHtCents: true },
    }),
  ]);

  // True when a forecast exists but has no entry for this period
  const forecastMissing =
    contractSettings?.forecastWaived !== true &&
    approvedForecast !== null &&
    !approvedForecast.entries.some((e) => e.periodLabel === situation.periodLabel);

  const forecastEntries =
    approvedForecast?.entries.map((e) => ({
      periodLabel: e.periodLabel,
      plannedAmountHtCents: Number(e.plannedAmountHtCents),
    })) ?? [];
  const forecastWaived = contractSettings?.forecastWaived ?? false;
  const marcheTotalCents = Number(marcheTotalBigInt);
  const ftmTotalCents = Number(ftmTotalBigInt);
  const activePenaltiesCents = Number(activePenaltiesBigInt);
  const effectiveMarcheCents = marcheTotalCents + ftmTotalCents - activePenaltiesCents;
  const previousCumulativeCents = prevApprovedSituation
    ? Number(
        prevApprovedSituation.acceptedCumulativeHtCents ??
          prevApprovedSituation.cumulativeAmountHtCents
      )
    : 0;
  const acceptedCumulativeCents =
    situation.moeAdjustedAmountHtCents != null
      ? Number(situation.moeAdjustedAmountHtCents)
      : Number(situation.cumulativeAmountHtCents);

  // Resolve signed URL for the attached document (1-hour expiry)
  let documentSignedUrl: string | null = null;
  if (situation.documentUrl) {
    try {
      documentSignedUrl = await getFtmDocumentUrl(situation.documentUrl);
    } catch {
      // non-blocking — URL display degrades gracefully
    }
  }

  // Signed URLs for per-submission documents in the timeline
  const reviewDocumentUrls: Record<string, string> = {};
  for (const review of situation.reviews) {
    if (review.documentUrl) {
      try {
        reviewDocumentUrls[review.id] = await getFtmDocumentUrl(review.documentUrl);
      } catch { /* non-blocking */ }
    }
  }

  const declaredFtmCents = ftmBillings
    .filter((b) => b.status !== "MOE_REFUSED" && b.status !== "MOA_REFUSED")
    .reduce((s, b) => s + b.billedAmountCents, BigInt(0));

  const cfg = STATUS_CONFIG[situation.status];
  const isImmutable =
    situation.status === SituationStatus.MOA_APPROVED ||
    situation.status === SituationStatus.MOE_REFUSED ||
    situation.status === SituationStatus.MOA_REFUSED;
  const showFinancials =
    !isEntreprise ||
    situation.status === SituationStatus.MOA_APPROVED;
  const showDraftEdit =
    canSubmit &&
    isEntreprise &&
    (situation.status === SituationStatus.DRAFT || situation.status === SituationStatus.MOE_CORRECTION);

  // Periods already used by OTHER situations for this org (for duplicate-month guard in edit form)
  const usedPeriods: string[] = showDraftEdit
    ? await prisma.situationTravaux
        .findMany({
          where: { projectId, organizationId: orgId, id: { not: situationId } },
          select: { periodLabel: true },
        })
        .then((rows) => rows.map((r) => r.periodLabel))
    : [];

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div>
        <Link href={`/projects/${projectId}/situations/${orgId}`} className="text-sm text-slate-600 underline">
          ← Retour aux situations
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Situation n°{situation.numero} — {formatPeriod(situation.periodLabel)}
          </h1>
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${cfg.color}`}>
            {cfg.label}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">{situation.organization?.name}</p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
          <span>Marché de base : <strong className="text-slate-700 dark:text-slate-300">{formatEur(marcheTotalBigInt)}</strong></span>
          {ftmTotalCents > 0 && (
            <span>+ FTMs : <strong className="text-slate-700 dark:text-slate-300">{formatEur(ftmTotalBigInt)}</strong></span>
          )}
          {activePenaltiesCents > 0 && (
            <span>− Pénalités : <strong className="text-red-600 dark:text-red-400">{formatEur(activePenaltiesBigInt)}</strong></span>
          )}
          {(ftmTotalCents > 0 || activePenaltiesCents > 0) && (
            <span>= Marché effectif : <strong className="text-slate-900 dark:text-slate-100">{formatEur(BigInt(effectiveMarcheCents))}</strong></span>
          )}
        </div>
      </div>

      {/* Hors-prévisionnel warning */}
      {forecastMissing && (
        <div className="flex items-start gap-2.5 rounded border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/20">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-xs text-amber-800 dark:text-amber-300">
            <strong>Hors prévisionnel</strong> — la période {formatPeriod(situation.periodLabel)} ne figure pas dans le prévisionnel approuvé de cette entreprise.
          </p>
        </div>
      )}

      {/* Timeline */}
      <SituationTimeline
        status={situation.status}
        moaStatus={situation.moaStatus}
        createdAt={situation.createdAt}
        orgName={situation.organization?.name ?? null}
        reviews={situation.reviews}
        ftmDeclaredCents={declaredFtmCents}
        reviewDocumentUrls={reviewDocumentUrls}
      />

      {/* Linked penalties — prominent alert */}
      {linkedPenalties.length > 0 && (
        <div className="rounded border-l-4 border-l-red-500 border border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/20">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-red-200 dark:border-red-900/40">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
              <span className="text-sm font-semibold text-red-800 dark:text-red-300">
                Pénalités appliquées à cette situation
              </span>
            </div>
            <span className="text-sm font-bold text-red-700 dark:text-red-400">
              {formatEur(
                linkedPenalties.reduce(
                  (s, p) => s + (p.frozenAmountCents ?? BigInt(0)),
                  BigInt(0),
                ),
              )}
            </span>
          </div>
          <div className="divide-y divide-red-100 dark:divide-red-900/30">
            {linkedPenalties.map((p) => {
              const isContestable = canContest && p.status === PenaltyStatus.MOA_APPROVED;
              const statusLabel =
                p.status === PenaltyStatus.MOA_APPROVED ? "Approuvée" :
                p.status === PenaltyStatus.CONTESTED ? "Contestée" :
                p.status === PenaltyStatus.MAINTAINED ? "Maintenue" : p.status;
              return (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {p.label}
                    </p>
                    <p className="text-xs text-slate-500 mt-0.5">{statusLabel}</p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-red-700 dark:text-red-400">
                    {formatEur(p.frozenAmountCents)}
                  </span>
                  {isContestable && (
                    <Link
                      href={`/projects/${projectId}/penalties/${orgId}`}
                      className="shrink-0 rounded border border-orange-300 bg-orange-100 px-2.5 py-1 text-xs font-medium text-orange-700 hover:bg-orange-200 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300"
                    >
                      Contester
                    </Link>
                  )}
                  <Link
                    href={`/projects/${projectId}/penalties/${orgId}`}
                    className="shrink-0 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    title="Voir la pénalité"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}


      {/* Draft edit form */}
      {showDraftEdit && (
        <UpdateDraftForm
          projectId={projectId}
          situationId={situationId}
          orgId={orgId}
          currentPeriodLabel={situation.periodLabel}
          currentAmountHtCents={Number(situation.cumulativeAmountHtCents)}
          currentDocumentName={situation.documentName}
          status={situation.status}
          moeAdjustedAmountHtCents={
            situation.moeAdjustedAmountHtCents != null
              ? Number(situation.moeAdjustedAmountHtCents)
              : null
          }
          forecastEntries={forecastEntries}
          forecastWaived={forecastWaived}
          marcheTotalCents={effectiveMarcheCents}
          previousCumulativeCents={previousCumulativeCents}
          ftmBillings={ftmBillings.map((b) => ({
            id: b.id,
            ftmRecordId: b.ftmRecordId,
            ftmTitle: b.ftmRecord.title,
            ftmNumber: b.ftmRecord.number,
            percentage: b.percentage,
            billedAmountCents: Number(b.billedAmountCents),
            status: b.status,
            moeComment: b.moeComment,
            moaComment: b.moaComment,
          }))}
          acceptedFtms={acceptedFtms.map((f) => ({
            ftmId: f.ftmId,
            title: f.title,
            number: f.number,
            quoteAmountCents: Number(f.quoteAmountCents),
          }))}
          usedPeriods={usedPeriods}
        />
      )}

      {/* Summary card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Détail de la situation</h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-slate-500">Montant cumulé HT (déclaré)</dt>
            <dd className="font-medium text-slate-900 dark:text-slate-100">
              {formatEur(situation.cumulativeAmountHtCents + declaredFtmCents)}
            </dd>
            {declaredFtmCents > BigInt(0) && (
              <p className="text-xs text-slate-500 mt-0.5">
                dont travaux {formatEur(situation.cumulativeAmountHtCents)} + FTMs {formatEur(declaredFtmCents)}
              </p>
            )}
          </div>
          {situation.moeAdjustedAmountHtCents && (
            <div>
              <dt className="text-slate-500">Montant ajusté par le MOE</dt>
              <dd className="font-medium text-amber-700">{formatEur(situation.moeAdjustedAmountHtCents)}</dd>
            </div>
          )}
          {situation.documentName && (
            <div className="sm:col-span-2">
              <dt className="text-slate-500">Document joint</dt>
              <dd className="flex items-center gap-1.5 font-medium text-indigo-600">
                <FileText className="h-4 w-4 shrink-0" />
                {documentSignedUrl ? (
                  <a href={documentSignedUrl} target="_blank" rel="noopener noreferrer" className="underline truncate">
                    {situation.documentName}
                  </a>
                ) : (
                  <span className="truncate text-slate-700 dark:text-slate-300">{situation.documentName}</span>
                )}
              </dd>
            </div>
          )}
          {ftmBillings.length > 0 && (
            <div className="sm:col-span-2">
              <dt className="text-slate-500 mb-1">FTMs facturés</dt>
              <dd className="space-y-1">
                {ftmBillings.map((b) => {
                  const statusLabel =
                    b.status === "PENDING" ? "En attente MOE" :
                    b.status === "MOE_APPROVED" ? "Approuvé MOE" :
                    b.status === "MOE_REFUSED" ? "Refusé MOE" :
                    b.status === "MOE_CORRECTION_NEEDED" ? "Correction MOE demandée" :
                    b.status === "MOA_APPROVED" ? "Approuvé MOA" :
                    b.status === "MOA_REFUSED" ? "Refusé MOA" :
                    "Correction MOA demandée";
                  const isApproved = b.status === "MOA_APPROVED";
                  const isRefused = b.status === "MOE_REFUSED" || b.status === "MOA_REFUSED";
                  const isCorrection =
                    b.status === "MOE_CORRECTION_NEEDED" || b.status === "MOA_CORRECTION_NEEDED";
                  return (
                    <div key={b.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="text-slate-700 dark:text-slate-300">
                        FTM n°{b.ftmRecord.number} — {b.ftmRecord.title} ({b.percentage}%)
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`font-medium ${isApproved ? "text-green-700 dark:text-green-400" : isRefused ? "text-red-600 dark:text-red-400 line-through" : isCorrection ? "text-amber-700 dark:text-amber-400" : "text-slate-500"}`}>
                          {(Number(b.billedAmountCents) / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                        </span>
                        <span className={`text-[11px] px-1.5 py-0.5 rounded ${isApproved ? "bg-green-100 text-green-700" : isRefused ? "bg-red-100 text-red-700" : isCorrection ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                          {statusLabel}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </dd>
            </div>
          )}
          {situation.submittedBy && (
            <div>
              <dt className="text-slate-500">Soumis par</dt>
              <dd className="font-medium text-slate-900 dark:text-slate-100">
                {situation.submittedBy.user.name ?? situation.submittedBy.user.email}
                {situation.submittedAt && (
                  <span className="text-slate-400 font-normal"> · {new Date(situation.submittedAt).toLocaleDateString("fr-FR")}</span>
                )}
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/* MOE review result */}
      {situation.moeStatus && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-3 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">Décision MOE</h2>
          <div className="flex items-center gap-2">
            {situation.moeStatus === "APPROVED" && <CheckCircle className="h-5 w-5 text-teal-600" />}
            {situation.moeStatus === "CORRECTION_NEEDED" && <AlertCircle className="h-5 w-5 text-amber-600" />}
            {situation.moeStatus === "REFUSED" && <XCircle className="h-5 w-5 text-red-600" />}
            <span className="font-medium text-slate-900 dark:text-slate-100">
              {situation.moeStatus === "APPROVED" && "Approuvé"}
              {situation.moeStatus === "CORRECTION_NEEDED" && "Renvoyé en correction"}
              {situation.moeStatus === "REFUSED" && "Refusé"}
            </span>
            {situation.moeReviewedBy && (
              <span className="text-sm text-slate-500">
                par {situation.moeReviewedBy.user.name ?? situation.moeReviewedBy.user.email}
                {situation.moeReviewedAt && ` · ${new Date(situation.moeReviewedAt).toLocaleDateString("fr-FR")}`}
              </span>
            )}
          </div>
          {situation.moeComment && (
            <p className="text-sm text-slate-700 bg-slate-50 rounded-lg px-4 py-3 dark:bg-slate-800 dark:text-slate-300">
              {situation.moeComment}
            </p>
          )}
          {situation.penaltyAmountCents && situation.penaltyAmountCents > BigInt(0) && (
            <p className="text-sm text-red-700 dark:text-red-400">
              Pénalité appliquée :{" "}
              <strong>{formatEur(situation.penaltyAmountCents)}</strong>
              {situation.penaltyType === "DAILY_RATE" && situation.penaltyDelayDays && (
                <> ({situation.penaltyDelayDays} jours de retard)</>
              )}
            </p>
          )}
        </div>
      )}

      {/* Financial snapshot (MOA_APPROVED) */}
      {showFinancials && situation.status === SituationStatus.MOA_APPROVED && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-6 space-y-3 dark:border-green-900 dark:bg-green-950/30">
          <h2 className="font-semibold text-slate-900 dark:text-slate-100">Décompte financier validé</h2>
          <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-slate-500">Montant accepté cumulé</dt>
              <dd className="font-medium">{formatEur(situation.acceptedCumulativeHtCents)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Précédent cumulé approuvé</dt>
              <dd className="font-medium">{formatEur(situation.previousCumulativeHtCents)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Montant de la période brut</dt>
              <dd className="font-medium">{formatEur(situation.periodNetBeforeDeductionsHtCents)}</dd>
            </div>
            {situation.retenueGarantieAmountCents !== null && situation.retenueGarantieAmountCents > BigInt(0) && (
              <div>
                <dt className="text-slate-500">Retenue de garantie</dt>
                <dd className="font-medium text-amber-700">- {formatEur(situation.retenueGarantieAmountCents)}</dd>
              </div>
            )}
            {situation.avanceTravauxRemboursementCents !== null && situation.avanceTravauxRemboursementCents > BigInt(0) && (
              <div>
                <dt className="text-slate-500">Remboursement avance travaux</dt>
                <dd className="font-medium text-amber-700">- {formatEur(situation.avanceTravauxRemboursementCents)}</dd>
              </div>
            )}
            {situation.penaltyAmountCents !== null && situation.penaltyAmountCents > BigInt(0) && (
              <div>
                <dt className="text-slate-500">Pénalités</dt>
                <dd className="font-medium text-red-700">- {formatEur(situation.penaltyAmountCents)}</dd>
              </div>
            )}
            {situation.ftmBilledAmountCents != null && situation.ftmBilledAmountCents > BigInt(0) && (
              <div>
                <dt className="text-slate-500">FTMs approuvés</dt>
                <dd className="font-medium text-green-600 dark:text-green-400">+ {formatEur(situation.ftmBilledAmountCents)}</dd>
              </div>
            )}
            <div className="sm:col-span-2 border-t border-green-200 pt-2 mt-1">
              <dt className="text-slate-600 font-semibold">Net à payer HT</dt>
              <dd className="text-lg font-bold text-green-700">{formatEur(situation.netAmountHtCents)}</dd>
            </div>
          </dl>
          {situation.moaValidatedBy && (
            <p className="text-xs text-slate-500">
              Validé par {situation.moaValidatedBy.user.name ?? situation.moaValidatedBy.user.email}
              {situation.moaValidatedAt && ` · ${new Date(situation.moaValidatedAt).toLocaleDateString("fr-FR")}`}
            </p>
          )}
        </div>
      )}

      {/* MOA refusal result */}
      {situation.status === SituationStatus.MOA_REFUSED && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 space-y-3 dark:border-red-900 dark:bg-red-950/30">
          <h2 className="font-semibold text-red-800 dark:text-red-300">Refusé par le MOA</h2>
          {situation.moaComment && (
            <p className="text-sm text-red-700 dark:text-red-400">{situation.moaComment}</p>
          )}
        </div>
      )}

      {/* MOE review form */}
      {canMoeReview && situation.status === SituationStatus.SUBMITTED && (
        <MoeReviewForm
          projectId={projectId}
          situationId={situationId}
          orgId={orgId}
          penaltyType={contractSettings?.penaltyType ?? "NONE"}
          penaltyDailyRateCents={contractSettings?.penaltyDailyRateCents ? Number(contractSettings.penaltyDailyRateCents) : null}
          currentCumulativeHtCents={Number(situation.cumulativeAmountHtCents)}
          periodLabel={situation.periodLabel}
          forecastEntries={forecastEntries}
          forecastWaived={forecastWaived}
          marcheTotalCents={effectiveMarcheCents}
          previousCumulativeCents={previousCumulativeCents}
          ftmBillings={ftmBillings
            .filter((b) => b.status === "PENDING")
            .map((b) => ({
              id: b.id,
              ftmTitle: b.ftmRecord.title,
              ftmNumber: b.ftmRecord.number,
              percentage: b.percentage,
              billedAmountCents: Number(b.billedAmountCents),
              status: b.status,
            }))}
        />
      )}

      {/* MOA validate form */}
      {canMoaValidate && situation.status === SituationStatus.MOE_APPROVED && (
        <MoaValidateForm
          projectId={projectId}
          situationId={situationId}
          orgId={orgId}
          periodLabel={situation.periodLabel}
          submittedCumulativeCents={Number(situation.cumulativeAmountHtCents)}
          acceptedCumulativeCents={acceptedCumulativeCents}
          forecastEntries={forecastEntries}
          forecastWaived={forecastWaived}
          marcheTotalCents={effectiveMarcheCents}
          previousCumulativeCents={previousCumulativeCents}
          ftmBillings={ftmBillings
            .filter((b) => b.status === "MOE_APPROVED")
            .map((b) => ({
              id: b.id,
              ftmTitle: b.ftmRecord.title,
              ftmNumber: b.ftmRecord.number,
              percentage: b.percentage,
              billedAmountCents: Number(b.billedAmountCents),
              status: b.status,
            }))}
        />
      )}
    </div>
  );
}
