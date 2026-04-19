"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moaValidateSituationAction } from "@/server/situations/situation-actions";
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
  periodLabel: string;
  acceptedCumulativeCents: number;
  forecastEntries: ForecastEntry[];
  forecastWaived: boolean;
  marcheTotalCents: number;
  previousCumulativeCents: number;
};

export function MoaValidateForm({
  projectId,
  situationId,
  orgId,
  periodLabel,
  acceptedCumulativeCents,
  forecastEntries,
  forecastWaived,
  marcheTotalCents,
  previousCumulativeCents,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<"APPROVED" | "REFUSED">("APPROVED");

  const thisPeriodCents = Math.max(0, acceptedCumulativeCents - previousCumulativeCents);
  const hasForecast = forecastEntries.length > 0;
  const showPanel = hasForecast || forecastWaived;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    startTransition(async () => {
      try {
        await moaValidateSituationAction({
          situationId,
          projectId,
          decision,
          comment: (fd.get("comment") as string) || null,
        });
        router.refresh();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erreur inconnue.");
      }
    });
  }

  return (
    <div className="rounded border border-green-200 bg-green-50 p-4 space-y-4 dark:border-green-900/50 dark:bg-green-950/20">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Validation MOA</h2>

      <SituationProgressBar
        previousCents={previousCumulativeCents}
        thisPeriodCents={thisPeriodCents}
        marcheTotalCents={marcheTotalCents}
      />

      {hasForecast && thisPeriodCents > 0 && (
        <ForecastComplianceBanner
          entries={forecastEntries}
          periodLabel={periodLabel}
          thisPeriodCents={thisPeriodCents}
        />
      )}

      <div className={`grid grid-cols-1 gap-4 ${showPanel ? "lg:grid-cols-[1fr_260px]" : ""}`}>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </p>
          )}

          <fieldset>
            <legend className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Décision finale
            </legend>
            <div className="flex flex-wrap gap-2">
              {(["APPROVED", "REFUSED"] as const).map((d) => (
                <label
                  key={d}
                  className={`flex cursor-pointer items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
                    decision === d
                      ? d === "APPROVED"
                        ? "border-green-500 bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300"
                        : "border-red-400 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300"
                      : "border-slate-200 text-slate-600 hover:bg-white dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
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
                  {d === "APPROVED" ? "Valider et approuver le paiement" : "Refuser"}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Commentaire{decision === "REFUSED" && <span className="text-red-500"> *</span>}
            </label>
            <textarea
              name="comment"
              required={decision === "REFUSED"}
              rows={3}
              placeholder={
                decision === "REFUSED"
                  ? "Motif du refus (obligatoire)…"
                  : "Observations (optionnel)…"
              }
              className="w-full rounded border border-slate-200 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>

          <button
            type="submit"
            disabled={isPending}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50 ${
              decision === "APPROVED"
                ? "bg-green-700 hover:bg-green-600"
                : "bg-red-600 hover:bg-red-500"
            }`}
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isPending
              ? "Enregistrement…"
              : decision === "APPROVED"
              ? "Confirmer la validation"
              : "Confirmer le refus"}
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
