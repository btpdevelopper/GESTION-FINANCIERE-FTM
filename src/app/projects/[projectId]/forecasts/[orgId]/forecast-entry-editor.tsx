"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveForecastEntriesAction, submitForecastAction } from "@/server/forecast/forecast-actions";
import { Plus, Trash2, Loader2, AlertTriangle } from "lucide-react";

type Entry = { periodLabel: string; plannedAmountHtCents: number };

type Props = {
  projectId: string;
  forecastId: string | null;
  status: string | null;
  initialEntries: Entry[];
  marcheTotalCents: number;
  isCorrection: boolean;
};

function formatEur(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function formatPeriod(p: string): string {
  if (/^\d{4}-\d{2}$/.test(p)) {
    const [y, m] = p.split("-");
    const label = new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("fr-FR", {
      month: "long", year: "numeric",
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }
  return p;
}

export function ForecastEntryEditor({
  projectId,
  forecastId,
  status,
  initialEntries,
  marcheTotalCents,
  isCorrection,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<"save" | "submit" | null>(null);
  const [entries, setEntries] = useState<Entry[]>(initialEntries);
  const [correctionComment, setCorrectionComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const totalCents = entries.reduce((s, e) => s + e.plannedAmountHtCents, 0);
  const totalDiff = Math.abs(totalCents - marcheTotalCents);
  const showWarning = marcheTotalCents > 0 && totalDiff > 0;

  function addRow() {
    setEntries((prev) => [...prev, { periodLabel: "", plannedAmountHtCents: 0 }]);
  }

  function removeRow(i: number) {
    setEntries((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updatePeriod(i: number, val: string) {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, periodLabel: val } : e)));
  }

  function updateAmount(i: number, val: string) {
    const cents = Math.round(parseFloat(val.replace(",", ".") || "0") * 100);
    setEntries((prev) =>
      prev.map((e, idx) => (idx === i ? { ...e, plannedAmountHtCents: isNaN(cents) ? 0 : cents } : e))
    );
  }

  // Per-row duplicate detection
  const periodCounts = entries.reduce((acc, e) => {
    if (e.periodLabel) acc.set(e.periodLabel, (acc.get(e.periodLabel) ?? 0) + 1);
    return acc;
  }, new Map<string, number>());
  const duplicatedPeriods = new Set(
    [...periodCounts.entries()].filter(([, n]) => n > 1).map(([p]) => p)
  );
  const hasDuplicates = duplicatedPeriods.size > 0;

  async function handleSave() {
    setError(null);
    setSuccess(null);
    if (hasDuplicates) { setError("Des périodes en double sont présentes."); return; }
    setPendingAction("save");
    startTransition(async () => {
      try {
        await saveForecastEntriesAction({ projectId, entries });
        setSuccess("Enregistré.");
        router.refresh();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erreur inconnue.");
      } finally {
        setPendingAction(null);
      }
    });
  }

  async function handleSubmit() {
    setError(null);
    setSuccess(null);
    if (!forecastId) { setError("Enregistrez d'abord les entrées."); return; }
    if (isCorrection && !correctionComment.trim()) {
      setError("Un commentaire est obligatoire lors d'une resoumission après correction.");
      return;
    }
    setPendingAction("submit");
    startTransition(async () => {
      try {
        await submitForecastAction({
          forecastId,
          projectId,
          correctionComment: correctionComment || null,
        });
        router.refresh();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erreur inconnue.");
      } finally {
        setPendingAction(null);
      }
    });
  }

  return (
    <div className="space-y-4 rounded border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {isCorrection ? "Corriger le prévisionnel" : "Saisir le prévisionnel"}
      </h2>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </p>
      )}
      {success && (
        <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400">
          {success}
        </p>
      )}

      {/* Entries table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="pb-1.5 text-left font-medium text-slate-500">Période</th>
              <th className="pb-1.5 text-right font-medium text-slate-500">Montant HT prévu (€)</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                <td className="py-1.5 pr-3">
                  {isCorrection ? (
                    <span className="text-slate-700 dark:text-slate-300">
                      {formatPeriod(entry.periodLabel)}
                    </span>
                  ) : (
                    <div>
                      <input
                        type="month"
                        value={entry.periodLabel}
                        onChange={(e) => updatePeriod(i, e.target.value)}
                        className={`rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 dark:bg-slate-800 dark:text-slate-100 ${
                          entry.periodLabel && duplicatedPeriods.has(entry.periodLabel)
                            ? "border-red-300 bg-red-50 focus:ring-red-300 dark:border-red-700 dark:bg-red-950/20"
                            : "border-slate-200 bg-white focus:ring-slate-400 dark:border-slate-700"
                        }`}
                      />
                      {entry.periodLabel && duplicatedPeriods.has(entry.periodLabel) && (
                        <p className="mt-0.5 text-[11px] text-red-600 dark:text-red-400">
                          Période en double
                        </p>
                      )}
                    </div>
                  )}
                </td>
                <td className="py-1.5 pr-3">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={(entry.plannedAmountHtCents / 100).toFixed(2)}
                    onChange={(e) => updateAmount(i, e.target.value)}
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-right text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </td>
                <td className="py-1.5">
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="rounded p-0.5 text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 dark:border-slate-700">
              <td className="pt-2 font-semibold text-slate-700 dark:text-slate-300">Total prévu</td>
              <td className={`pt-2 text-right font-semibold ${showWarning ? "text-amber-600" : "text-slate-800 dark:text-slate-200"}`}>
                {formatEur(totalCents)}
                {marcheTotalCents > 0 && (
                  <span className="ml-1 font-normal text-slate-400">/ {formatEur(marcheTotalCents)}</span>
                )}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {showWarning && (
        <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Le total prévu ne correspond pas au montant du marché ({formatEur(marcheTotalCents)}).
        </p>
      )}

      {!isCorrection && (
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        >
          <Plus className="h-3.5 w-3.5" />
          Ajouter un mois
        </button>
      )}

      {/* Correction comment */}
      {isCorrection && (
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            Commentaire de resoumission <span className="text-red-500">*</span>
          </label>
          <textarea
            rows={3}
            value={correctionComment}
            onChange={(e) => setCorrectionComment(e.target.value)}
            placeholder="Expliquez les modifications apportées…"
            className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isPending || hasDuplicates}
          onClick={handleSave}
          className="inline-flex items-center gap-1.5 rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {pendingAction === "save" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {pendingAction === "save" ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={handleSubmit}
          className="inline-flex items-center gap-1.5 rounded bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600 disabled:opacity-50 transition-colors"
        >
          {pendingAction === "submit" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {pendingAction === "submit" ? "Envoi…" : "Soumettre au MOE"}
        </button>
      </div>
    </div>
  );
}
