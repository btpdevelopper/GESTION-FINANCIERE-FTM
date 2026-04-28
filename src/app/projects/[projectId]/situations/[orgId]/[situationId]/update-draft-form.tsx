"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateSituationDraftAction,
  submitSituationAction,
  uploadSituationDocumentAction,
  upsertSituationFtmBillingAction,
  removeSituationFtmBillingAction,
  applyRegularizationsToSituationAction,
} from "@/server/situations/situation-actions";
import { Loader2, Paperclip, Plus, Trash2, X, Info, TrendingUp, AlertTriangle } from "lucide-react";
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

function formatPeriod(yyyyMM: string): string {
  if (!/^\d{4}-\d{2}$/.test(yyyyMM)) return yyyyMM;
  const [year, month] = yyyyMM.split("-");
  const label = new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// ─── Exported types (consumed by page.tsx) ───────────────────────────────────

export type RevisionIndexState = {
  fixedPart: number;
  variablePart: number;
  components: {
    id: string;
    label: string;
    idbank: string;
    weight: number;
    baseValue: number;
    currentValue: number | null; // null = not yet known, needs manual input
    enteredByUser: boolean;
    isProvisional: boolean;
  }[];
};

export type PendingRegularizationItem = {
  id: string;
  period: string;
  deltaAmountHtCents: number; // can be negative
  sourceSituationNumero: number;
  sourceSituationPeriodLabel: string;
  componentLabel: string;
  definitiveIndexValue: number;
  provisionalIndexValue: number;
};

// ─── Internal types ───────────────────────────────────────────────────────────

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
  currentRevisionAmountHtCents: number;
  currentDocumentName: string | null;
  status: string;
  moeAdjustedAmountHtCents: number | null;
  moeAdjustedRevisionAmountHtCents: number | null;
  revisionPrixActive: boolean;
  forecastEntries: ForecastEntry[];
  forecastWaived: boolean;
  marcheTotalCents: number;
  previousCumulativeCents: number;
  previousRevisionCumulativeCents: number;
  ftmBillings: FtmBillingLine[];
  acceptedFtms: AcceptedFtm[];
  usedPeriods: string[];
  revisionIndexState: RevisionIndexState | null;
  pendingRegularizations: PendingRegularizationItem[];
};

// ─── Client-side revision preview ────────────────────────────────────────────

