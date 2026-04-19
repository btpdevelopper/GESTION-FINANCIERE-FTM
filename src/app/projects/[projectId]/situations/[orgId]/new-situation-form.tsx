"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSituationAction, uploadSituationDocumentAction } from "@/server/situations/situation-actions";
import { Plus, Loader2, Paperclip, X } from "lucide-react";

const ACCEPTED = ".pdf,.xlsx,.xls,.png,.jpg,.jpeg";

export function NewSituationForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSelectedFile(e.target.files?.[0] ?? null);
  }

  function clearFile() {
    setSelectedFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const amountCents = Math.round(parseFloat((fd.get("amount") as string).replace(",", ".")) * 100);

    startTransition(async () => {
      try {
        let documentUrl: string | null = null;
        let documentName: string | null = null;

        if (selectedFile) {
          const uploadFd = new FormData();
          uploadFd.append("projectId", projectId);
          uploadFd.append("file", selectedFile);
          const result = await uploadSituationDocumentAction(uploadFd);
          documentUrl = result.path;
          documentName = result.name;
        }

        await createSituationAction({
          projectId,
          periodLabel: fd.get("periodLabel") as string,
          cumulativeAmountHtCents: amountCents,
          documentUrl,
          documentName,
        });

        setOpen(false);
        setSelectedFile(null);
        router.refresh();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erreur inconnue.");
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors"
      >
        <Plus className="h-4 w-4" />
        Nouvelle situation
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-slate-200 bg-white p-6 space-y-4 dark:border-slate-800 dark:bg-slate-900"
    >
      <h2 className="font-semibold text-slate-900 dark:text-slate-100">Nouvelle situation de travaux</h2>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Période <span className="text-red-500">*</span>
          </label>
          <input
            name="periodLabel"
            type="month"
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Montant cumulé HT (€) <span className="text-red-500">*</span>
          </label>
          <input
            name="amount"
            type="number"
            required
            min="0"
            step="0.01"
            placeholder="0.00"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <p className="mt-1 text-xs text-slate-500">Total cumulé depuis le début du chantier</p>
        </div>
      </div>

      {/* File attachment */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          Document justificatif
          <span className="ml-1 text-xs font-normal text-slate-400">(PDF, Excel, image — 20 Mo max)</span>
        </label>
        {selectedFile ? (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
            <Paperclip className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="flex-1 truncate text-sm text-slate-700 dark:text-slate-300">{selectedFile.name}</span>
            <span className="shrink-0 text-xs text-slate-400">
              {(selectedFile.size / 1024 / 1024).toFixed(1)} Mo
            </span>
            <button
              type="button"
              onClick={clearFile}
              className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:hover:border-indigo-500">
            <Paperclip className="h-4 w-4 shrink-0" />
            <span>Joindre un fichier</span>
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED}
              onChange={handleFileChange}
              className="sr-only"
            />
          </label>
        )}
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isPending ? "Création…" : "Créer en brouillon"}
        </button>
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); clearFile(); }}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
