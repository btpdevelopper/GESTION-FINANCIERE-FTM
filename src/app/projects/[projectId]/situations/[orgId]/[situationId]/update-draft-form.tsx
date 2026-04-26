"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateSituationDraftAction,
  submitSituationAction,
  uploadSituationDocumentAction,
  upsertSituationFtmBillingAction,
  removeSituationFtmBillingAction,
} from "@/server/situations/situation-actions";
import { Loader2, Paperclip, Plus, Trash2, X } from "lucide-react";
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

type FtmBillingLine = {
  id: string;
  ftmRecordId: string;
  ftmTitle: string;
  ftmNumber: number;
  percentage: number;
  billedAmountCents: number;
  status: string;
  moeComment: string | null;
  moaComment: string | null;
};

type AcceptedFtm = {
  ftmId: string;
  title: string;
  number: number;
  quoteAmountCents: number;
};

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
  ftmBillings: FtmBillingLine[];
  acceptedFtms: AcceptedFtm[];
  usedPeriods: string[];
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
  ftmBillings,
  acceptedFtms,
  usedPeriods,
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

  // FTM billing state
  const [ftmError, setFtmError] = useState<string | null>(null);
  const [addingFtm, setAddingFtm] = useState(false);
  const [selectedFtmId, setSelectedFtmId] = useState("");
  const [ftmPercentage, setFtmPercentage] = useState("100");
  const [ftmPending, startFtmTransition] = useTransition();

  const [correctionChoice, setCorrectionChoice] = useState<"accept" | "propose">(
    hasMoeAmount ? "accept" : "propose"
  );

  // Controlled period state — needed for duplicate-month validation
  const [periodLabel, setPeriodLabel] = useState(currentPeriodLabel);
  const periodAlreadyUsed = !isCorrection && usedPeriods.includes(periodLabel);

  // Controlled amount state with monthly/cumulative toggle
  const [inputMode, setInputMode] = useState<"monthly" | "cumulative">("cumulative");
  const [amountStr, setAmountStr] = useState((currentAmountHtCents / 100).toFixed(2));
  const [proposeAmountStr, setProposeAmountStr] = useState((currentAmountHtCents / 100).toFixed(2));

  // FTM billing helpers
  const selectedFtm = acceptedFtms.find((f) => f.ftmId === selectedFtmId);
  const previewBilledCents = selectedFtm
    ? Math.floor((selectedFtm.quoteAmountCents * parseInt(ftmPercentage || "0", 10)) / 100)
    : 0;
  const alreadyAddedFtmIds = new Set(ftmBillings.map((b) => b.ftmRecordId));
  const availableFtms = acceptedFtms.filter((f) => !alreadyAddedFtmIds.has(f.ftmId));

  // Derive effective cumulative for visuals
  const parsedAmt = Math.round(parseFloat(amountStr.replace(",", ".") || "0") * 100);
  const normalCumulativeCents = inputMode === "monthly" ? previousCumulativeCents + parsedAmt : parsedAmt;
  const effectiveCents = hasMoeAmount
    ? correctionChoice === "accept"
      ? moeAdjustedAmountHtCents!
      : Math.round(parseFloat(proposeAmountStr.replace(",", ".") || "0") * 100)
    : normalCumulativeCents;
  const activeFtmCents = ftmBillings
    .filter((b) => b.status !== "MOE_REFUSED" && b.status !== "MOA_REFUSED")
    .reduce((sum, b) => sum + b.billedAmountCents, 0);
  const thisPeriodCents = Math.max(0, effectiveCents - previousCumulativeCents) + activeFtmCents;
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

  function handleAddFtm() {
    if (!selectedFtmId || !ftmPercentage) return;
    const pct = parseInt(ftmPercentage, 10);
    if (isNaN(pct) || pct < 1 || pct > 100) {
      setFtmError("Le pourcentage doit être entre 1 et 100.");
      return;
    }
    setFtmError(null);
    startFtmTransition(async () => {
      try {
        await upsertSituationFtmBillingAction({ situationId, projectId, ftmRecordId: selectedFtmId, percentage: pct });
        setSelectedFtmId("");
        setFtmPercentage("100");
        setAddingFtm(false);
        router.refresh();
      } catch (err: unknown) {
        setFtmError(err instanceof Error ? err.message : "Erreur inconnue.");
      }
    });
  }

  function handleRemoveFtm(billingId: string) {
    startFtmTransition(async () => {
      try {
        await removeSituationFtmBillingAction({ billingId, projectId });
        router.refresh();
      } catch (err: unknown) {
        setFtmError(err instanceof Error ? err.message : "Erreur inconnue.");
      }
    });
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
      : normalCumulativeCents;

    const correctionComment =
      hasMoeAmount && correctionChoice === "propose"
        ? (fd.get("correctionComment") as string | null)?.trim() ?? null
        : null;

    if (hasMoeAmount && correctionChoice === "propose" && !correctionComment) {
      setError("Un commentaire est obligatoire lorsque vous proposez un montant différent.");
      return;
    }

    // In correction mode, a new document is required before saving
    if (isCorrection && !selectedFile) {
      setError("Vous devez joindre un nouveau document pour la resoumission après correction.");
      return;
    }

    setPendingAction("save");
    startTransition(async () => {
      try {
        const { url, name } = await resolveDocument();
        await updateSituationDraftAction({
          situationId,
          projectId,
          periodLabel: isCorrection ? currentPeriodLabel : periodLabel,
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

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(null);

    // In correction mode, a new document is required
    if (isCorrection && !selectedFile) {
      setError("Vous devez joindre un nouveau document pour la resoumission après correction.");
      return;
    }

    const amountCents = hasMoeAmount
      ? correctionChoice === "accept"
        ? moeAdjustedAmountHtCents!
        : Math.round(parseFloat(proposeAmountStr.replace(",", ".")) * 100)
      : normalCumulativeCents;

    const correctionComment =
      hasMoeAmount && correctionChoice === "propose"
        ? (formData.get("correctionComment") as string | null)?.trim() ?? null
        : null;

    if (hasMoeAmount && correctionChoice === "propose" && !correctionComment) {
      setError("Un commentaire est obligatoire lorsque vous proposez un montant différent.");
      return;
    }

    setPendingAction("submit");
    startTransition(async () => {
      try {
        // Auto-save current form state before submitting
        const { url, name } = await resolveDocument();
        await updateSituationDraftAction({
          situationId,
          projectId,
          periodLabel: isCorrection ? currentPeriodLabel : periodLabel,
          cumulativeAmountHtCents: amountCents,
          correctionComment,
          ...(url !== null ? { documentUrl: url, documentName: name } : {}),
        });
        await submitSituationAction({ situationId, projectId });
        setSuccess("Situation soumise au MOE avec succès.");
        clearFile();
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

      <SituationProgressBar
        previousCents={previousCumulativeCents}
        thisPeriodCents={thisPeriodCents}
        marcheTotalCents={marcheTotalCents}
      />

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
              <>
                <input
                  type="month"
                  required
                  value={periodLabel}
                  onChange={(e) => setPeriodLabel(e.target.value)}
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
              </>
            )}
          </div>

          {/* Amount — normal field when no MOE adjusted amount */}
          {!hasMoeAmount && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Montant <span className="text-red-500">*</span>
                </label>
                <div className="flex overflow-hidden rounded border border-slate-200 bg-white text-[11px] dark:border-slate-700 dark:bg-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      const cum = Math.round(parseFloat(amountStr.replace(",", ".") || "0") * 100);
                      setAmountStr((Math.max(0, cum - previousCumulativeCents) / 100).toFixed(2));
                      setInputMode("monthly");
                    }}
                    className={`px-2 py-0.5 transition-colors ${inputMode === "monthly" ? "bg-slate-800 text-white" : "text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700"}`}
                  >
                    Mensuel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const monthly = Math.round(parseFloat(amountStr.replace(",", ".") || "0") * 100);
                      setAmountStr(((previousCumulativeCents + monthly) / 100).toFixed(2));
                      setInputMode("cumulative");
                    }}
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
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  className="w-full rounded border border-slate-200 bg-white px-3 py-1.5 pr-8 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">€</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                {inputMode === "monthly"
                  ? <>Cumulé résultant : <strong className="text-slate-700 dark:text-slate-300">{formatEur(normalCumulativeCents)}</strong></>
                  : <>Montant du mois : <strong className="text-slate-700 dark:text-slate-300">{formatEur(thisPeriodCents)}</strong></>
                }
              </p>
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

          {hasForecast && (
            <ForecastComplianceBanner
              entries={forecastEntries}
              periodLabel={periodLabel}
              thisPeriodCents={thisPeriodCents}
            />
          )}

          {/* File attachment */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {isCorrection
                ? <>Joindre le document corrigé <span className="text-red-500">*</span></>
                : currentDocumentName
                ? "Remplacer le document"
                : "Joindre un document"}
              <span className="ml-1 font-normal text-slate-400">(PDF, Excel, image — 20 Mo max)</span>
            </label>
            {currentDocumentName && !selectedFile && (
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                <Paperclip className="h-3 w-3" />
                {isCorrection ? "Document précédent :" : "Actuel :"}{" "}
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
                <span>{isCorrection ? "Choisir le document corrigé" : currentDocumentName ? "Choisir un autre fichier" : "Joindre un fichier"}</span>
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

          {/* FTM billing section */}
          {acceptedFtms.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">FTMs à facturer ce mois</p>

              {ftmError && (
                <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
                  {ftmError}
                </p>
              )}

              {ftmBillings.length > 0 && (
                <div className="divide-y divide-slate-100 rounded border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
                  {ftmBillings.map((b) => {
                    const lineRefused = b.status === "MOE_REFUSED" || b.status === "MOA_REFUSED";
                    const lineCorrection =
                      b.status === "MOE_CORRECTION_NEEDED" || b.status === "MOA_CORRECTION_NEEDED";
                    const canRemove = b.status === "PENDING" || lineRefused || lineCorrection;
                    const statusLabel =
                      b.status === "PENDING" ? "En attente" :
                      b.status === "MOE_APPROVED" ? "Approuvé MOE" :
                      b.status === "MOA_APPROVED" ? "Approuvé MOA" :
                      b.status === "MOE_REFUSED" ? "Refusé MOE" :
                      b.status === "MOA_REFUSED" ? "Refusé MOA" :
                      b.status === "MOE_CORRECTION_NEEDED" ? "Correction MOE demandée" :
                      "Correction MOA demandée";
                    const statusClass =
                      b.status === "MOE_APPROVED" ? "bg-teal-100 text-teal-700" :
                      b.status === "MOA_APPROVED" ? "bg-green-100 text-green-700" :
                      lineRefused ? "bg-red-100 text-red-700" :
                      lineCorrection ? "bg-amber-100 text-amber-700" :
                      "bg-slate-100 text-slate-600";
                    return (
                      <div key={b.id} className="px-3 py-2 text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <span className="text-slate-700 dark:text-slate-300">
                              FTM n°{b.ftmNumber} — {b.ftmTitle}
                            </span>
                            <span className="ml-2 text-slate-500">({b.percentage}%)</span>
                          </div>
                          <span className={`shrink-0 font-medium ${lineRefused ? "line-through text-red-500" : "text-slate-700 dark:text-slate-300"}`}>
                            {formatEur(b.billedAmountCents)}
                          </span>
                          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${statusClass}`}>
                            {statusLabel}
                          </span>
                          {canRemove && (
                            <button
                              type="button"
                              disabled={ftmPending}
                              onClick={() => handleRemoveFtm(b.id)}
                              className="shrink-0 rounded p-0.5 text-red-400 hover:text-red-600 disabled:opacity-50"
                              title="Retirer ce FTM"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        {lineCorrection && b.moeComment && b.status === "MOE_CORRECTION_NEEDED" && (
                          <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] italic text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                            Correction MOE : {b.moeComment}
                          </p>
                        )}
                        {lineCorrection && b.status === "MOA_CORRECTION_NEEDED" && b.moaComment && (
                          <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] italic text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
                            Correction MOA : {b.moaComment}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {availableFtms.length > 0 && !addingFtm && (
                <button
                  type="button"
                  onClick={() => { setAddingFtm(true); setSelectedFtmId(availableFtms[0]?.ftmId ?? ""); }}
                  className="flex items-center gap-1.5 rounded border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-500 hover:border-slate-400 hover:text-slate-700 dark:border-slate-700 dark:hover:border-slate-500"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Ajouter un FTM
                </button>
              )}

              {addingFtm && (
                <div className="rounded border border-slate-200 bg-white p-3 space-y-2 dark:border-slate-700 dark:bg-slate-800">
                  <div className="flex flex-wrap gap-2">
                    <div className="flex-1 min-w-[200px]">
                      <label className="block text-[11px] text-slate-500 mb-1">FTM</label>
                      <select
                        value={selectedFtmId}
                        onChange={(e) => setSelectedFtmId(e.target.value)}
                        className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                      >
                        {availableFtms.map((f) => (
                          <option key={f.ftmId} value={f.ftmId}>
                            FTM n°{f.number} — {f.title} ({formatEur(f.quoteAmountCents)})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-24">
                      <label className="block text-[11px] text-slate-500 mb-1">% à facturer</label>
                      <div className="relative">
                        <input
                          type="number"
                          min="1"
                          max="100"
                          value={ftmPercentage}
                          onChange={(e) => setFtmPercentage(e.target.value)}
                          className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 pr-6 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">%</span>
                      </div>
                    </div>
                  </div>
                  {selectedFtm && ftmPercentage && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Montant facturé :{" "}
                      <strong className="text-slate-700 dark:text-slate-200">{formatEur(previewBilledCents)}</strong>
                      {" "}sur{" "}
                      <strong>{formatEur(selectedFtm.quoteAmountCents)}</strong>
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={ftmPending}
                      onClick={handleAddFtm}
                      className="inline-flex items-center gap-1 rounded bg-slate-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
                    >
                      {ftmPending && <Loader2 className="h-3 w-3 animate-spin" />}
                      Ajouter
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAddingFtm(false); setFtmError(null); }}
                      className="rounded px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700"
                    >
                      Annuler
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {/* Save as draft — only available in DRAFT mode, not during correction */}
            {!isCorrection && (
              <button
                type="submit"
                disabled={isPending || periodAlreadyUsed}
                className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              >
                {pendingAction === "save" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {pendingAction === "save" ? "Enregistrement…" : "Sauvegarder en brouillon"}
              </button>
            )}
            <button
              type="button"
              disabled={isPending || periodAlreadyUsed}
              onClick={(e) => {
                const form = (e.currentTarget as HTMLButtonElement).closest("form") as HTMLFormElement;
                handleSubmit(new FormData(form));
              }}
              className="inline-flex items-center gap-1.5 rounded bg-slate-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-50 transition-colors"
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
            periodLabel={periodLabel}
            thisPeriodCents={thisPeriodCents}
          />
        )}
      </div>
    </div>
  );
}
