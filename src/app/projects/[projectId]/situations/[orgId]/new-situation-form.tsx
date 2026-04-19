"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSituationAction, uploadSituationDocumentAction } from "@/server/situations/situation-actions";
import { Plus, Loader2, Paperclip, X } from "lucide-react";
import {
  ForecastEntry,
  SituationProgressBar,
  SituationForecastPanel,
  ForecastComplianceBanner,
} from "../_components/forecast-visuals";

const ACCEPTED = ".pdf,.xlsx,.xls,.png,.jpg,.jpeg";

type Props = {
  projectId: string;
  forecastWaived: boolean;
  forecastEntries: ForecastEntry[];
  previousCumulativeCents: number;
  marcheTotalCents: number;
  usedPeriods: string[];
};

export function NewSituationForm({
  projectId,
  forecastWaived,
  forecastEntries,
  previousCumulativeCents,
  marcheTotalCents,
  usedPeriods,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [inputMode, setInputMode] = useState<"monthly" | "cumulative">("monthly");
  const [rawAmount, setRawAmount] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const hasForecast = forecastEntries.length > 0;
  const showPanel = hasForecast || forecastWaived;
  const periodAlreadyUsed = selectedPeriod !== "" && usedPeriods.includes(selectedPeriod);

  const parsedCents = Math.round(parseFloat(rawAmount.replace(",", ".") || "0") * 100);
  const thisPeriodCents = inputMode === "monthly" ? Math.max(0, parsedCents) : Math.max(0, parsedCents - previousCumulativeCents);
  const cumulativeCents = inputMode === "monthly" ? previousCumulativeCents + parsedCents : parsedCents;
  const showVisuals = rawAmount !== "" && parsedCents > 0;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSelectedFile(e.target.files?.[0] ?? null);
  }

  function clearFile() {
    setSelectedFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleClose() {
    setOpen(false);
    setError(null);
    clearFile();
    setSelectedPeriod("");
    setRawAmount("");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
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
          periodLabel: selectedPeriod,
          cumulativeAmountHtCents: cumulativeCents,
          documentUrl,
          documentName,
        });
        handleClose();
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
        className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <Plus className="h-3.5 w-3.5" />
        Nouvelle situation
      </button>
    );
  }

  return (
    <div className="rounded border border-amber-200 bg-amber-50 p-4 space-y-4 dark:border-amber-900/50 dark:bg-amber-950/20">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Nouvelle situation de travaux
      </h2>

      {showVisuals && (
        <SituationProgressBar
          previousCents={previousCumulativeCents}
          thisPeriodCents={thisPeriodCents}
          marcheTotalCents={marcheTotalCents}
        />
      )}

      <div className={`grid grid-cols-1 gap-4 ${showPanel ? "lg:grid-cols-[1fr_260px]" : ""}`}>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </p>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Période <span className="text-red-500">*</span>
            </label>
            <input
              type="month"
              required
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className={`w-full rounded border px-3 py-1.5 text-xs focus:outline-none focus:ring-1 dark:bg-slate-800 dark:text-slate-100 ${
                periodAlreadyUsed
                  ? "border-red-300 bg-red-50 focus:ring-red-300 dark:border-red-700 dark:bg-red-950/20"
                  : "border-slate-200 bg-white focus:ring-slate-400 dark:border-slate-700"
              }`}
            />
            {periodAlreadyUsed && (
              <p className="mt-1 text-[11px] text-red-600 dark:text-red-400">
                Une situation existe déjà pour cette période.
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Montant <span className="text-red-500">*</span>
              </label>
              <div className="flex overflow-hidden rounded border border-slate-200 bg-white text-[11px] dark:border-slate-700 dark:bg-slate-800">
                <button
                  type="button"
                  onClick={() => { setInputMode("monthly"); setRawAmount(""); }}
                  className={`px-2 py-0.5 transition-colors ${inputMode === "monthly" ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700"}`}
                >
                  Mensuel
                </button>
                <button
                  type="button"
                  onClick={() => { setInputMode("cumulative"); setRawAmount(""); }}
                  className={`px-2 py-0.5 transition-colors ${inputMode === "cumulative" ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700"}`}
                >
                  Cumulé
                </button>
              </div>
            </div>
            <div className="relative">
              <input
                type="number"
                required
                min="0"
                step="0.01"
                placeholder="0.00"
                value={rawAmount}
                onChange={(e) => setRawAmount(e.target.value)}
                className="w-full rounded border border-slate-200 bg-white px-3 py-1.5 pr-8 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">€</span>
            </div>
            {showVisuals && (
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                {inputMode === "monthly"
                  ? <>Cumulé résultant : <strong className="text-slate-700 dark:text-slate-300">{(cumulativeCents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</strong></>
                  : <>Montant du mois : <strong className="text-slate-700 dark:text-slate-300">{(thisPeriodCents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}</strong></>
                }
              </p>
            )}
          </div>

          {hasForecast && selectedPeriod && showVisuals && (
            <ForecastComplianceBanner
              entries={forecastEntries}
              periodLabel={selectedPeriod}
              thisPeriodCents={thisPeriodCents}
            />
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Document justificatif
              <span className="ml-1 font-normal text-slate-400">(PDF, Excel, image — 20 Mo max)</span>
            </label>
            {selectedFile ? (
              <div className="flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-800">
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="flex-1 truncate text-xs text-slate-700 dark:text-slate-300">{selectedFile.name}</span>
                <span className="shrink-0 text-[11px] text-slate-400">{(selectedFile.size / 1024 / 1024).toFixed(1)} Mo</span>
                <button type="button" onClick={clearFile} className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-700">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-2 rounded border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 transition hover:border-slate-400 hover:text-slate-700 dark:border-slate-700 dark:hover:border-slate-500">
                <Paperclip className="h-3.5 w-3.5 shrink-0" />
                <span>Joindre un fichier</span>
                <input ref={fileRef} type="file" accept={ACCEPTED} onChange={handleFileChange} className="sr-only" />
              </label>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={isPending || periodAlreadyUsed}
              className="inline-flex items-center gap-1.5 rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isPending ? "Création…" : "Créer en brouillon"}
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Annuler
            </button>
          </div>
        </form>

        {showPanel && (
          <SituationForecastPanel
            entries={forecastEntries}
            forecastWaived={forecastWaived}
            periodLabel={selectedPeriod}
            thisPeriodCents={thisPeriodCents}
          />
        )}
      </div>
    </div>
  );
}
