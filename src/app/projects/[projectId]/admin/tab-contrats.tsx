"use client";

import { useState, useTransition } from "react";
import { upsertCompanyContractSettingsAction } from "@/server/situations/contract-settings-actions";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";

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
    enterprises[0]?.id ?? null,
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
        Configurez les paramètres contractuels financiers par entreprise (retenue de garantie,
        avance travaux, pénalités).
      </p>

      {/* Org selector */}
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
  const [retenuePercent, setRetenuePercent] = useState(
    s?.retenueGarantiePercent?.toString() ?? "5",
  );
  const [avanceAmount, setAvanceAmount] = useState(
    s?.avanceTravauxAmountCents !== null && s?.avanceTravauxAmountCents !== undefined
      ? (s.avanceTravauxAmountCents / 100).toFixed(2)
      : "",
  );
  const [refundTrigger, setRefundTrigger] = useState<"month" | "percent">(
    s?.avanceTravauxRefundStartPercent !== null ? "percent" : "month",
  );
  const [refundStartMonth, setRefundStartMonth] = useState(
    s?.avanceTravauxRefundStartMonth?.toString() ?? "",
  );
  const [refundStartPercent, setRefundStartPercent] = useState(
    s?.avanceTravauxRefundStartPercent?.toString() ?? "",
  );
  const [refundInstallments, setRefundInstallments] = useState(
    s?.avanceTravauxRefundInstallments?.toString() ?? "",
  );
  const [penaltyType, setPenaltyType] = useState<"NONE" | "FREE_AMOUNT" | "DAILY_RATE">(
    s?.penaltyType ?? "NONE",
  );
  const [dailyRate, setDailyRate] = useState(
    s?.penaltyDailyRateCents !== null && s?.penaltyDailyRateCents !== undefined
      ? (s.penaltyDailyRateCents / 100).toFixed(2)
      : "",
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    const avanceAmountCents = avanceAmount
      ? Math.round(parseFloat(avanceAmount.replace(",", ".")) * 100)
      : null;
    const dailyRateCents = dailyRate
      ? Math.round(parseFloat(dailyRate.replace(",", ".")) * 100)
      : null;

    startTransition(async () => {
      try {
        await upsertCompanyContractSettingsAction({
          projectId,
          organizationId,
          retenueGarantieActive: retenueActive,
          retenueGarantiePercent:
            retenueActive && retenuePercent ? parseFloat(retenuePercent) : null,
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

          {/* Pénalités */}
          <section className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Pénalités
            </h4>
            <div className="flex flex-wrap gap-3">
              {(["NONE", "FREE_AMOUNT", "DAILY_RATE"] as const).map((t) => (
                <label key={t} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="radio"
                    checked={penaltyType === t}
                    onChange={() => setPenaltyType(t)}
                  />
                  {t === "NONE" && "Aucune"}
                  {t === "FREE_AMOUNT" && "Montant libre (saisi par MOE)"}
                  {t === "DAILY_RATE" && "Taux journalier"}
                </label>
              ))}
            </div>
            {penaltyType === "DAILY_RATE" && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Taux journalier (€/j)"
                  value={dailyRate}
                  onChange={(e) => setDailyRate(e.target.value)}
                  className="w-48"
                />
                <span className="text-sm text-slate-500">€ / jour de retard</span>
              </div>
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
