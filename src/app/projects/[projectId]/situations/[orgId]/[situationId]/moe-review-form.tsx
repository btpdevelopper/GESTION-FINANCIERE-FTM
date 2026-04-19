"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moeReviewSituationAction } from "@/server/situations/situation-actions";
import { Loader2 } from "lucide-react";

type Props = {
  projectId: string;
  situationId: string;
  orgId: string;
  penaltyType: string;
  penaltyDailyRateCents: number | null;
  currentCumulativeHtCents: number;
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
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<"APPROVED" | "CORRECTION_NEEDED" | "REFUSED">("APPROVED");
  const [adjustAmount, setAdjustAmount] = useState(false);
  const [adjustedAmountStr, setAdjustedAmountStr] = useState((currentCumulativeHtCents / 100).toFixed(2));
  const [delayDays, setDelayDays] = useState("");
  const [freeAmount, setFreeAmount] = useState("");

  const computedPenaltyCents =
    penaltyType === "DAILY_RATE" && penaltyDailyRateCents && delayDays
      ? penaltyDailyRateCents * parseInt(delayDays, 10)
      : null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);

    const moeAdjustedAmountHtCents =
      adjustAmount
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
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 bg-white p-6 space-y-5 dark:border-slate-800 dark:bg-slate-900"
    >
      <h2 className="font-semibold text-slate-900 dark:text-slate-100">Révision MOE</h2>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">{error}</p>
      )}

      {/* Decision */}
      <fieldset>
        <legend className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Décision</legend>
        <div className="flex flex-wrap gap-3">
          {(["APPROVED", "CORRECTION_NEEDED", "REFUSED"] as const).map((d) => (
            <label
              key={d}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                decision === d
                  ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                  : "border-slate-300 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
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
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
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
            <input
              type="number"
              min="0"
              step="0.01"
              value={adjustedAmountStr}
              onChange={(e) => setAdjustedAmountStr(e.target.value)}
              className="w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <span className="ml-2 text-sm text-slate-500">€ HT cumulé</span>
          </div>
        )}
      </div>

      {/* Penalty */}
      {penaltyType !== "NONE" && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Pénalités</p>
          {penaltyType === "DAILY_RATE" && (
            <div className="flex items-center gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Jours de retard</label>
                <input
                  type="number"
                  min="0"
                  value={delayDays}
                  onChange={(e) => setDelayDays(e.target.value)}
                  className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              {computedPenaltyCents !== null && (
                <p className="mt-4 text-sm text-red-700 font-medium">
                  = {formatEur(computedPenaltyCents)}
                </p>
              )}
            </div>
          )}
          {penaltyType === "FREE_AMOUNT" && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">Montant pénalité (€)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={freeAmount}
                onChange={(e) => setFreeAmount(e.target.value)}
                className="w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          )}
        </div>
      )}

      {/* Comment */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Commentaire{decision !== "APPROVED" && <span className="text-red-500"> *</span>}
        </label>
        <textarea
          name="comment"
          required={decision !== "APPROVED"}
          rows={3}
          placeholder="Observations, motif de correction ou de refus…"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
      >
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {isPending ? "Enregistrement…" : "Valider la décision MOE"}
      </button>
    </form>
  );
}
