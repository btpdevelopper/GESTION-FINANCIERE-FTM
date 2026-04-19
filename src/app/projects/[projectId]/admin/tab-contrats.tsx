"use client";

import { useState, useTransition } from "react";
import { upsertCompanyContractSettingsAction } from "@/server/situations/contract-settings-actions";
import { Loader2 } from "lucide-react";

type ContractSettings = {
  retenueGarantieActive: boolean;
  retenueGarantiePercent: number | null;
  avanceTravauxAmountCents: number | null;
  avanceTravauxRefundStartMonth: number | null;
  avanceTravauxRefundStartPercent: number | null;
  avanceTravauxRefundInstallments: number | null;
  penaltyType: "NONE" | "FREE_AMOUNT" | "DAILY_RATE";
  penaltyDailyRateCents: number | null;
};

type OrgWithSettings = {
  id: string;
  name: string;
  settings: ContractSettings | null;
};

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
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
        Aucune entreprise n&apos;est associée à ce projet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Configurez les paramètres contractuels financiers par entreprise (retenue de garantie, avance travaux, pénalités).
        </p>
      </div>

      {/* Org selector */}
      <div className="flex flex-wrap gap-2">
        {enterprises.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => setSelectedOrgId(e.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              selectedOrgId === e.id
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {e.name}
          </button>
        ))}
      </div>

      {org && (
        <ContractForm
          key={org.id}
          projectId={projectId}
          organizationId={org.id}
          organizationName={org.name}
          initialSettings={org.settings}
        />
      )}
    </div>
  );
}

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
  const [refundStartMonth, setRefundStartMonth] = useState(s?.avanceTravauxRefundStartMonth?.toString() ?? "");
  const [refundStartPercent, setRefundStartPercent] = useState(s?.avanceTravauxRefundStartPercent?.toString() ?? "");
  const [refundInstallments, setRefundInstallments] = useState(s?.avanceTravauxRefundInstallments?.toString() ?? "");
  const [penaltyType, setPenaltyType] = useState<"NONE" | "FREE_AMOUNT" | "DAILY_RATE">(s?.penaltyType ?? "NONE");
  const [dailyRate, setDailyRate] = useState(
    s?.penaltyDailyRateCents !== null && s?.penaltyDailyRateCents !== undefined
      ? (s.penaltyDailyRateCents / 100).toFixed(2)
      : ""
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const avanceAmountCents = avanceAmount ? Math.round(parseFloat(avanceAmount.replace(",", ".")) * 100) : null;
    const dailyRateCents = dailyRate ? Math.round(parseFloat(dailyRate.replace(",", ".")) * 100) : null;

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
          penaltyType,
          penaltyDailyRateCents: penaltyType === "DAILY_RATE" ? dailyRateCents : null,
        });
        setSuccess(true);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Erreur inconnue.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <h3 className="font-semibold text-slate-900 dark:text-slate-100">{organizationName}</h3>

      {error && <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">{error}</p>}
      {success && <p className="rounded-lg bg-green-50 px-4 py-2.5 text-sm text-green-700">Paramètres enregistrés.</p>}

      {/* Retenue de garantie */}
      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Retenue de garantie</h4>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
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
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={retenuePercent}
              onChange={(e) => setRetenuePercent(e.target.value)}
              className="w-24 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <span className="text-sm text-slate-500">% du montant de la période</span>
          </div>
        )}
      </section>

      {/* Avance travaux */}
      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Avance travaux</h4>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="0"
            step="0.01"
            placeholder="Montant avance (€)"
            value={avanceAmount}
            onChange={(e) => setAvanceAmount(e.target.value)}
            className="w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
          <span className="text-sm text-slate-500">€ HT (laisser vide si aucune)</span>
        </div>

        {avanceAmount && (
          <div className="space-y-3 pl-4 border-l-2 border-slate-200 dark:border-slate-700">
            <div className="flex gap-3">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={refundTrigger === "month"}
                  onChange={() => setRefundTrigger("month")}
                  className="border-slate-300"
                />
                À partir de la situation n°
              </label>
              {refundTrigger === "month" && (
                <input
                  type="number"
                  min="1"
                  value={refundStartMonth}
                  onChange={(e) => setRefundStartMonth(e.target.value)}
                  className="w-20 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              )}
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  checked={refundTrigger === "percent"}
                  onChange={() => setRefundTrigger("percent")}
                  className="border-slate-300"
                />
                À partir de
              </label>
              {refundTrigger === "percent" && (
                <>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={refundStartPercent}
                    onChange={(e) => setRefundStartPercent(e.target.value)}
                    className="w-20 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <span className="text-sm text-slate-500">% d&apos;avancement</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-slate-500">Remboursé en</span>
              <input
                type="number"
                min="1"
                value={refundInstallments}
                onChange={(e) => setRefundInstallments(e.target.value)}
                className="w-20 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <span className="text-sm text-slate-500">versements égaux</span>
            </div>
          </div>
        )}
      </section>

      {/* Pénalités */}
      <section className="space-y-3">
        <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Pénalités</h4>
        <div className="flex flex-wrap gap-3">
          {(["NONE", "FREE_AMOUNT", "DAILY_RATE"] as const).map((t) => (
            <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                checked={penaltyType === t}
                onChange={() => setPenaltyType(t)}
                className="border-slate-300"
              />
              {t === "NONE" && "Aucune"}
              {t === "FREE_AMOUNT" && "Montant libre (saisi par MOE)"}
              {t === "DAILY_RATE" && "Taux journalier"}
            </label>
          ))}
        </div>
        {penaltyType === "DAILY_RATE" && (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Taux journalier (€/j)"
              value={dailyRate}
              onChange={(e) => setDailyRate(e.target.value)}
              className="w-48 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
            <span className="text-sm text-slate-500">€ / jour de retard</span>
          </div>
        )}
      </section>

      <button
        type="submit"
        disabled={isPending}
        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors"
      >
        {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
        {isPending ? "Enregistrement…" : "Enregistrer"}
      </button>
    </form>
  );
}
