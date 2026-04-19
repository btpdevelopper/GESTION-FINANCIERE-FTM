"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateSituationDraftAction,
  submitSituationAction,
  uploadSituationDocumentAction,
} from "@/server/situations/situation-actions";
import { Loader2, Paperclip, X } from "lucide-react";
import {
  ForecastEntry,
  SituationProgressBar,
  SituationForecastPanel,
  ForecastComplianceBanner,
} from "../../_components/forecast-visuals";

const ACCEPTED = ".pdf,.xlsx,.xls,.png,.jpg,.jpeg";

function formatEur(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

type Props = {
  projectId: string;
  situationId: string;
  orgId: string;
  currentPeriodLabel: string;
  currentAmountHtCents: number;
  currentDocumentName: string | null;
  status: string;
  moeAdjustedAmountHtCents: number | null;
  forecastEntries: ForecastEntry[];
  forecastWaived: boolean;
  marcheTotalCents: number;
  previousCumulativeCents: number;
};

export function UpdateDraftForm({
  projectId,
  situationId,
  orgId,
  currentPeriodLabel,
  currentAmountHtCents,
  currentDocumentName,
  status,
  moeAdjustedAmountHtCents,
  forecastEntries,
  forecastWaived,
  marcheTotalCents,
  previousCumulativeCents,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<"save" | "submit" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const isCorrection = status === "MOE_CORRECTION";
  const hasMoeAmount = isCorrection && moeAdjustedAmountHtCents != null;

  const [correctionChoice, setCorrectionChoice] = useState<"accept" | "propose">(
    hasMoeAmount ? "accept" : "propose"
  );

  // Controlled amount state for visual preview
  const [amountStr, setAmountStr] = useState((currentAmountHtCents / 100).toFixed(2));
  const [proposeAmountStr, setProposeAmountStr] = useState((currentAmountHtCents / 100).toFixed(2));

  // Derive effective cumulative for visuals
  const effectiveCents = hasMoeAmount
    ? correctionChoice === "accept"
      ? moeAdjustedAmountHtCents!
      : Math.round(parseFloat(proposeAmountStr.replace(",", ".") || "0") * 100)
    : Math.round(parseFloat(amountStr.replace(",", ".") || "0") * 100);
  const thisPeriodCents = Math.max(0, effectiveCents - previousCumulativeCents);
  const showVisuals = effectiveCents > 0;
  const hasForecast = forecastEntries.length > 0;
  const showPanel = hasForecast || forecastWaived;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSelectedFile(e.target.files?.[0] ?? null);
  }

  function clearFile() {
    setSelectedFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function resolveDocument(): Promise<{ url: string | null; name: string | null }> {
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

    const amountCents = hasMoeAmount
      ? correctionChoice === "accept"
        ? moeAdjustedAmountHtCents!
        : Math.round(parseFloat(proposeAmountStr.replace(",", ".")) * 100)
      : Math.round(parseFloat(amountStr.replace(",", ".")) * 100);

    const correctionComment =
      hasMoeAmount && correctionChoice === "propose"
        ? (fd.get("correctionComment") as string | null)?.trim() ?? null
        : null;

    if (hasMoeAmount && correctionChoice === "propose" && !correctionComment) {
      setError("Un commentaire est obligatoire lorsque vous proposez un montant différent.");
      return;
    }

    setPendingAction("save");
    startTransition(async () => {
      try {
        const { url, name } = await resolveDocument();
        await updateSituationDraftAction({
          situationId,
          projectId,
          periodLabel: isCorrection ? currentPeriodLabel : (fd.get("periodLabel") as string),
          cumulativeAmountHtCents: amountCents,
          correctionComment,
          ...(url !== null ? { documentUrl: url, documentName: name } : {}),
        });
        setSuccess("Modifications enregistrées.");
        clearFile();
        router.refresh();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erreur inconnue.");
      } finally {
        setPendingAction(null);
      }
    });
  }

  async function handleSubmit() {
    setError(null);
    setSuccess(null);
    setPendingAction("submit");
    startTransition(async () => {
      try {
        await submitSituationAction({ situationId, projectId });
        router.refresh();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erreur inconnue.");
      } finally {
        setPendingAction(null);
      }
    });
  }

  return (
    <div className="rounded border border-amber-200 bg-amber-50 p-4 space-y-4 dark:border-amber-900/50 dark:bg-amber-950/20">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {isCorrection ? "Corriger la situation" : "Modifier le brouillon"}
      </h2>

      {showVisuals && (
        <SituationProgressBar
          previousCents={previousCumulativeCents}
          thisPeriodCents={thisPeriodCents}
          marcheTotalCents={marcheTotalCents}
        />
      )}

      <div className={`grid grid-cols-1 gap-4 ${showPanel ? "lg:grid-cols-[1fr_260px]" : ""}`}>
        <form onSubmit={handleSave} className="space-y-3">
          {error && (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400">
              {success}
            </p>
          )}

          {/* Period — locked in correction mode */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Période
            </label>
            {isCorrection ? (
              <p className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {currentPeriodLabel}
              </p>
            ) : (
              <input
                name="periodLabel"
                type="month"
                required
                defaultValue={currentPeriodLabel}
                className="w-full rounded border border-slate-200 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            )}
          </div>

          {/* Amount — normal field when no MOE adjusted amount */}
          {!hasMoeAmount && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Montant cumulé HT
              </label>
              <div className="relative">
                <input
                  name="amount"
                  type="number"
                  required
                  min="0"
                  step="0.01"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="w-full rounded border border-slate-200 bg-white px-3 py-1.5 pr-8 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">€</span>
              </div>
              {showVisuals && (
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                  Montant du mois :{" "}
                  <strong className="text-slate-700 dark:text-slate-300">
                    {(thisPeriodCents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                  </strong>
                </p>
              )}
            </div>
          )}

          {/* MOE correction amount: two-option flow */}
          {hasMoeAmount && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Montant cumulé HT
              </p>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="correctionChoice"
                  value="accept"
                  checked={correctionChoice === "accept"}
                  onChange={() => setCorrectionChoice("accept")}
                  className="mt-0.5 shrink-0"
                />
                <div>
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    Accepter le montant MOE
                  </span>
                  <span className="ml-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
                    {formatEur(moeAdjustedAmountHtCents!)}
                  </span>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="radio"
                  name="correctionChoice"
                  value="propose"
                  checked={correctionChoice === "propose"}
                  onChange={() => setCorrectionChoice("propose")}
                  className="mt-0.5 shrink-0"
                />
                <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                  Proposer un autre montant
                </span>
              </label>

              {correctionChoice === "propose" && (
                <div className="pl-6 space-y-3">
                  <div className="relative">
                    <input
                      name="amount"
                      type="number"
                      required
                      min="0"
                      step="0.01"
                      value={proposeAmountStr}
                      onChange={(e) => setProposeAmountStr(e.target.value)}
                      placeholder="Montant HT proposé"
                      className="w-full rounded border border-slate-200 bg-white px-3 py-1.5 pr-8 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">€</span>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Justification <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      name="correctionComment"
                      required
                      rows={3}
                      placeholder="Expliquez pourquoi vous proposez un montant différent…"
                      className="w-full rounded border border-slate-200 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {hasForecast && showVisuals && (
            <ForecastComplianceBanner
              entries={forecastEntries}
              periodLabel={currentPeriodLabel}
              thisPeriodCents={thisPeriodCents}
            />
          )}

          {/* File attachment */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {currentDocumentName ? "Remplacer le document" : "Joindre un document"}
              <span className="ml-1 font-normal text-slate-400">(PDF, Excel, image — 20 Mo max)</span>
            </label>
            {currentDocumentName && !selectedFile && (
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <Paperclip className="h-3 w-3" />
                Actuel :{" "}
                <span className="font-medium text-slate-700 dark:text-slate-300">
                  {currentDocumentName}
                </span>
              </p>
            )}
            {selectedFile ? (
              <div className="flex items-center gap-2 rounded border border-slate-200 bg-white px-3 py-1.5 dark:border-slate-700 dark:bg-slate-800">
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="flex-1 truncate text-xs text-slate-700 dark:text-slate-300">
                  {selectedFile.name}
                </span>
                <span className="shrink-0 text-[11px] text-slate-400">
                  {(selectedFile.size / 1024 / 1024).toFixed(1)} Mo
                </span>
                <button
                  type="button"
                  onClick={clearFile}
                  className="shrink-0 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <label className="flex cursor-pointer items-center gap-2 rounded border border-dashed border-slate-300 px-3 py-2 text-xs text-slate-500 transition hover:border-slate-400 hover:text-slate-700 dark:border-slate-700 dark:hover:border-slate-500">
                <Paperclip className="h-3.5 w-3.5 shrink-0" />
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

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-1.5 rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
            >
              {pendingAction === "save" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {pendingAction === "save" ? "Enregistrement…" : "Enregistrer"}
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={handleSubmit}
              className="inline-flex items-center gap-1.5 rounded bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600 disabled:opacity-50 transition-colors"
            >
              {pendingAction === "submit" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {pendingAction === "submit" ? "Envoi…" : "Soumettre au MOE"}
            </button>
          </div>
        </form>

        {showPanel && (
          <SituationForecastPanel
            entries={forecastEntries}
            forecastWaived={forecastWaived}
            periodLabel={currentPeriodLabel}
            thisPeriodCents={thisPeriodCents}
          />
        )}
      </div>
    </div>
  );
}
