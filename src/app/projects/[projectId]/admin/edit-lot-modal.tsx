"use client";

import { useState, useTransition } from "react";
import { Trash2, Pencil } from "lucide-react";
import { updateLotAction, deleteLotAction } from "@/server/projects/admin-config-actions";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "./confirm-dialog";
import { ModalOverlay, ModalContainer, ModalHeader } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

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
      <ModalOverlay>
        <ModalContainer>
          <ModalHeader
            title="Modifier le lot"
            icon={<Pencil className="h-4 w-4 text-slate-500" />}
            onClose={onClose}
          />

          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                Nom du lot
              </label>
              <Input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
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
                className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-colors focus:border-slate-400 focus:ring-2 focus:ring-slate-400/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            {error && <Alert variant="error">{error}</Alert>}
          </div>

          <div className="mt-5 flex items-center justify-between">
            <Button
              variant="danger"
              size="sm"
              onClick={() => setConfirmDelete(true)}
              disabled={pending}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Supprimer
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={onClose} disabled={pending}>
                Annuler
              </Button>
              <Button onClick={save} disabled={pending}>
                {pending ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </div>
          </div>
        </ModalContainer>
      </ModalOverlay>

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
