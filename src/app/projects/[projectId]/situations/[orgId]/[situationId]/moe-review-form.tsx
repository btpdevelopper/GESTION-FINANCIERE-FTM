"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moeReviewSituationAction } from "@/server/situations/situation-actions";
import { Loader2 } from "lucide-react";
import {
  ForecastEntry,
  SituationProgressBar,
  SituationForecastPanel,
  ForecastComplianceBanner,
} from "../../_components/forecast-visuals";

type Props = {
  projectId: string;
  situationId: string;
  orgId: string;
  penaltyType: string;
  penaltyDailyRateCents: number | null;
  currentCumulativeHtCents: number;
  periodLabel: string;
  forecastEntries: ForecastEntry[];
  forecastWaived: boolean;
  marcheTotalCents: number;
  previousCumulativeCents: number;
};

function formatEur(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export function MoeReviewForm({
  projectId,
  situationId,
  orgId,
  penaltyType,
  penaltyDailyRateCents,
  currentCumulativeHtCents,
  periodLabel,
  forecastEntries,
  forecastWaived,
  marcheTotalCents,
  previousCumulativeCents,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<"APPROVED" | "CORRECTION_NEEDED" | "REFUSED">("APPROVED");
  const [adjustAmount, setAdjustAmount] = useState(false);
  const [adjustedAmountStr, setAdjustedAmountStr] = useState((currentCumulativeHtCents / 100).toFixed(2));
  const [delayDays, setDelayDays] = useState("");
  const [freeAmount, setFreeAmount] = useState("");

  const effectiveCents = adjustAmount
    ? Math.round(parseFloat(adjustedAmountStr.replace(",", ".") || "0") * 100)
    : currentCumulativeHtCents;
  const thisPeriodCents = Math.max(0, effectiveCents - previousCumulativeCents);
  const hasForecast = forecastEntries.length > 0;
  const showPanel = hasForecast || forecastWaived;

  const computedPenaltyCents =
    penaltyType === "DAILY_RATE" && penaltyDailyRateCents && delayDays
      ? penaltyDailyRateCents * parseInt(delayDays, 10)
      : null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    const moeAdjustedAmountHtCents = adjustAmount
      ? Math.round(parseFloat(adjustedAmountStr.replace(",", ".")) * 100)
      : null;

    const penaltyAmountCents =
      penaltyType === "DAILY_RATE" && computedPenaltyCents
        ? computedPenaltyCents
        : penaltyType === "FREE_AMOUNT" && freeAmount
        ? Math.round(parseFloat(freeAmount.replace(",", ".")) * 100)
        : null;

    startTransition(async () => {
      try {
        await moeReviewSituationAction({
          situationId,
          projectId,
          decision,
          comment: fd.get("comment") as string,
          moeAdjustedAmountHtCents,
          penaltyType: penaltyType || "NONE",
          penaltyDelayDays: delayDays ? parseInt(delayDays, 10) : null,
          penaltyAmountCents,
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
              {(["APPROVED", "CORRECTION_NEEDED", "REFUSED"] as const).map((d) => (
                <label
                  key={d}
                  className={`flex cursor-pointer items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
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
                    onChange={() => setDecision(d)}
                    className="sr-only"
                  />
                  {d === "APPROVED" && "Approuver"}
                  {d === "CORRECTION_NEEDED" && "Renvoyer en correction"}
                  {d === "REFUSED" && "Refuser"}
                </label>
              ))}
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
              Ajuster le montant cumulé accepté
            </label>
            {adjustAmount && (
              <div>
                <div className="relative w-48">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={adjustedAmountStr}
                    onChange={(e) => setAdjustedAmountStr(e.target.value)}
                    className="w-full rounded border border-slate-200 bg-white px-3 py-1.5 pr-8 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">€</span>
                </div>
                {hasForecast && (
                  <div className="mt-2">
                    <ForecastComplianceBanner
                      entries={forecastEntries}
                      periodLabel={periodLabel}
                      thisPeriodCents={thisPeriodCents}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Penalty */}
          {penaltyType !== "NONE" && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">Pénalités</p>
              {penaltyType === "DAILY_RATE" && (
                <div className="flex items-center gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Jours de retard</label>
                    <input
                      type="number"
                      min="0"
                      value={delayDays}
                      onChange={(e) => setDelayDays(e.target.value)}
                      className="w-24 rounded border border-slate-200 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                  {computedPenaltyCents !== null && (
                    <p className="mt-4 text-xs font-medium text-red-700 dark:text-red-400">
                      = {formatEur(computedPenaltyCents)}
                    </p>
                  )}
                </div>
              )}
              {penaltyType === "FREE_AMOUNT" && (
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Montant pénalité</label>
                  <div className="relative w-48">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={freeAmount}
                      onChange={(e) => setFreeAmount(e.target.value)}
                      className="w-full rounded border border-slate-200 bg-white px-3 py-1.5 pr-8 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">€</span>
                  </div>
                </div>
              )}
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
            thisPeriodCents={thisPeriodCents}
          />
        )}
      </div>
    </div>
  );
}
