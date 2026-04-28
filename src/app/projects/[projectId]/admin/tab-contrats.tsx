"use client";

import { useState, useTransition } from "react";
import { upsertCompanyContractSettingsAction } from "@/server/situations/contract-settings-actions";
import {
  upsertRevisionIndexConfigAction,
  fetchBaseIndexAction,
  deleteRevisionIndexConfigAction,
} from "@/server/revision/revision-config-actions";
import { Loader2, Plus, Trash2, RefreshCw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";

// ─── Types ───────────────────────────────────────────────────────────────────

type ContractSettings = {
  retenueGarantieActive: boolean;
  retenueGarantiePercent: number | null;
  avanceTravauxAmountCents: number | null;
  avanceTravauxRefundStartMonth: number | null;
  avanceTravauxRefundStartPercent: number | null;
  avanceTravauxRefundInstallments: number | null;
  revisionPrixActive: boolean;
};

type RevisionComponent = {
  id?: string; // undefined = new (not yet saved)
  idbank: string;
  label: string;
  weight: string; // string for controlled input
  baseValue: string; // string for controlled input; "" = not yet fetched/entered
  fetchStatus: "idle" | "fetching" | "found" | "not-found";
};

type RevisionConfig = {
  moisZero: string;
  fixedPart: number;
  variablePart: number;
  components: { id: string; idbank: string; label: string; weight: number; baseValue: number }[];
} | null;

type OrgWithSettings = {
  id: string;
  name: string;
  settings: ContractSettings | null;
  revisionConfig: RevisionConfig;
};

// ─── Root component ──────────────────────────────────────────────────────────

export function TabContrats({
  projectId,
  enterprises,
}: {
  projectId: string;
  enterprises: OrgWithSettings[];
}) {
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(
    enterprises[0]?.id ?? null
  );

  const org = enterprises.find((e) => e.id === selectedOrgId) ?? null;

  if (enterprises.length === 0) {
    return (
      <div className="rounded border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
        Aucune entreprise n&apos;est associée à ce projet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Configurez les paramètres contractuels financiers par entreprise. Les pénalités sont gérées
        dans le module dédié.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {enterprises.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => setSelectedOrgId(e.id)}
            className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
              selectedOrgId === e.id
                ? "bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {e.name}
          </button>
        ))}
      </div>

      {org && (
        <div className="space-y-4">
          <ContractForm
            key={`contract-${org.id}`}
            projectId={projectId}
            organizationId={org.id}
            organizationName={org.name}
            initialSettings={org.settings}
          />
          {org.settings?.revisionPrixActive && (
            <RevisionIndexConfigPanel
              key={`revision-${org.id}`}
              projectId={projectId}
              organizationId={org.id}
              organizationName={org.name}
              initialConfig={org.revisionConfig}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ─── ContractForm (unchanged structure) ──────────────────────────────────────

function ContractForm({
  projectId,
  organizationId,
  organizationName,
  initialSettings,
}: {
  projectId: string;
  organizationId: string;
  organizationName: string;
  initialSettings: ContractSettings | null;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const s = initialSettings;
  const [retenueActive, setRetenueActive] = useState(s?.retenueGarantieActive ?? false);
  const [retenuePercent, setRetenuePercent] = useState(s?.retenueGarantiePercent?.toString() ?? "5");
  const [avanceAmount, setAvanceAmount] = useState(
    s?.avanceTravauxAmountCents !== null && s?.avanceTravauxAmountCents !== undefined
      ? (s.avanceTravauxAmountCents / 100).toFixed(2)
      : ""
  );
  const [refundTrigger, setRefundTrigger] = useState<"month" | "percent">(
    s?.avanceTravauxRefundStartPercent !== null ? "percent" : "month"
  );
  const [refundStartMonth, setRefundStartMonth] = useState(
    s?.avanceTravauxRefundStartMonth?.toString() ?? ""
  );
  const [refundStartPercent, setRefundStartPercent] = useState(
    s?.avanceTravauxRefundStartPercent?.toString() ?? ""
  );
  const [refundInstallments, setRefundInstallments] = useState(
    s?.avanceTravauxRefundInstallments?.toString() ?? ""
  );
  const [revisionPrixActive, setRevisionPrixActive] = useState(s?.revisionPrixActive ?? false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const avanceAmountCents = avanceAmount
      ? Math.round(parseFloat(avanceAmount.replace(",", ".")) * 100)
      : null;
    startTransition(async () => {
      try {
        await upsertCompanyContractSettingsAction({
          projectId,
          organizationId,
          retenueGarantieActive: retenueActive,
          retenueGarantiePercent: retenueActive && retenuePercent ? parseFloat(retenuePercent) : null,
          avanceTravauxAmountCents: avanceAmountCents,
          avanceTravauxRefundStartMonth:
            avanceAmountCents && refundTrigger === "month" && refundStartMonth
              ? parseInt(refundStartMonth, 10)
              : null,
          avanceTravauxRefundStartPercent:
            avanceAmountCents && refundTrigger === "percent" && refundStartPercent
              ? parseFloat(refundStartPercent)
              : null,
          avanceTravauxRefundInstallments:
            avanceAmountCents && refundInstallments ? parseInt(refundInstallments, 10) : null,
          revisionPrixActive,
        });
        setSuccess(true);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erreur inconnue.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Card className="p-4">
        <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
          {organizationName}
        </h3>

        {error && <Alert variant="error" className="mb-3">{error}</Alert>}
        {success && <Alert variant="success" className="mb-3">Paramètres enregistrés.</Alert>}

        <div className="space-y-5">
          {/* Retenue de garantie */}
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Retenue de garantie
            </h4>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={retenueActive}
                onChange={(e) => setRetenueActive(e.target.checked)}
                className="rounded border-slate-300"
              />
              Applicable sur ce contrat
            </label>
            {retenueActive && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={retenuePercent}
                  onChange={(e) => setRetenuePercent(e.target.value)}
                  className="w-24"
                />
                <span className="text-sm text-slate-500">% du montant de la période</span>
              </div>
            )}
          </section>

          {/* Avance travaux */}
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Avance travaux
            </h4>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Montant avance (€)"
                value={avanceAmount}
                onChange={(e) => setAvanceAmount(e.target.value)}
                className="w-48"
              />
              <span className="text-sm text-slate-500">€ HT (laisser vide si aucune)</span>
            </div>
            {avanceAmount && (
              <div className="space-y-2 border-l-2 border-slate-200 pl-4 dark:border-slate-700">
                <div className="flex flex-wrap gap-3">
                  <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      checked={refundTrigger === "month"}
                      onChange={() => setRefundTrigger("month")}
                    />
                    À partir de la situation n°
                  </label>
                  {refundTrigger === "month" && (
                    <Input
                      type="number"
                      min="1"
                      value={refundStartMonth}
                      onChange={(e) => setRefundStartMonth(e.target.value)}
                      className="w-24"
                    />
                  )}
                  <label className="flex cursor-pointer items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      checked={refundTrigger === "percent"}
                      onChange={() => setRefundTrigger("percent")}
                    />
                    À partir de
                  </label>
                  {refundTrigger === "percent" && (
                    <>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={refundStartPercent}
                        onChange={(e) => setRefundStartPercent(e.target.value)}
                        className="w-24"
                      />
                      <span className="text-sm text-slate-500">% d&apos;avancement</span>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-500">Remboursé en</span>
                  <Input
                    type="number"
                    min="1"
                    value={refundInstallments}
                    onChange={(e) => setRefundInstallments(e.target.value)}
                    className="w-24"
                  />
                  <span className="text-sm text-slate-500">versements égaux</span>
                </div>
              </div>
            )}
          </section>

          {/* Révision de prix toggle */}
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Révision de prix
            </h4>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={revisionPrixActive}
                onChange={(e) => setRevisionPrixActive(e.target.checked)}
                className="rounded border-slate-300"
              />
              Ce contrat est soumis à révision de prix (clause d&apos;indexation)
            </label>
            {revisionPrixActive && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Configurez les indices ci-dessous. La révision sera calculée automatiquement par le
                système à chaque situation de travaux.
              </p>
            )}
          </section>
        </div>

        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      </Card>
    </form>
  );
}

// ─── RevisionIndexConfigPanel ─────────────────────────────────────────────────

function emptyComponent(): RevisionComponent {
  return { idbank: "", label: "", weight: "", baseValue: "", fetchStatus: "idle" };
}

function RevisionIndexConfigPanel({
  projectId,
  organizationId,
  organizationName,
  initialConfig,
}: {
  projectId: string;
  organizationId: string;
  organizationName: string;
  initialConfig: RevisionConfig;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const ic = initialConfig;
  const [moisZero, setMoisZero] = useState(ic?.moisZero ?? "");
  const [fixedPart, setFixedPart] = useState(ic?.fixedPart.toString() ?? "0.15");
  const [variablePart, setVariablePart] = useState(ic?.variablePart.toString() ?? "0.85");
  const [components, setComponents] = useState<RevisionComponent[]>(
    ic?.components.map((c) => ({
      id: c.id,
      idbank: c.idbank,
      label: c.label,
      weight: c.weight.toString(),
      baseValue: c.baseValue.toString(),
      fetchStatus: "idle" as const,
    })) ?? [emptyComponent()]
  );

  const a = parseFloat(fixedPart) || 0;
  const b = parseFloat(variablePart) || 0;
  const weightSum = components.reduce((s, c) => s + (parseFloat(c.weight) || 0), 0);
  const weightError = components.length > 0 && Math.abs(weightSum - 1) > 0.001;
  const sumError = Math.abs(a + b - 1) > 0.001;

  function updateComponent(index: number, patch: Partial<RevisionComponent>) {
    setComponents((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function addComponent() {
    setComponents((prev) => [...prev, emptyComponent()]);
  }

  function removeComponent(index: number) {
    setComponents((prev) => prev.filter((_, i) => i !== index));
  }

  async function fetchIndex(index: number) {
    const comp = components[index];
    if (!comp.idbank || !moisZero) return;
    updateComponent(index, { fetchStatus: "fetching" });
    try {
      const result = await fetchBaseIndexAction({ idbank: comp.idbank, moisZero });
      if (result) {
        updateComponent(index, {
          baseValue: result.value.toString(),
          fetchStatus: "found",
        });
      } else {
        updateComponent(index, { fetchStatus: "not-found" });
      }
    } catch {
      updateComponent(index, { fetchStatus: "not-found" });
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      try {
        await upsertRevisionIndexConfigAction({
          projectId,
          organizationId,
          moisZero,
          fixedPart: parseFloat(fixedPart),
          variablePart: parseFloat(variablePart),
          components: components.map((c) => ({
            ...(c.id ? { id: c.id } : {}),
            idbank: c.idbank.trim(),
            label: c.label.trim(),
            weight: parseFloat(c.weight),
            baseValue: c.baseValue ? parseFloat(c.baseValue) : null,
          })),
        });
        setSuccess(true);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erreur inconnue.");
      }
    });
  }

  async function handleDelete() {
    if (!confirm(`Supprimer la configuration des indices pour ${organizationName} ?`)) return;
    startTransition(async () => {
      try {
        await deleteRevisionIndexConfigAction({ projectId, organizationId });
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erreur inconnue.");
      }
    });
  }

  return (
    <form onSubmit={handleSave}>
      <Card className="p-4 space-y-5 border-indigo-200 dark:border-indigo-900/40">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Configuration des indices — Révision de prix
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Les valeurs de base (I₀) sont récupérées automatiquement depuis l&apos;INSEE. La révision
              est calculée par le système à chaque soumission de situation.
            </p>
          </div>
          {ic && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isPending}
              className="shrink-0 rounded p-1 text-slate-400 hover:text-red-600 disabled:opacity-50"
              title="Supprimer la configuration"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>

        {error && <Alert variant="error">{error}</Alert>}
        {success && <Alert variant="success">Configuration enregistrée.</Alert>}

        {/* Formula parameters */}
        <section className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Paramètres de la formule
          </h4>

          {/* Mois zéro */}
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Mois de référence (M₀)
              </label>
              <input
                type="month"
                required
                value={moisZero}
                onChange={(e) => setMoisZero(e.target.value)}
                className="rounded border border-slate-200 bg-white px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <p className="mt-0.5 text-[11px] text-slate-400">
                Mois dont sont issus les indices de base (I₀)
              </p>
            </div>

            <div className="flex gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Partie fixe (a)
                </label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={fixedPart}
                    onChange={(e) => setFixedPart(e.target.value)}
                    className="w-24"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Partie variable (b)
                </label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={variablePart}
                    onChange={(e) => setVariablePart(e.target.value)}
                    className="w-24"
                  />
                </div>
              </div>
            </div>
          </div>

          {sumError && (
            <p className="text-[11px] text-red-600 dark:text-red-400">
              a + b doit être égal à 1 (actuellement : {(a + b).toFixed(3)})
            </p>
          )}

          {/* Formula preview */}
          {!sumError && moisZero && (
            <div className="rounded border border-indigo-100 bg-indigo-50 px-3 py-2 dark:border-indigo-900/30 dark:bg-indigo-950/20">
              <p className="text-xs font-mono text-indigo-800 dark:text-indigo-300">
                P = P₀ × ({a.toFixed(2)} + {b.toFixed(2)} × Σᵢ wᵢ × Iₙᵢ / I₀ᵢ)
              </p>
              <p className="mt-0.5 text-[11px] text-indigo-600 dark:text-indigo-400">
                P = montant révisé · P₀ = travaux de la période (hors FTMs) · I₀ = indice de{" "}
                {moisZero} · Iₙ = indice du mois de facturation
              </p>
            </div>
          )}
        </section>

        {/* Index components */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Indices composites
            </h4>
            {weightError && components.length > 0 && (
              <span className="text-[11px] text-red-600 dark:text-red-400">
                Σ des pondérations = {weightSum.toFixed(3)} (doit être = 1)
              </span>
            )}
          </div>

          <div className="rounded border border-slate-200 dark:border-slate-700 overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_1fr_80px_160px_36px] gap-0 border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/50">
              {["Idbank INSEE", "Libellé", "Poids (wᵢ)", "Valeur de base I₀", ""].map((h) => (
                <div key={h} className="px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                  {h}
                </div>
              ))}
            </div>

            {/* Rows */}
            {components.map((comp, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_1fr_80px_160px_36px] gap-0 items-center border-b border-slate-100 last:border-0 dark:border-slate-800"
              >
                {/* idbank */}
                <div className="px-2 py-1.5">
                  <input
                    type="text"
                    required
                    placeholder="ex. 010537309"
                    value={comp.idbank}
                    onChange={(e) => updateComponent(i, { idbank: e.target.value, fetchStatus: "idle" })}
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 font-mono"
                  />
                </div>

                {/* label */}
                <div className="px-2 py-1.5">
                  <input
                    type="text"
                    required
                    placeholder="ex. BT40 – Maçonnerie"
                    value={comp.label}
                    onChange={(e) => updateComponent(i, { label: e.target.value })}
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                {/* weight */}
                <div className="px-2 py-1.5">
                  <input
                    type="number"
                    required
                    min="0.01"
                    max="1"
                    step="0.01"
                    placeholder="0.60"
                    value={comp.weight}
                    onChange={(e) => updateComponent(i, { weight: e.target.value })}
                    className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>

                {/* baseValue + fetch button */}
                <div className="px-2 py-1.5 flex items-center gap-1.5">
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    placeholder="Auto-récupéré"
                    value={comp.baseValue}
                    onChange={(e) => updateComponent(i, { baseValue: e.target.value, fetchStatus: "idle" })}
                    className={`w-full rounded border px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 dark:bg-slate-800 dark:text-slate-100 ${
                      comp.fetchStatus === "found"
                        ? "border-teal-300 bg-teal-50 dark:border-teal-700 dark:bg-teal-950/20"
                        : comp.fetchStatus === "not-found"
                        ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/20"
                        : "border-slate-200 bg-white dark:border-slate-700"
                    }`}
                  />
                  <button
                    type="button"
                    title={moisZero ? "Récupérer la valeur depuis l'INSEE" : "Sélectionnez d'abord le mois de référence"}
                    disabled={!moisZero || !comp.idbank || comp.fetchStatus === "fetching"}
                    onClick={() => fetchIndex(i)}
                    className="shrink-0 rounded border border-slate-200 bg-white p-1 text-slate-500 hover:text-indigo-600 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:text-indigo-400"
                  >
                    {comp.fetchStatus === "fetching" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>

                {/* Remove */}
                <div className="flex items-center justify-center py-1.5">
                  {components.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeComponent(i)}
                      className="rounded p-1 text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Status feedback per row */}
          {components.some((c) => c.fetchStatus === "not-found") && (
            <p className="flex items-center gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
              <Info className="h-3.5 w-3.5 shrink-0" />
              Certains indices n&apos;ont pas été trouvés pour ce mois. L&apos;INSEE publie les indices avec 2 à 3 mois
              de décalage — vérifiez l&apos;idbank ou saisissez la valeur manuellement.
            </p>
          )}

          <button
            type="button"
            onClick={addComponent}
            className="flex items-center gap-1.5 rounded border border-dashed border-slate-300 px-3 py-1.5 text-xs text-slate-500 hover:border-indigo-400 hover:text-indigo-600 dark:border-slate-700 dark:hover:border-indigo-500 dark:hover:text-indigo-400"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter un indice
          </button>
        </section>

        <div className="flex justify-end border-t border-slate-100 pt-4 dark:border-slate-800">
          <Button type="submit" disabled={isPending || weightError || sumError}>
            {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {isPending ? "Enregistrement…" : "Enregistrer les indices"}
          </Button>
        </div>
      </Card>
    </form>
  );
}