function computeRevisionPreview(
  basePeriodCents: number,
  b: number,
  components: { weight: number; baseValue: number; currentValue: number | null }[]
): number | null {
  if (components.some((c) => c.currentValue === null)) return null;
  const variableFactor = components.reduce(
    (sum, c) => sum + c.weight * ((c.currentValue! - c.baseValue) / c.baseValue),
    0
  );
  return Math.round(basePeriodCents * b * variableFactor);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function UpdateDraftForm({
  projectId,
  situationId,
  orgId,
  currentPeriodLabel,
  currentAmountHtCents,
  currentRevisionAmountHtCents,
  currentDocumentName,
  status,
  moeAdjustedAmountHtCents,
  moeAdjustedRevisionAmountHtCents,
  revisionPrixActive,
  forecastEntries,
  forecastWaived,
  marcheTotalCents,
  previousCumulativeCents,
  previousRevisionCumulativeCents,
  ftmBillings,
  acceptedFtms,
  usedPeriods,
  revisionIndexState,
  pendingRegularizations,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingAction, setPendingAction] = useState<"save" | "submit" | "regularize" | null>(null);
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

  // Period
  const [periodLabel, setPeriodLabel] = useState(currentPeriodLabel);
  const periodAlreadyUsed = !isCorrection && usedPeriods.includes(periodLabel);

  // Manual index values for components not fetched from INSEE (componentId → string input)
  const [manualIndexValues, setManualIndexValues] = useState<Record<string, string>>(() => {
    if (!revisionIndexState) return {};
    return Object.fromEntries(
      revisionIndexState.components
        .filter((c) => c.currentValue !== null && c.enteredByUser)
        .map((c) => [c.id, c.currentValue!.toString()])
    );
  });

  // Pending regularizations selection
  const [selectedRegIds, setSelectedRegIds] = useState<Set<string>>(new Set());
  const toggleReg = (id: string) =>
    setSelectedRegIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Derive effective component values (stored + manual overrides)
  const resolvedComponents = revisionIndexState?.components.map((c) => ({
    ...c,
    currentValue:
      manualIndexValues[c.id] !== undefined && manualIndexValues[c.id] !== ""
        ? parseFloat(manualIndexValues[c.id].replace(",", ".")) || null
        : c.currentValue,
  })) ?? [];

  const missingComponents = resolvedComponents.filter((c) => c.currentValue === null);

  // Period amounts from stored cumulatives
  const prevBaseCumulativeCents = previousCumulativeCents - previousRevisionCumulativeCents;
  const currentBasePeriodCents = Math.max(
    0,
    currentAmountHtCents - prevBaseCumulativeCents
  );

  // Main base amount input
  const [baseStr, setBaseStr] = useState(Math.max(0, currentBasePeriodCents / 100).toFixed(2));
  const [proposeBaseStr, setProposeBaseStr] = useState(Math.max(0, currentBasePeriodCents / 100).toFixed(2));

  // Compute revision preview from client-side formula
  function getBasePeriodFromStr(str: string): number {
    return Math.round(parseFloat(str.replace(",", ".") || "0") * 100);
  }

  const normalBasePeriodCents = getBasePeriodFromStr(baseStr);
  const proposeBasePeriodCents = getBasePeriodFromStr(proposeBaseStr);

  const revisionPreview = revisionIndexState
    ? computeRevisionPreview(
        normalBasePeriodCents,
        revisionIndexState.variablePart,
        resolvedComponents
      )
    : null;

  const proposeRevisionPreview = revisionIndexState
    ? computeRevisionPreview(
        proposeBasePeriodCents,
        revisionIndexState.variablePart,
        resolvedComponents
      )
    : null;

  // Cumulative totals
  const normalBaseCumul = prevBaseCumulativeCents + normalBasePeriodCents;
  const normalRevCumul =
    previousRevisionCumulativeCents + (revisionPrixActive && revisionPreview !== null ? revisionPreview : 0);
  const normalTotalCumul = normalBaseCumul + normalRevCumul;

  const proposeBaseCumul = prevBaseCumulativeCents + proposeBasePeriodCents;
  const proposeRevCumul =
    previousRevisionCumulativeCents + (revisionPrixActive && proposeRevisionPreview !== null ? proposeRevisionPreview : 0);
  const proposeTotalCumul = proposeBaseCumul + proposeRevCumul;

  const effectiveCents = hasMoeAmount
    ? correctionChoice === "accept"
      ? moeAdjustedAmountHtCents!
      : proposeTotalCumul
    : normalTotalCumul;

  const activeFtmCents = ftmBillings
    .filter((b) => b.status !== "MOE_REFUSED" && b.status !== "MOA_REFUSED")
    .reduce((sum, b) => sum + b.billedAmountCents, 0);

  const effectiveBaseCumul = hasMoeAmount
    ? correctionChoice === "accept"
      ? (moeAdjustedAmountHtCents ?? 0) -
        (moeAdjustedRevisionAmountHtCents ?? previousRevisionCumulativeCents)
      : proposeBaseCumul
    : normalBaseCumul;

  const periodBaseCents = Math.max(0, effectiveBaseCumul - prevBaseCumulativeCents);
  const periodRevisionCents = Math.max(
    0,
    effectiveCents - effectiveBaseCumul - previousRevisionCumulativeCents
  );
  const periodTotalCents = periodBaseCents + periodRevisionCents + activeFtmCents;
  const thisPeriodCents = periodTotalCents;

  const hasForecast = forecastEntries.length > 0;
  const showPanel = hasForecast || forecastWaived;

  // Pending regularization total for selected items
  const selectedRegTotal = pendingRegularizations
    .filter((r) => selectedRegIds.has(r.id))
    .reduce((sum, r) => sum + r.deltaAmountHtCents, 0);

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
        await upsertSituationFtmBillingAction({
          situationId,
          projectId,
          ftmRecordId: selectedFtmId,
          percentage: pct,
        });
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

  function buildIndexValues(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, raw] of Object.entries(manualIndexValues)) {
      const v = parseFloat(raw.replace(",", "."));
      if (!isNaN(v) && v > 0) out[id] = v;
    }
    return out;
  }

  function getAmountCents(): { baseCumul: number; correctionComment: string | null } {
    if (hasMoeAmount && correctionChoice === "accept") {
      const revCumul =
        moeAdjustedRevisionAmountHtCents ??
        (previousRevisionCumulativeCents + (revisionPreview ?? 0));
      return { baseCumul: moeAdjustedAmountHtCents! - revCumul, correctionComment: null };
    }
    return {
      baseCumul: hasMoeAmount ? proposeBaseCumul : normalBaseCumul,
      correctionComment: null,
    };
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (revisionPrixActive && revisionIndexState && missingComponents.length > 0) {
      setError(
        `Veuillez saisir les valeurs d'indice manquantes : ${missingComponents.map((c) => c.label).join(", ")}`
      );
      return;
    }

    const fd = new FormData(e.currentTarget);
    const { baseCumul } = getAmountCents();
    const correctionComment =
      hasMoeAmount && correctionChoice === "propose"
        ? (fd.get("correctionComment") as string | null)?.trim() ?? null
        : null;

    if (hasMoeAmount && correctionChoice === "propose" && !correctionComment) {
      setError("Un commentaire est obligatoire lorsque vous proposez un montant différent.");
      return;
    }
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
          periodYearMonth: isCorrection ? currentPeriodLabel : periodLabel,
          cumulativeAmountHtCents: baseCumul,
          indexValues: buildIndexValues(),
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

    if (revisionPrixActive && revisionIndexState && missingComponents.length > 0) {
      setError(
        `Veuillez saisir les valeurs d'indice manquantes : ${missingComponents.map((c) => c.label).join(", ")}`
      );
      return;
    }

    if (isCorrection && !selectedFile) {
      setError("Vous devez joindre un nouveau document pour la resoumission après correction.");
      return;
    }

    const { baseCumul } = getAmountCents();
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
        const { url, name } = await resolveDocument();
        await updateSituationDraftAction({
          situationId,
          projectId,
          periodLabel: isCorrection ? currentPeriodLabel : periodLabel,
          periodYearMonth: isCorrection ? currentPeriodLabel : periodLabel,
          cumulativeAmountHtCents: baseCumul,
          indexValues: buildIndexValues(),
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

  async function handleApplyRegularizations() {
    if (selectedRegIds.size === 0) return;
    setPendingAction("regularize");
    startTransition(async () => {
      try {
        await applyRegularizationsToSituationAction({
          situationId,
          projectId,
          regularizationIds: Array.from(selectedRegIds),
        });
        setSelectedRegIds(new Set());
        setSuccess("Régularisations appliquées à cette situation.");
        router.refresh();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erreur inconnue.");
      } finally {
        setPendingAction(null);
      }
    });
  }

  const selectedFtm = acceptedFtms.find((f) => f.ftmId === selectedFtmId);
  const previewBilledCents = selectedFtm
    ? Math.floor((selectedFtm.quoteAmountCents * parseInt(ftmPercentage || "0", 10)) / 100)
    : 0;
  const alreadyAddedFtmIds = new Set(ftmBillings.map((b) => b.ftmRecordId));
  const availableFtms = acceptedFtms.filter((f) => !alreadyAddedFtmIds.has(f.ftmId));

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

      {/* ── Pending regularizations checklist ─────────────────────────── */}
      {pendingRegularizations.length > 0 && (
        <div className="rounded border border-indigo-200 bg-white dark:border-indigo-900/40 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-3 border-b border-indigo-100 px-3 py-2.5 dark:border-indigo-900/30">
            <div>
              <p className="text-xs font-semibold text-indigo-800 dark:text-indigo-300">
                Régularisations de révision de prix disponibles
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Des indices définitifs ont été publiés. Sélectionnez les rattrapages à inclure dans
                cette situation, ou laissez-les pour la suivante.
              </p>
            </div>
            <TrendingUp className="h-4 w-4 shrink-0 mt-0.5 text-indigo-400" />
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {pendingRegularizations.map((reg) => {
              const isSelected = selectedRegIds.has(reg.id);
              const isPositive = reg.deltaAmountHtCents >= 0;
              return (
                <label
                  key={reg.id}
                  className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleReg(reg.id)}
                    className="mt-0.5 shrink-0 rounded border-slate-300"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                      Situation N°{reg.sourceSituationNumero} — {formatPeriod(reg.sourceSituationPeriodLabel)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                      {reg.componentLabel} · {reg.period} · I provisoire :{" "}
                      <span className="font-mono">{reg.provisionalIndexValue.toFixed(2)}</span> →
                      I définitif :{" "}
                      <span className="font-mono">{reg.definitiveIndexValue.toFixed(2)}</span>
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-xs font-semibold tabular-nums ${
                      isPositive
                        ? "text-teal-700 dark:text-teal-400"
                        : "text-red-700 dark:text-red-400"
                    }`}
                  >
                    {isPositive ? "+" : ""}
                    {formatEur(reg.deltaAmountHtCents)}
                  </span>
                </label>
              );
            })}
          </div>

          {selectedRegIds.size > 0 && (
            <div className="flex items-center justify-between border-t border-indigo-100 px-3 py-2.5 dark:border-indigo-900/30">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Total sélectionné :{" "}
                <strong
                  className={
                    selectedRegTotal >= 0
                      ? "text-teal-700 dark:text-teal-400"
                      : "text-red-700 dark:text-red-400"
                  }
                >
                  {selectedRegTotal >= 0 ? "+" : ""}
                  {formatEur(selectedRegTotal)}
                </strong>
              </p>
              <button
                type="button"
                disabled={isPending}
                onClick={handleApplyRegularizations}
                className="inline-flex items-center gap-1.5 rounded bg-indigo-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-600 disabled:opacity-50"
              >
                {pendingAction === "regularize" && <Loader2 className="h-3 w-3 animate-spin" />}
                Appliquer la sélection
              </button>
            </div>
          )}
        </div>
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

          {/* Period */}
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

          {/* Amount inputs — normal mode */}
          {!hasMoeAmount && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Travaux de la période — Base HT{" "}
                  <span className="text-red-500">*</span>
                  <span className="ml-1 font-normal text-slate-400">
                    (hors révision de prix et FTMs)
                  </span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    required
                    min="0"
                    step="0.01"
                    value={baseStr}
                    onChange={(e) => setBaseStr(e.target.value)}
                    className="w-full rounded border border-slate-200 bg-white px-3 py-1.5 pr-8 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
                    €
                  </span>
                </div>
              </div>

              {/* Revision panel — system-computed */}
              {revisionPrixActive && revisionIndexState && (
                <RevisionPanel
                  state={revisionIndexState}
                  basePeriodCents={normalBasePeriodCents}
                  resolvedComponents={resolvedComponents}
                  revisionPreview={revisionPreview}
                  manualIndexValues={manualIndexValues}
                  onManualValueChange={(id, val) =>
                    setManualIndexValues((prev) => ({ ...prev, [id]: val }))
                  }
                />
              )}

              {/* Period summary */}
              {(periodBaseCents > 0 || periodRevisionCents > 0 || activeFtmCents > 0) && (
                <PeriodSummary
                  periodBaseCents={periodBaseCents}
                  periodRevisionCents={periodRevisionCents}
                  activeFtmCents={activeFtmCents}
                  periodTotalCents={periodTotalCents}
                />
              )}
            </div>
          )}

          {/* MOE correction amount */}
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
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Travaux de la période — Base HT <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        required
                        min="0"
                        step="0.01"
                        value={proposeBaseStr}
                        onChange={(e) => setProposeBaseStr(e.target.value)}
                        className="w-full rounded border border-slate-200 bg-white px-3 py-1.5 pr-8 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
                        €
                      </span>
                    </div>
                  </div>
                  {revisionPrixActive && revisionIndexState && (
                    <RevisionPanel
                      state={revisionIndexState}
                      basePeriodCents={proposeBasePeriodCents}
                      resolvedComponents={resolvedComponents}
                      revisionPreview={proposeRevisionPreview}
                      manualIndexValues={manualIndexValues}
                      onManualValueChange={(id, val) =>
                        setManualIndexValues((prev) => ({ ...prev, [id]: val }))
                      }
                    />
                  )}
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
              thisPeriodCents={periodBaseCents}
            />
          )}

          {/* File attachment */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {isCorrection ? (
                <>Joindre le document corrigé <span className="text-red-500">*</span></>
              ) : currentDocumentName ? (
                "Remplacer le document"
              ) : (
                "Joindre un document"
              )}
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
                <span>
                  {isCorrection
                    ? "Choisir le document corrigé"
                    : currentDocumentName
                    ? "Choisir un autre fichier"
                    : "Joindre un fichier"}
                </span>
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
            <FtmBillingSection
              ftmBillings={ftmBillings}
              availableFtms={availableFtms}
              addingFtm={addingFtm}
              selectedFtmId={selectedFtmId}
              ftmPercentage={ftmPercentage}
              previewBilledCents={previewBilledCents}
              selectedFtm={selectedFtm}
              ftmError={ftmError}
              ftmPending={ftmPending}
              onToggleAdd={() => {
                setAddingFtm(true);
                setSelectedFtmId(availableFtms[0]?.ftmId ?? "");
              }}
              onSelectFtm={setSelectedFtmId}
              onSetPercentage={setFtmPercentage}
              onAdd={handleAddFtm}
              onCancelAdd={() => {
                setAddingFtm(false);
                setFtmError(null);
              }}
              onRemove={handleRemoveFtm}
            />
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
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
                const form = (e.currentTarget as HTMLButtonElement).closest(
                  "form"
                ) as HTMLFormElement;
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
            thisPeriodCents={periodBaseCents}
          />
        )}
      </div>
    </div>
  );
}

// ─── RevisionPanel ────────────────────────────────────────────────────────────

function RevisionPanel({
  state,
  basePeriodCents,
  resolvedComponents,
  revisionPreview,
  manualIndexValues,
  onManualValueChange,
}: {
  state: RevisionIndexState;
  basePeriodCents: number;
  resolvedComponents: (RevisionIndexState["components"][number] & { currentValue: number | null })[];
  revisionPreview: number | null;
  manualIndexValues: Record<string, string>;
  onManualValueChange: (id: string, val: string) => void;
}) {
  const hasManualInputs = resolvedComponents.some((c) => c.currentValue === null || c.enteredByUser);
  const allResolved = resolvedComponents.every((c) => c.currentValue !== null);

  return (
    <div className="rounded border border-indigo-200 bg-indigo-50/60 dark:border-indigo-900/40 dark:bg-indigo-950/20">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-indigo-100 px-3 py-2 dark:border-indigo-900/30">
        <p className="text-xs font-semibold text-indigo-800 dark:text-indigo-300">
          Révision de prix — Calculée automatiquement
        </p>
        <p className="text-xs font-mono text-indigo-600 dark:text-indigo-400">
          P = P₀ × ({state.fixedPart.toFixed(2)} + {state.variablePart.toFixed(2)} × Σ wᵢ × Iₙᵢ/I₀ᵢ)
        </p>
      </div>

      {/* Components table */}
      <div className="divide-y divide-indigo-100 dark:divide-indigo-900/30">
        {resolvedComponents.map((comp) => {
          const needsManualInput = comp.currentValue === null;
          const manualVal = manualIndexValues[comp.id] ?? "";
          const contribution =
            comp.currentValue !== null
              ? Math.round(basePeriodCents * state.variablePart * comp.weight *
                  ((comp.currentValue - comp.baseValue) / comp.baseValue))
              : null;

          return (
            <div key={comp.id} className="px-3 py-2 space-y-1.5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {/* Label + weight */}
                <div className="flex items-center gap-2 min-w-[180px]">
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                    {comp.label}
                  </span>
                  <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400">
                    w = {(comp.weight * 100).toFixed(0)} %
                  </span>
                </div>

                {/* I₀ */}
                <div className="flex items-center gap-1 text-[11px] text-slate-500">
                  <span>I₀ =</span>
                  <span className="font-mono font-medium text-slate-700 dark:text-slate-300">
                    {comp.baseValue.toFixed(2)}
                  </span>
                </div>

                {/* Iₙ — auto or manual */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-500">Iₙ =</span>
                  {needsManualInput ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="Saisir"
                        value={manualVal}
                        onChange={(e) => onManualValueChange(comp.id, e.target.value)}
                        className="w-24 rounded border border-amber-300 bg-white px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-amber-700 dark:bg-slate-800 dark:text-slate-100"
                      />
                      <span className="text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        Non disponible INSEE
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-medium text-slate-700 dark:text-slate-300 text-xs">
                        {comp.currentValue!.toFixed(2)}
                      </span>
                      {comp.isProvisional && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                          Provisoire
                        </span>
                      )}
                      {!comp.isProvisional && (
                        <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[11px] text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">
                          Définitif
                        </span>
                      )}
                      {comp.enteredByUser && (
                        <span className="text-[11px] text-slate-400">(saisi manuellement)</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Contribution */}
                {contribution !== null && (
                  <div className="ml-auto text-[11px] text-slate-500">
                    Contribution :{" "}
                    <span
                      className={`font-medium tabular-nums ${
                        contribution >= 0
                          ? "text-teal-700 dark:text-teal-400"
                          : "text-red-700 dark:text-red-400"
                      }`}
                    >
                      {contribution >= 0 ? "+" : ""}
                      {(contribution / 100).toLocaleString("fr-FR", {
                        style: "currency",
                        currency: "EUR",
                      })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Total revision */}
      <div className="border-t border-indigo-200 px-3 py-2.5 dark:border-indigo-900/40">
        {allResolved && revisionPreview !== null ? (
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Révision calculée pour cette période
            </p>
            <p
              className={`text-sm font-semibold tabular-nums ${
                revisionPreview >= 0
                  ? "text-teal-700 dark:text-teal-400"
                  : "text-red-700 dark:text-red-400"
              }`}
            >
              {revisionPreview >= 0 ? "+" : ""}
              {(revisionPreview / 100).toLocaleString("fr-FR", {
                style: "currency",
                currency: "EUR",
              })}
            </p>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Saisissez les valeurs manquantes pour calculer la révision.
          </p>
        )}
        {allResolved && revisionPreview !== null && (
          <p className="mt-0.5 text-[11px] text-slate-400">
            Valeur exacte calculée par le serveur au moment de l&apos;enregistrement.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── PeriodSummary ────────────────────────────────────────────────────────────

function PeriodSummary({
  periodBaseCents,
  periodRevisionCents,
  activeFtmCents,
  periodTotalCents,
}: {
  periodBaseCents: number;
  periodRevisionCents: number;
  activeFtmCents: number;
  periodTotalCents: number;
}) {
  return (
    <div className="space-y-0.5 rounded border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-500 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
      <div>
        Base :{" "}
        <strong className="text-slate-700 dark:text-slate-300">
          {formatEur(periodBaseCents)}
        </strong>
      </div>
      {periodRevisionCents > 0 && (
        <div>
          Révision :{" "}
          <strong className="text-teal-700 dark:text-teal-400">
            +{formatEur(periodRevisionCents)}
          </strong>
        </div>
      )}
      {activeFtmCents > 0 && (
        <div>
          FTMs :{" "}
          <strong className="text-slate-700 dark:text-slate-300">
            {formatEur(activeFtmCents)}
          </strong>
        </div>
      )}
      <div className="border-t border-slate-100 pt-0.5 dark:border-slate-700">
        Total à valider :{" "}
        <strong className="text-slate-900 dark:text-slate-100">
          {formatEur(periodTotalCents)}
        </strong>
      </div>
    </div>
  );
}

// ─── FtmBillingSection ────────────────────────────────────────────────────────

function FtmBillingSection({
  ftmBillings,
  availableFtms,
  addingFtm,
  selectedFtmId,
  ftmPercentage,
  previewBilledCents,
  selectedFtm,
  ftmError,
  ftmPending,
  onToggleAdd,
  onSelectFtm,
  onSetPercentage,
  onAdd,
  onCancelAdd,
  onRemove,
}: {
  ftmBillings: FtmBillingLine[];
  availableFtms: AcceptedFtm[];
  addingFtm: boolean;
  selectedFtmId: string;
  ftmPercentage: string;
  previewBilledCents: number;
  selectedFtm: AcceptedFtm | undefined;
  ftmError: string | null;
  ftmPending: boolean;
  onToggleAdd: () => void;
  onSelectFtm: (id: string) => void;
  onSetPercentage: (v: string) => void;
  onAdd: () => void;
  onCancelAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
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
              b.status === "MOE_CORRECTION_NEEDED" ? "Correction MOE" :
              "Correction MOA";
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
                  <span
                    className={`shrink-0 font-medium ${lineRefused ? "line-through text-red-500" : "text-slate-700 dark:text-slate-300"}`}
                  >
                    {formatEur(b.billedAmountCents)}
                  </span>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] ${statusClass}`}>
                    {statusLabel}
                  </span>
                  {canRemove && (
                    <button
                      type="button"
                      disabled={ftmPending}
                      onClick={() => onRemove(b.id)}
                      className="shrink-0 rounded p-0.5 text-red-400 hover:text-red-600 disabled:opacity-50"
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
          onClick={onToggleAdd}
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
                onChange={(e) => onSelectFtm(e.target.value)}
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
                  onChange={(e) => onSetPercentage(e.target.value)}
                  className="w-full rounded border border-slate-200 bg-white px-2 py-1.5 pr-6 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
                  %
                </span>
              </div>
            </div>
          </div>
          {selectedFtm && ftmPercentage && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Montant facturé :{" "}
              <strong className="text-slate-700 dark:text-slate-200">
                {formatEur(previewBilledCents)}
              </strong>{" "}
              sur{" "}
              <strong>{formatEur(selectedFtm.quoteAmountCents)}</strong>
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={ftmPending}
              onClick={onAdd}
              className="inline-flex items-center gap-1 rounded bg-slate-800 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700 disabled:opacity-50"
            >
              {ftmPending && <Loader2 className="h-3 w-3 animate-spin" />}
              Ajouter
            </button>
            <button
              type="button"
              onClick={onCancelAdd}
              className="rounded px-2.5 py-1 text-xs text-slate-500 hover:text-slate-700"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
