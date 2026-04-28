"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moeReviewSituationAction } from "@/server/situations/situation-actions";
import { Loader2 } from "lucide-react";
import {
  ForecastEntry,
  SituationProgressBar,
  SituationForecastPanel,
  ForecastComplianceBanner,
} from "../../_components/forecast-visuals";

type FtmBillingLine = {
  id: string;
  ftmTitle: string;
  ftmNumber: number;
  percentage: number;
  billedAmountCents: number;
  status: string;
};

type FtmDecision = "APPROVED" | "REFUSED" | "CORRECTION_NEEDED";

type Props = {
  projectId: string;
  situationId: string;
  currentCumulativeHtCents: number;
  currentRevisionCumulativeHtCents: number;
  revisionPrixActive: boolean;
  periodLabel: string;
  forecastEntries: ForecastEntry[];
  forecastWaived: boolean;
  marcheTotalCents: number;
  previousCumulativeCents: number;
  previousRevisionCumulativeCents: number;
  ftmBillings: FtmBillingLine[];
};

function formatEur(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export function MoeReviewForm({
  projectId,
  situationId,
  currentCumulativeHtCents,
  currentRevisionCumulativeHtCents,
  revisionPrixActive,
  periodLabel,
  forecastEntries,
  forecastWaived,
  marcheTotalCents,
  previousCumulativeCents,
  previousRevisionCumulativeCents,
  ftmBillings,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ftmDecisions, setFtmDecisions] = useState<Record<string, FtmDecision>>({});
  const [ftmComments, setFtmComments] = useState<Record<string, string>>({});
  const [decision, setDecision] = useState<"APPROVED" | "CORRECTION_NEEDED" | "REFUSED">("APPROVED");
  const [adjustAmount, setAdjustAmount] = useState(false);
  // Separate base/revision adjustment — base is (currentCumulative - currentRevisionCumulative)
  const currentBaseCumulativeCents = currentCumulativeHtCents - currentRevisionCumulativeHtCents;
  const [adjustedBaseStr, setAdjustedBaseStr] = useState((currentBaseCumulativeCents / 100).toFixed(2));
  const [adjustedRevisionStr, setAdjustedRevisionStr] = useState((currentRevisionCumulativeHtCents / 100).toFixed(2));

  const adjustedBase = adjustAmount ? Math.round(parseFloat(adjustedBaseStr.replace(",", ".") || "0") * 100) : currentBaseCumulativeCents;
  const adjustedRevision = adjustAmount && revisionPrixActive ? Math.round(parseFloat(adjustedRevisionStr.replace(",", ".") || "0") * 100) : currentRevisionCumulativeHtCents;
  const effectiveCents = adjustAmount ? adjustedBase + adjustedRevision : currentCumulativeHtCents;

  // Split totals so each consumer gets the right one.
  const prevBaseCumulativeCents = previousCumulativeCents - previousRevisionCumulativeCents;
  const ftmPeriodCents = ftmBillings
    .filter((b) => b.status !== "MOE_REFUSED" && b.status !== "MOA_REFUSED")
    .reduce((sum, b) => sum + b.billedAmountCents, 0);
  const periodBaseCents = Math.max(0, adjustedBase - prevBaseCumulativeCents);
  const periodRevisionCents = Math.max(0, adjustedRevision - previousRevisionCumulativeCents);
  const thisPeriodCents = periodBaseCents + periodRevisionCents + ftmPeriodCents;
  const hasForecast = forecastEntries.length > 0;
  const showPanel = hasForecast || forecastWaived;

  function handleFtmDecision(billingId: string, decision: FtmDecision) {
    setFtmDecisions((prev) => ({ ...prev, [billingId]: decision }));
  }

  const pendingFtmBillings = ftmBillings.filter((b) => b.status === "PENDING");
  const anyFtmCorrectionSelected = Object.values(ftmDecisions).some(
    (d) => d === "CORRECTION_NEEDED"
  );

  useEffect(() => {
    if (anyFtmCorrectionSelected && decision === "APPROVED") {
      setDecision("CORRECTION_NEEDED");
    }
  }, [anyFtmCorrectionSelected, decision]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    const moeAdjustedBaseAmountHtCents = adjustAmount ? adjustedBase : null;
    const moeAdjustedRevisionAmountHtCents = adjustAmount && revisionPrixActive ? adjustedRevision : null;

    // Validate FTM lines: every pending line must have a decision; correction requires comment
    const missing = pendingFtmBillings.find((b) => !ftmDecisions[b.id]);
    if (missing) {
      setError(`Veuillez décider pour tous les FTMs (FTM n°${missing.ftmNumber}).`);
      return;
    }
    for (const b of pendingFtmBillings) {
      const d = ftmDecisions[b.id];
      if (d === "CORRECTION_NEEDED" && !ftmComments[b.id]?.trim()) {
        setError(`Indiquez la correction à apporter au FTM n°${b.ftmNumber}.`);
        return;
      }
    }

    const ftmReviews = pendingFtmBillings.map((b) => ({
      billingId: b.id,
      decision: ftmDecisions[b.id],
      comment: ftmComments[b.id]?.trim() || null,
    }));

    startTransition(async () => {
      try {
        await moeReviewSituationAction({
          situationId,
          projectId,
          decision,
          comment: fd.get("comment") as string,
          moeAdjustedBaseAmountHtCents,
          moeAdjustedRevisionAmountHtCents,
          ftmReviews,
        });
        router.refresh();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erreur inconnue.");
      }
    });
  }

  return (
    <div className="rounded border border-slate-200 bg-white p-4 space-y-4 dark:border-slate-700 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Révision MOE</h2>

      <SituationProgressBar
        previousCents={previousCumulativeCents}
        thisPeriodCents={thisPeriodCents}
        marcheTotalCents={marcheTotalCents}
      />

      <div className={`grid grid-cols-1 gap-4 ${showPanel ? "lg:grid-cols-[1fr_260px]" : ""}`}>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </p>
          )}

          {/* Decision */}
          <fieldset>
            <legend className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Décision
            </legend>
            <div className="flex flex-wrap gap-2">
              {(["APPROVED", "CORRECTION_NEEDED", "REFUSED"] as const).map((d) => {
                const blocked = anyFtmCorrectionSelected && d === "APPROVED";
                return (
                  <label
                    key={d}
                    title={blocked ? "Des FTMs sont en attente de correction" : undefined}
                    className={`flex cursor-pointer items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
                      blocked ? "opacity-40 cursor-not-allowed" : ""
                    } ${
                      decision === d
                        ? d === "APPROVED"
                          ? "border-teal-500 bg-teal-50 text-teal-800 dark:bg-teal-950/30 dark:text-teal-300"
                          : d === "REFUSED"
                          ? "border-red-400 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300"
                          : "border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                    }`}
                  >
                    <input
                      type="radio"
                      name="decision"
                      value={d}
                      checked={decision === d}
                      disabled={blocked}
                      onChange={() => setDecision(d)}
                      className="sr-only"
                    />
                    {d === "APPROVED" && "Approuver"}
                    {d === "CORRECTION_NEEDED" && "Renvoyer en correction"}
                    {d === "REFUSED" && "Refuser"}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* Adjust amount */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={adjustAmount}
                onChange={(e) => setAdjustAmount(e.target.checked)}
                className="rounded border-slate-300"
              />
              Ajuster les montants acceptés
            </label>
            {adjustAmount && (
              <div className="space-y-2 pl-1">
                <div>
                  <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    Montant Base cumulé accepté (€)
                  </label>
                  <div className="relative w-48">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={adjustedBaseStr}
                      onChange={(e) => setAdjustedBaseStr(e.target.value)}
                      className="w-full rounded border border-slate-200 bg-white px-3 py-1.5 pr-8 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">€</span>
                  </div>
                </div>
                {revisionPrixActive && (
                  <div>
                    <label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                      Révision de Prix cumulée acceptée (€)
                    </label>
                    <div className="relative w-48">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={adjustedRevisionStr}
                        onChange={(e) => setAdjustedRevisionStr(e.target.value)}
                        className="w-full rounded border border-slate-200 bg-white px-3 py-1.5 pr-8 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">€</span>
                    </div>
                  </div>
                )}
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Total ajusté : <strong className="text-slate-700 dark:text-slate-300">{formatEur(effectiveCents)}</strong>
                </p>
                {hasForecast && (
                  <ForecastComplianceBanner
                    entries={forecastEntries}
                    periodLabel={periodLabel}
                    thisPeriodCents={periodBaseCents}
                  />
                )}
              </div>
            )}
          </div>

          {/* FTM billing review */}
          {pendingFtmBillings.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">FTMs à réviser</p>
              <div className="divide-y divide-slate-100 rounded border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                {pendingFtmBillings.map((b) => {
                  const dec = ftmDecisions[b.id];
                  return (
                    <div key={b.id} className="px-3 py-2 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs">
                          <span className="font-medium text-slate-800 dark:text-slate-200">
                            FTM n°{b.ftmNumber} — {b.ftmTitle}
                          </span>
                          <span className="ml-2 text-slate-500">
                            {b.percentage}% · {(b.billedAmountCents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                          </span>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleFtmDecision(b.id, "APPROVED")}
                            className={`rounded border px-2 py-1 text-[11px] font-medium transition-colors ${
                              dec === "APPROVED"
                                ? "border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-300"
                                : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
                            }`}
                          >
                            ✓ Approuver
                          </button>
                          <button
                            type="button"
                            onClick={() => handleFtmDecision(b.id, "CORRECTION_NEEDED")}
                            className={`rounded border px-2 py-1 text-[11px] font-medium transition-colors ${
                              dec === "CORRECTION_NEEDED"
                                ? "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                                : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
                            }`}
                          >
                            ✎ Corriger
                          </button>
                          <button
                            type="button"
                            onClick={() => handleFtmDecision(b.id, "REFUSED")}
                            className={`rounded border px-2 py-1 text-[11px] font-medium transition-colors ${
                              dec === "REFUSED"
                                ? "border-red-400 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
                                : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-800"
                            }`}
                          >
                            ✗ Refuser
                          </button>
                        </div>
                      </div>
                      {(dec === "REFUSED" || dec === "CORRECTION_NEEDED") && (
                        <input
                          type="text"
                          placeholder={
                            dec === "CORRECTION_NEEDED"
                              ? "Indiquez ce qui doit être corrigé (ex. pourcentage) — obligatoire"
                              : "Motif du refus (optionnel)"
                          }
                          value={ftmComments[b.id] ?? ""}
                          onChange={(e) =>
                            setFtmComments((prev) => ({ ...prev, [b.id]: e.target.value }))
                          }
                          className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Comment */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Commentaire{decision !== "APPROVED" && <span className="text-red-500"> *</span>}
            </label>
            <textarea
              name="comment"
              required={decision !== "APPROVED"}
              rows={3}
              placeholder="Observations, motif de correction ou de refus…"
              className="w-full rounded border border-slate-200 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isPending ? "Enregistrement…" : "Valider la décision MOE"}
          </button>
        </form>

        {showPanel && (
          <SituationForecastPanel
            entries={forecastEntries}
            forecastWaived={forecastWaived}
            periodLabel={periodLabel}
            thisPeriodCents={periodBaseCents}
          />
        )}
      </div>
    </div>
  );
}
