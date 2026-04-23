"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moaValidateSituationAction } from "@/server/situations/situation-actions";
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
  orgId: string;
  periodLabel: string;
  submittedCumulativeCents: number;
  acceptedCumulativeCents: number;
  forecastEntries: ForecastEntry[];
  forecastWaived: boolean;
  marcheTotalCents: number;
  previousCumulativeCents: number;
  ftmBillings: FtmBillingLine[];
};

function formatEur(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)} %`;
}

export function MoaValidateForm({
  projectId,
  situationId,
  orgId,
  periodLabel,
  submittedCumulativeCents,
  acceptedCumulativeCents,
  forecastEntries,
  forecastWaived,
  marcheTotalCents,
  previousCumulativeCents,
  ftmBillings,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<"APPROVED" | "REFUSED" | "CORRECTION_NEEDED">("APPROVED");
  const [ftmDecisions, setFtmDecisions] = useState<Record<string, FtmDecision>>({});
  const [ftmComments, setFtmComments] = useState<Record<string, string>>({});

  const reviewableFtmBillings = ftmBillings.filter((b) => b.status === "MOE_APPROVED");
  const anyFtmCorrectionSelected = Object.values(ftmDecisions).some(
    (d) => d === "CORRECTION_NEEDED"
  );

  useEffect(() => {
    if (anyFtmCorrectionSelected && decision === "APPROVED") {
      setDecision("CORRECTION_NEEDED");
    }
  }, [anyFtmCorrectionSelected, decision]);

  const ftmPeriodCents = ftmBillings.reduce((sum, b) => sum + b.billedAmountCents, 0);
  const thisPeriodCents = Math.max(0, acceptedCumulativeCents - previousCumulativeCents) + ftmPeriodCents;
  const hasForecast = forecastEntries.length > 0;
  const showPanel = hasForecast || forecastWaived;

  const submittedPeriodCents = Math.max(0, submittedCumulativeCents - previousCumulativeCents);
  const moePeriodCents = Math.max(0, acceptedCumulativeCents - previousCumulativeCents);
  const forecastEntry = forecastEntries.find((e) => e.periodLabel === periodLabel);
  const forecastCents = forecastEntry?.plannedAmountHtCents ?? null;

  function handleFtmDecision(billingId: string, dec: FtmDecision) {
    setFtmDecisions((prev) => ({ ...prev, [billingId]: dec }));
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    const missing = reviewableFtmBillings.find((b) => !ftmDecisions[b.id]);
    if (missing) {
      setError(`Veuillez décider pour tous les FTMs (FTM n°${missing.ftmNumber}).`);
      return;
    }
    for (const b of reviewableFtmBillings) {
      const d = ftmDecisions[b.id];
      if (d === "CORRECTION_NEEDED" && !ftmComments[b.id]?.trim()) {
        setError(`Indiquez la correction à apporter au FTM n°${b.ftmNumber}.`);
        return;
      }
    }

    const ftmReviews = reviewableFtmBillings.map((b) => ({
      billingId: b.id,
      decision: ftmDecisions[b.id],
      comment: ftmComments[b.id]?.trim() || null,
    }));

    startTransition(async () => {
      try {
        await moaValidateSituationAction({
          situationId,
          projectId,
          decision,
          comment: (fd.get("comment") as string) || null,
          ftmReviews,
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

      {/* Amount summary table */}
      <div className="rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
              <th className="px-3 py-2 text-left font-medium text-slate-500 dark:text-slate-400">Indicateur</th>
              <th className="px-3 py-2 text-right font-medium text-slate-500 dark:text-slate-400">Montant HT</th>
              <th className="px-3 py-2 text-right font-medium text-slate-500 dark:text-slate-400">Écart vs prévi.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            <tr>
              <td className="px-3 py-2 text-slate-600 dark:text-slate-400">Prévisionnel</td>
              <td className="px-3 py-2 text-right font-medium text-slate-700 dark:text-slate-300">
                {forecastCents !== null ? formatEur(forecastCents) : <span className="text-slate-400 italic">—</span>}
              </td>
              <td className="px-3 py-2 text-right text-slate-400">—</td>
            </tr>
            <tr>
              <td className="px-3 py-2 text-slate-600 dark:text-slate-400">Soumis (entreprise)</td>
              <td className="px-3 py-2 text-right font-medium text-slate-700 dark:text-slate-300">
                {formatEur(submittedPeriodCents)}
              </td>
              <td className="px-3 py-2 text-right">
                {forecastCents !== null && forecastCents > 0 ? (
                  <span className={
                    submittedPeriodCents > forecastCents ? "text-amber-600 dark:text-amber-400" :
                    submittedPeriodCents < forecastCents ? "text-blue-600 dark:text-blue-400" :
                    "text-green-600 dark:text-green-400"
                  }>
                    {formatPct(((submittedPeriodCents - forecastCents) / forecastCents) * 100)}
                  </span>
                ) : <span className="text-slate-400">—</span>}
              </td>
            </tr>
            <tr className="bg-slate-50 dark:bg-slate-800/50">
              <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-200">Validé MOE</td>
              <td className="px-3 py-2 text-right font-semibold text-slate-900 dark:text-slate-100">
                {formatEur(moePeriodCents)}
                {ftmPeriodCents > 0 && (
                  <span className="ml-1 font-normal text-slate-400 text-[11px]">
                    + {formatEur(ftmPeriodCents)} FTM
                  </span>
                )}
              </td>
              <td className="px-3 py-2 text-right font-semibold">
                {forecastCents !== null && forecastCents > 0 ? (
                  <span className={
                    moePeriodCents > forecastCents ? "text-amber-600 dark:text-amber-400" :
                    moePeriodCents < forecastCents ? "text-blue-600 dark:text-blue-400" :
                    "text-green-600 dark:text-green-400"
                  }>
                    {formatPct(((moePeriodCents - forecastCents) / forecastCents) * 100)}
                  </span>
                ) : <span className="text-slate-400">—</span>}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

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
                          ? "border-green-500 bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300"
                          : d === "CORRECTION_NEEDED"
                          ? "border-amber-400 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
                          : "border-red-400 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300"
                        : "border-slate-200 text-slate-600 hover:bg-white dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
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
                    {d === "APPROVED"
                      ? "Valider et approuver le paiement"
                      : d === "CORRECTION_NEEDED"
                      ? "Renvoyer en correction"
                      : "Refuser"}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {/* FTM billing review */}
          {reviewableFtmBillings.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">FTMs approuvés MOE — validation finale</p>
              <div className="divide-y divide-slate-100 rounded border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                {reviewableFtmBillings.map((b) => {
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
                                ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300"
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

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Commentaire{decision !== "APPROVED" && <span className="text-red-500"> *</span>}
            </label>
            <textarea
              name="comment"
              required={decision !== "APPROVED"}
              rows={3}
              placeholder={
                decision === "REFUSED"
                  ? "Motif du refus (obligatoire)…"
                  : decision === "CORRECTION_NEEDED"
                  ? "Expliquez ce qui doit être corrigé (obligatoire)…"
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
                : decision === "CORRECTION_NEEDED"
                ? "bg-amber-600 hover:bg-amber-500"
                : "bg-red-600 hover:bg-red-500"
            }`}
          >
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isPending
              ? "Enregistrement…"
              : decision === "APPROVED"
              ? "Confirmer la validation"
              : decision === "CORRECTION_NEEDED"
              ? "Renvoyer en correction"
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
