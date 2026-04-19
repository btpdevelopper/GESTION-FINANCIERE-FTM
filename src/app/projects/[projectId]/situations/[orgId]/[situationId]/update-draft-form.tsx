"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateSituationDraftAction,
  submitSituationAction,
  uploadSituationDocumentAction,
} from "@/server/situations/situation-actions";
import { Loader2, Paperclip, X } from "lucide-react";

const ACCEPTED = ".pdf,.xlsx,.xls,.png,.jpg,.jpeg";

type Props = {
  projectId: string;
  situationId: string;
  orgId: string;
  currentPeriodLabel: string;
  currentAmountHtCents: number;
  currentDocumentName: string | null;
  status: string;
};

export function UpdateDraftForm({
  projectId,
  situationId,
  orgId,
  currentPeriodLabel,
  currentAmountHtCents,
  currentDocumentName,
  status,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSelectedFile(e.target.files?.[0] ?? null);
  }

  function clearFile() {
    setSelectedFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function resolveDocument(fd: FormData): Promise<{ url: string | null; name: string | null }> {
    if (!selectedFile) return { url: null, name: null };
    const uploadFd = new FormData();
    uploadFd.append("projectId", projectId);
    uploadFd.append("file", selectedFile);
    const result = await uploadSituationDocumentAction(uploadFd);
    return { url: result.path, name: result.name };
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const fd = new FormData(e.currentTarget);
    const amountCents = Math.round(parseFloat((fd.get("amount") as string).replace(",", ".")) * 100);

    startTransition(async () => {
      try {
        const { url, name } = await resolveDocument(fd);
        await updateSituationDraftAction({
          situationId,
          projectId,
          periodLabel: fd.get("periodLabel") as string,
          cumulativeAmountHtCents: amountCents,
          ...(url !== null ? { documentUrl: url, documentName: name } : {}),
        });
        setSuccess("Modifications enregistrées.");
        clearFile();
        router.refresh();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erreur inconnue.");
      }
    });
  }

  async function handleSubmit() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        await submitSituationAction({ situationId, projectId });
        router.refresh();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erreur inconnue.");
      }
    });
  }

  return (
    <form
      onSubmit={handleSave}
      className="rounded-xl border border-indigo-200 bg-indigo-50 p-6 space-y-4 dark:border-indigo-900 dark:bg-indigo-950/30"
    >
      <h2 className="font-semibold text-slate-900 dark:text-slate-100">
        {status === "MOE_CORRECTION" ? "Corriger la situation" : "Modifier le brouillon"}
      </h2>

      {error && (
        <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:bg-red-900/30 dark:text-red-400">{error}</p>
      )}
      {success && (
        <p className="rounded-lg bg-green-50 px-4 py-2.5 text-sm text-green-700 dark:bg-green-900/30 dark:text-green-400">{success}</p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Période</label>
          <input
            name="periodLabel"
            type="month"
            required
            defaultValue={currentPeriodLabel}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
            Montant cumulé HT (€)
          </label>
          <input
            name="amount"
            type="number"
            required
            min="0"
            step="0.01"
            defaultValue={(currentAmountHtCents / 100).toFixed(2)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
      </div>

      {/* File attachment */}
      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
          {currentDocumentName ? "Remplacer le document" : "Joindre un document"}
          <span className="ml-1 text-xs font-normal text-slate-400">(PDF, Excel, image — 20 Mo max)</span>
        </label>
        {currentDocumentName && !selectedFile && (
          <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Paperclip className="h-3.5 w-3.5" />
            Actuel : <span className="font-medium text-slate-700 dark:text-slate-300">{currentDocumentName}</span>
          </p>
        )}
        {selectedFile ? (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800">
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
            <span>{currentDocumentName ? "Choisir un autre fichier" : "Joindre un fichier"}</span>
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

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isPending ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={handleSubmit}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
        >
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isPending ? "Envoi…" : "Soumettre au MOE"}
        </button>
      </div>
    </form>
  );
}
