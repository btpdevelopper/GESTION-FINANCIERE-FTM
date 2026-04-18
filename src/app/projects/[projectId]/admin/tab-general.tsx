"use client";

import { useState, useTransition } from "react";
import { Settings, Wallet, Check } from "lucide-react";
import { updateProjectAction } from "@/server/projects/admin-config-actions";
import { useRouter } from "next/navigation";

export function TabGeneral({
  project,
}: {
  project: {
    id: string;
    name: string;
    code: string | null;
    baseContract: { amountHtCents: bigint | string } | null;
  };
}) {
  const [name, setName] = useState(project.name);
  const [code, setCode] = useState(project.code ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const dirty = name !== project.name || code !== (project.code ?? "");

  const baseAmount = project.baseContract
    ? (Number(BigInt(project.baseContract.amountHtCents.toString())) / 100).toLocaleString(
        "fr-FR",
        { style: "currency", currency: "EUR" },
      )
    : null;

  const submit = () => {
    setError(null);
    setSaved(false);
    if (!name.trim()) {
      setError("Le nom du projet est requis.");
      return;
    }
    startTransition(async () => {
      try {
        await updateProjectAction({ projectId: project.id, name, code });
        setSaved(true);
        router.refresh();
        setTimeout(() => setSaved(false), 2500);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 flex items-center gap-2">
          <Settings className="h-5 w-5 text-indigo-500" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Informations du projet
          </h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Nom du projet <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-900"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Code projet
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Ex: PROJ-2026-001"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition-all focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:bg-slate-900"
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
            {error}
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-3">
          {saved && (
            <span className="flex items-center gap-1 text-sm font-medium text-emerald-600 dark:text-emerald-400">
              <Check className="h-4 w-4" />
              Modifications enregistrées
            </span>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={pending || !dirty}
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-500 hover:shadow-lg active:scale-95 disabled:opacity-50"
          >
            {pending ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-indigo-50/50 to-white p-6 shadow-sm dark:border-slate-800 dark:from-indigo-950/20 dark:to-slate-900">
        <div className="mb-3 flex items-center gap-2">
          <Wallet className="h-5 w-5 text-indigo-500" />
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            Marché de base
          </h2>
        </div>
        <p className="text-xs text-slate-500">
          Calculé automatiquement à partir des montants HT assignés aux entreprises dans chaque lot.
        </p>
        <p className="mt-3 text-3xl font-bold tracking-tight text-indigo-600 dark:text-indigo-400">
          {baseAmount ?? "Non défini"}
          {baseAmount && <span className="ml-2 text-sm font-medium text-slate-500">HT</span>}
        </p>
      </section>
    </div>
  );
}
