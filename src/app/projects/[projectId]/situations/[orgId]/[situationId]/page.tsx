import Link from "next/link";
import { notFound } from "next/navigation";
import { getAuthUser } from "@/lib/auth/user";
import { requireProjectMember } from "@/server/membership";
import { getSituation, getCompanyContractSettings } from "@/server/situations/situation-queries";
import { getFtmDocumentUrl } from "@/lib/storage";
import { Capability, ProjectRole, SituationStatus } from "@prisma/client";
import { can } from "@/lib/permissions/resolve";
import { MoeReviewForm } from "./moe-review-form";
import { MoaValidateForm } from "./moa-validate-form";
import { UpdateDraftForm } from "./update-draft-form";
import { SituationTimeline } from "./situation-timeline";
import { CheckCircle, XCircle, AlertCircle, Clock, FileText } from "lucide-react";

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

  const [situation, contractSettings, canMoeReview, canMoaValidate, canSubmit] = await Promise.all([
    getSituation(projectId, situationId),
    getCompanyContractSettings(projectId, orgId),
    can(pm.id, Capability.REVIEW_SITUATION_MOE),
    can(pm.id, Capability.VALIDATE_SITUATION_MOA),
    can(pm.id, Capability.SUBMIT_SITUATION),
  ]);

  if (!situation || situation.organizationId !== orgId) notFound();

  // Resolve signed URL for the attached document (1-hour expiry)
  let documentSignedUrl: string | null = null;
  if (situation.documentUrl) {
    try {
      documentSignedUrl = await getFtmDocumentUrl(situation.documentUrl);
    } catch {
      // non-blocking — URL display degrades gracefully
    }
  }

  const cfg = STATUS_CONFIG[situation.status];
  const isImmutable =
    situation.status === SituationStatus.MOA_APPROVED ||
    situation.status === SituationStatus.MOE_REFUSED ||
    situation.status === SituationStatus.MOA_REFUSED;
  const isEntreprise = pm.role === ProjectRole.ENTREPRISE;
  const showFinancials =
    !isEntreprise ||
    situation.status === SituationStatus.MOA_APPROVED;
  const showDraftEdit =
    canSubmit &&
    isEntreprise &&
    (situation.status === SituationStatus.DRAFT || situation.status === SituationStatus.MOE_CORRECTION);

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
      </div>

      {/* Timeline */}
      <SituationTimeline situation={situation} />

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
        />
      )}

      {/* Summary card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="font-semibold text-slate-900 dark:text-slate-100">Détail de la situation</h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-slate-500">Montant cumulé HT (déclaré)</dt>
            <dd className="font-medium text-slate-900 dark:text-slate-100">{formatEur(situation.cumulativeAmountHtCents)}</dd>
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

      {/* Financial snapshot (MOA_APPROVED or MOE/MOA during review) */}
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
        />
      )}

      {/* MOA validate form */}
      {canMoaValidate && situation.status === SituationStatus.MOE_APPROVED && (
        <MoaValidateForm
          projectId={projectId}
          situationId={situationId}
          orgId={orgId}
        />
      )}
    </div>
  );
}
