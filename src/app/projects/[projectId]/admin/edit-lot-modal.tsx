"use client";

import { useState, useTransition } from "react";
import { X, Trash2, Pencil } from "lucide-react";
import { updateLotAction, deleteLotAction } from "@/server/projects/admin-config-actions";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "./confirm-dialog";

export function EditLotModal({
  projectId,
  lot,
  open,
  onClose,
}: {
  projectId: string;
  lot: { id: string; label: string; description: string | null; organizationsCount: number };
  open: boolean;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(lot.label);
  const [description, setDescription] = useState(lot.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!open) return null;

  const save = () => {
    setError(null);
    if (!label.trim()) {
      setError("Le nom du lot est requis.");
      return;
    }
    startTransition(async () => {
      try {
        await updateLotAction({ projectId, lotId: lot.id, label, description });
        router.refresh();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const doDelete = async () => {
    await deleteLotAction({ projectId, lotId: lot.id });
    router.refresh();
    onClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-[999] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm px-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
              <Pencil className="h-5 w-5 text-indigo-500" />
              Modifier le lot
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Nom du lot
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm outline-none transition-all focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
                {error}
              </div>
            )}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={pending}
              className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Supprimer
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-500 hover:shadow-lg active:scale-95 disabled:opacity-50"
              >
                {pending ? "Enregistrement..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Supprimer ce lot ?"
        message={
          lot.organizationsCount > 0
            ? `Ce lot contient ${lot.organizationsCount} entreprise(s) assignée(s). La suppression retirera également toutes les assignations et recalculera le marché de base.`
            : "Cette action est irréversible."
        }
        confirmLabel="Supprimer définitivement"
        tone="danger"
        onConfirm={doDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );
}
