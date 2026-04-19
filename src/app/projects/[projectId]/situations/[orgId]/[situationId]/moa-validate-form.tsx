"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moaValidateSituationAction } from "@/server/situations/situation-actions";
import { Loader2 } from "lucide-react";

type Props = { projectId: string; situationId: string; orgId: string };

export function MoaValidateForm({ projectId, situationId, orgId }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<"APPROVED" | "REFUSED">("APPROVED");

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
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-green-200 bg-green-50 p-6 space-y-5 dark:border-green-900 dark:bg-green-950/30"
    >
      <h2 className="font-semibold text-slate-900 dark:text-slate-100">Validation MOA</h2>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">{error}</p>
      )}

      <fieldset>
        <legend className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Décision finale</legend>
        <div className="flex gap-3">
          {(["APPROVED", "REFUSED"] as const).map((d) => (
            <label
              key={d}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                decision === d
                  ? d === "APPROVED"
                    ? "border-green-500 bg-green-100 text-green-800"
                    : "border-red-500 bg-red-50 text-red-700"
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
              {d === "APPROVED" ? "Valider et approuver le paiement" : "Refuser"}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Commentaire{decision === "REFUSED" && <span className="text-red-500"> *</span>}
        </label>
        <textarea
          name="comment"
          required={decision === "REFUSED"}
          rows={3}
          placeholder={decision === "REFUSED" ? "Motif du refus (obligatoire)…" : "Observations (optionnel)…"}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors disabled:opacity-50 ${
          decision === "APPROVED"
            ? "bg-green-600 hover:bg-green-500"
            : "bg-red-600 hover:bg-red-500"
        }`}
      >
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {isPending
          ? "Enregistrement…"
          : decision === "APPROVED"
          ? "Confirmer la validation"
          : "Confirmer le refus"}
      </button>
    </form>
  );
}
