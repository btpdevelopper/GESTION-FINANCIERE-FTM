"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, Trash2, X, Building2 } from "lucide-react";
import { assignCompaniesToLotAction } from "@/server/projects/admin-config-actions";
import { useRouter } from "next/navigation";

type Row = { organizationName: string; amount: string };

function parseAmountToCents(amt: string): string {
  const clean = parseFloat(amt.replace(/\s/g, "").replace(",", "."));
  return isNaN(clean) ? "0" : String(Math.round(clean * 100));
}

export function AssignCompaniesDrawer({
  projectId,
  lotId,
  lotLabel,
  existingOrgNames,
  open,
  onClose,
}: {
  projectId: string;
  lotId: string;
  lotLabel: string;
  existingOrgNames: string[];
  open: boolean;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<Row[]>([{ organizationName: "", amount: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (open) {
      setRows([{ organizationName: "", amount: "" }]);
      setError(null);
    }
  }, [open, lotId]);

  if (!open) return null;

  const addRow = () => setRows((r) => [...r, { organizationName: "", amount: "" }]);
  const removeRow = (i: number) =>
    setRows((r) => (r.length === 1 ? r : r.filter((_, idx) => idx !== i)));
  const updateRow = (i: number, field: keyof Row, value: string) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));

  const submit = () => {
    setError(null);
    const valid = rows
      .map((r) => ({
        organizationName: r.organizationName.trim(),
        montantMarcheHtCents: parseAmountToCents(r.amount),
      }))
      .filter((r) => r.organizationName.length > 0);

    if (valid.length === 0) {
      setError("Ajoutez au moins une entreprise avec un nom valide.");
      return;
    }

    startTransition(async () => {
      try {
        await assignCompaniesToLotAction({
          projectId,
          projectLotId: lotId,
          rows: valid,
        });
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[998] bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed right-0 top-0 z-[999] flex h-full w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-indigo-500" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Assigner des entreprises
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Lot : <span className="font-medium text-slate-700 dark:text-slate-300">{lotLabel}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <datalist id={`existing-orgs-${lotId}`}>
          {existingOrgNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
            Ajoutez une ou plusieurs entreprises avec leur montant de marché HT.
            Si une entreprise est déjà assignée à ce lot, son montant sera mis à jour.
          </p>

          <div className="space-y-3">
            {rows.map((row, i) => (
              <div
                key={i}
                className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-800/30"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 space-y-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        Raison sociale
                      </label>
                      <input
                        type="text"
                        list={`existing-orgs-${lotId}`}
                        value={row.organizationName}
                        onChange={(e) => updateRow(i, "organizationName", e.target.value)}
                        placeholder="Ex: SARL Dupont BTP"
                        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        Montant HT (€)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.amount}
                        onChange={(e) => updateRow(i, "amount", e.target.value)}
                        placeholder="Ex: 50000"
                        className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    disabled={rows.length === 1}
                    className="mt-6 rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400 dark:hover:bg-red-950/30"
                    title="Retirer cette ligne"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addRow}
            className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-400"
          >
            <Plus className="h-4 w-4" />
            Ajouter une entreprise
          </button>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-500 hover:shadow-lg active:scale-95 disabled:opacity-50"
          >
            {pending ? "Enregistrement..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </>
  );
}
