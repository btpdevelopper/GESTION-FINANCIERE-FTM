"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, Trash2, X, Building2 } from "lucide-react";
import { assignCompaniesToLotAction } from "@/server/projects/admin-config-actions";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { CardSubsection } from "@/components/ui/card";

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
        await assignCompaniesToLotAction({ projectId, projectLotId: lotId, rows: valid });
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  return (
    <>
      <div className="fixed inset-0 z-[998] animate-fade-in bg-black/40" onClick={onClose} />
      <div className="fixed right-0 top-0 z-[999] flex h-full w-full max-w-lg animate-slide-in-right flex-col border-l border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-slate-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Assigner des entreprises
              </h2>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              Lot :{" "}
              <span className="font-medium text-slate-700 dark:text-slate-300">{lotLabel}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <datalist id={`existing-orgs-${lotId}`}>
          {existingOrgNames.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
            Ajoutez une ou plusieurs entreprises avec leur montant de marché HT. Si une entreprise
            est déjà assignée à ce lot, son montant sera mis à jour.
          </p>

          <div className="space-y-2">
            {rows.map((row, i) => (
              <CardSubsection key={i} className="p-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1 space-y-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        Raison sociale
                      </label>
                      <Input
                        type="text"
                        list={`existing-orgs-${lotId}`}
                        value={row.organizationName}
                        onChange={(e) => updateRow(i, "organizationName", e.target.value)}
                        placeholder="Ex: SARL Dupont BTP"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        Montant HT (€)
                      </label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={row.amount}
                        onChange={(e) => updateRow(i, "amount", e.target.value)}
                        placeholder="Ex: 50000"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    disabled={rows.length === 1}
                    className="mt-6 rounded p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-30 dark:hover:bg-red-950/30"
                    title="Retirer cette ligne"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </CardSubsection>
            ))}
          </div>

          <button
            type="button"
            onClick={addRow}
            className="mt-3 flex items-center gap-1.5 rounded border border-dashed border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:border-slate-400 hover:text-slate-700 dark:border-slate-700 dark:hover:border-slate-500"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter une entreprise
          </button>

          {error && <Alert variant="error" className="mt-3">{error}</Alert>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Enregistrement..." : "Enregistrer"}
          </Button>
        </div>
      </div>
    </>
  );
}
