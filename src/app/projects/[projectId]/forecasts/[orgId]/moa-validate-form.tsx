"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moaValidateForecastAction } from "@/server/forecast/forecast-actions";
import { Loader2 } from "lucide-react";

type Decision = "APPROVED" | "CORRECTION_NEEDED" | "REFUSED";

export function MoaValidateForm({
  projectId,
  forecastId,
}: {
  projectId: string;
  forecastId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [decision, setDecision] = useState<Decision>("APPROVED");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const commentRequired = decision === "REFUSED" || decision === "CORRECTION_NEEDED";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await moaValidateForecastAction({ forecastId, projectId, decision, comment });
        router.refresh();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erreur inconnue.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Validation MOA</h2>

      {error && (
        <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        {(["APPROVED", "CORRECTION_NEEDED", "REFUSED"] as const).map((d) => (
          <label key={d} className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="radio"
              name="decision"
              value={d}
              checked={decision === d}
              onChange={() => setDecision(d)}
            />
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {d === "APPROVED" ? "Valider" : d === "CORRECTION_NEEDED" ? "Correction" : "Refuser"}
            </span>
          </label>
        ))}
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
          Commentaire{commentRequired && <span className="text-red-500"> *</span>}
        </label>
        <textarea
          required={commentRequired}
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={
            decision === "REFUSED"           ? "Motif du refus obligatoire…" :
            decision === "CORRECTION_NEEDED" ? "Instructions de correction obligatoires…" :
            "Commentaire optionnel…"
          }
          className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
      >
        {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Valider la décision
      </button>
    </form>
  );
}
