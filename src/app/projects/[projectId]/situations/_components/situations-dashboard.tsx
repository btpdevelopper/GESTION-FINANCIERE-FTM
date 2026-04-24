"use client";

import { useState, useMemo, Fragment, useRef } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { ChevronDown, ChevronRight, Info } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";

// ── Types ─────────────────────────────────────────────────────────────────────

type SituationRow = {
  id: string;
  numero: number;
  periodLabel: string;
  status: string;
  cumulativeAmountHtCents: number;
  moeAdjustedAmountHtCents: number | null;
  acceptedCumulativeHtCents: number | null;
  periodNetBeforeDeductionsHtCents: number | null;
  retenueGarantieAmountCents: number | null;
  avanceTravauxRemboursementCents: number | null;
  penaltyAmountCents: number | null;
  netAmountHtCents: number | null;
};

type OrgRow = {
  org: { id: string; name: string };
  marcheBase: number;
  ftmValide: number;
  marcheActuel: number;
  cumulatifApprouve: number;
  totalNetPaye: number;
  situations: SituationRow[];
};

type Props = {
  data: OrgRow[];
  projectId: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const CHART_COLORS = ["#0d9488", "#0f766e", "#115e59", "#64748b", "#475569", "#334155"];

const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  SUBMITTED: "Soumis MOE",
  MOE_CORRECTION: "En correction",
  MOE_APPROVED: "Approuvé MOE",
  MOA_APPROVED: "Validé MOA",
  MOE_REFUSED: "Refusé MOE",
  MOA_REFUSED: "Refusé MOA",
};

function fmtEur(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}

function fmtPeriod(p: string): string {
  if (/^\d{4}-\d{2}$/.test(p)) {
    const [y, m] = p.split("-");
    const l = new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("fr-FR", {
      month: "short",
      year: "numeric",
    });
    return l.charAt(0).toUpperCase() + l.slice(1);
  }
  return p;
}

function dash(v: number | null): string {
  return v != null ? fmtEur(v) : "—";
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function SituationsDashboard({ data, projectId }: Props) {
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null);

  // ── KPI totals ──────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const marcheActuel = data.reduce((s, r) => s + r.marcheActuel, 0);
    const cumulatif = data.reduce((s, r) => s + r.cumulatifApprouve, 0);
    const netPaye = data.reduce((s, r) => s + r.totalNetPaye, 0);
    const avancement = marcheActuel > 0 ? (cumulatif / marcheActuel) * 100 : 0;
    return { marcheActuel, cumulatif, netPaye, avancement };
  }, [data]);

  // ── Chart 1: avancement % per org ──────────────────────────────────────────
  const avancementChartData = useMemo(
    () =>
      data.map((row) => ({
        name: row.org.name,
        pct: row.marcheActuel > 0 ? Math.min((row.cumulatifApprouve / row.marcheActuel) * 100, 200) : 0,
        rawPct: row.marcheActuel > 0 ? (row.cumulatifApprouve / row.marcheActuel) * 100 : 0,
        over: row.cumulatifApprouve > row.marcheActuel,
      })),
    [data]
  );

  // ── Chart 2: net payé par période (stacked by org) ─────────────────────────
  const { monthlyData, orgNames } = useMemo(() => {
    const periods = new Set<string>();
    const perOrgPerPeriod = new Map<string, Map<string, number>>();

    for (const row of data) {
      for (const s of row.situations) {
        if (s.status === "MOA_APPROVED" && s.netAmountHtCents != null) {
          periods.add(s.periodLabel);
          if (!perOrgPerPeriod.has(row.org.name)) perOrgPerPeriod.set(row.org.name, new Map());
          const m = perOrgPerPeriod.get(row.org.name)!;
          m.set(s.periodLabel, (m.get(s.periodLabel) ?? 0) + s.netAmountHtCents);
        }
      }
    }

    const sortedPeriods = [...periods].sort();
    const names = data.map((r) => r.org.name);

    const monthly = sortedPeriods.map((period) => {
      const entry: Record<string, string | number> = { period: fmtPeriod(period) };
      for (const name of names) {
        entry[name] = perOrgPerPeriod.get(name)?.get(period) ?? 0;
      }
      return entry;
    });

    return { monthlyData: monthly, orgNames: names };
  }, [data]);

  if (data.length === 0) return null;

  return (
    <div className="space-y-5">
      {/* ── KPI cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Marché actuel total"
          value={fmtEur(totals.marcheActuel)}
          tooltip="Somme des marchés actuels de toutes les entreprises. Le marché actuel = Marché de base + FTM validés (avenants). Il représente la valeur contractuelle totale du projet à date."
        />
        <KpiCard
          label="Cumulé approuvé"
          value={fmtEur(totals.cumulatif)}
          tooltip="Somme des montants cumulés approuvés (statut MOE_APPROVED ou supérieur) sur toutes les entreprises. Correspond au montant HT total reconnu par le MOE comme réalisé depuis le début du chantier."
        />
        <KpiCard
          label="Net total validé"
          value={fmtEur(totals.netPaye)}
          tooltip="Somme des montants nets payés sur les situations au statut MOA_APPROVED. Calculé après déduction de la retenue de garantie, du remboursement d'avance et des pénalités."
        />
        <KpiCard
          label="Avancement global"
          value={`${totals.avancement.toFixed(1)} %`}
          accent={totals.avancement >= 100 ? "red" : totals.avancement >= 75 ? "teal" : undefined}
          tooltip="Ratio : Cumulé approuvé ÷ Marché actuel total × 100. Indique le pourcentage du marché exécuté et reconnu par le MOE. Un dépassement de 100 % signale un hors-marché potentiel."
        />
      </div>

      {/* ── Charts ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Chart 1 — Avancement par entreprise */}
        <div className="rounded border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Avancement par entreprise
          </p>
          <div style={{ height: Math.max(avancementChartData.length * 44, 100) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={avancementChartData}
                layout="vertical"
                margin={{ top: 0, right: 40, bottom: 0, left: 0 }}
                barSize={16}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  tickFormatter={(v) => `${v}%`}
                  tick={{ fontSize: 10, fill: "#94a3b8" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={110}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                  axisLine={false}
                  tickLine={false}
                />
                <RechartsTooltip
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  formatter={(value: any, _: any, entry: any) => [
                    `${(entry.payload?.rawPct ?? Number(value)).toFixed(1)} %`,
                    "Avancement",
                  ]}
                  cursor={{ fill: "#f8fafc" }}
                />
                <Bar dataKey="pct" radius={[0, 3, 3, 0]}>
                  {avancementChartData.map((entry, i) => (
                    <Cell
                      key={`cell-${i}`}
                      fill={entry.over ? "#f87171" : "#0d9488"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2 — Net payé par période */}
        <div className="rounded border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Net validé par période
          </p>
          {monthlyData.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-xs italic text-slate-400">
              Aucune situation validée MOA.
            </div>
          ) : (
            <div style={{ height: Math.max(monthlyData.length * 30, 160) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyData} margin={{ top: 0, right: 10, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => fmtEur(v as number)}
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    width={80}
                  />
                  <RechartsTooltip
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    formatter={(v: any, name: any) => [fmtEur(Number(v)), name]}
                    cursor={{ fill: "#f8fafc" }}
                  />
                  {orgNames.map((name, i) => (
                    <Bar
                      key={name}
                      dataKey={name}
                      stackId="a"
                      fill={CHART_COLORS[i % CHART_COLORS.length]}
                      radius={i === orgNames.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* ── Consolidated table ─────────────────────────────────────────────── */}
      <div className="rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Tableau de synthèse
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40">
                <Th left>Entreprise</Th>
                <Th tooltip="Montant HT initial signé au contrat, hors tout avenant.">Marché de base</Th>
                <Th className="hidden md:table-cell" tooltip="Somme des Feuilles de Travaux Modificatives (avenants) dont le statut est MOA_APPROVED. S'ajoute au marché de base pour former le marché actuel.">FTM validé</Th>
                <Th bold tooltip="Marché de base + FTM validés. Représente la valeur contractuelle totale en vigueur pour cette entreprise.">Marché actuel</Th>
                <Th tooltip="Montant HT cumulé depuis le début du chantier, tel qu'approuvé par le MOE sur la dernière situation en date (statut ≥ MOE_APPROVED).">Cumulé approuvé</Th>
                <Th className="hidden lg:table-cell" tooltip="Cumulé approuvé ÷ Marché actuel × 100. Représente la part du marché déjà réalisée et reconnue par le MOE.">Avancement</Th>
                <Th className="hidden lg:table-cell" tooltip="Marché actuel − Cumulé approuvé. Montant restant à facturer pour atteindre la valeur totale du marché. Négatif si le cumulatif dépasse le marché.">Reste à facturer</Th>
                <Th tooltip="Somme des montants nets sur les situations au statut MOA_APPROVED, après retenue de garantie, remboursement d'avance et pénalités.">Net validé</Th>
                <Th>{/* toggle */}</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => {
                const isExpanded = expandedOrgId === row.org.id;
                const pct =
                  row.marcheActuel > 0
                    ? (row.cumulatifApprouve / row.marcheActuel) * 100
                    : 0;
                const reste = row.marcheActuel - row.cumulatifApprouve;
                const over = reste < 0;

                return (
                  <Fragment key={row.org.id}>
                    <tr
                      onClick={() => setExpandedOrgId(isExpanded ? null : row.org.id)}
                      className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">
                        {row.org.name}
                      </td>
                      <Td>{fmtEur(row.marcheBase)}</Td>
                      <Td className="hidden md:table-cell text-slate-500">
                        {row.ftmValide > 0 ? fmtEur(row.ftmValide) : "—"}
                      </Td>
                      <Td bold>{fmtEur(row.marcheActuel)}</Td>
                      <Td>{row.cumulatifApprouve > 0 ? fmtEur(row.cumulatifApprouve) : "—"}</Td>
                      <Td className="hidden lg:table-cell">
                        {row.marcheActuel > 0 ? (
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded bg-slate-100 dark:bg-slate-700">
                              <div
                                className={`h-full rounded transition-all ${over ? "bg-red-400" : "bg-teal-500"}`}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                            <span className={`tabular-nums ${over ? "text-red-600 dark:text-red-400" : ""}`}>
                              {pct.toFixed(1)} %
                            </span>
                          </div>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td
                        className={`hidden lg:table-cell ${over ? "text-red-600 dark:text-red-400" : ""}`}
                      >
                        {row.marcheActuel > 0 ? fmtEur(reste) : "—"}
                      </Td>
                      <Td>{row.totalNetPaye > 0 ? fmtEur(row.totalNetPaye) : "—"}</Td>
                      <td className="px-3 py-2.5 text-slate-400">
                        {isExpanded ? (
                          <ChevronDown className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5" />
                        )}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-slate-50 dark:bg-slate-800/20">
                        <td colSpan={9} className="px-4 py-3">
                          <DetailTable
                            situations={row.situations}
                            projectId={projectId}
                            orgId={row.org.id}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * Fixed-position tooltip — escapes any overflow:hidden / overflow-x:auto
 * ancestor (e.g. the table scroll wrapper) by using getBoundingClientRect.
 */
function InfoTooltip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const ref = useRef<HTMLSpanElement>(null);

  function handleMouseEnter() {
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setCoords({ top: r.top - 6, left: r.left + r.width / 2 });
    }
    setVisible(true);
  }

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setVisible(false)}
        className="inline-flex items-center"
      >
        <Info className="h-3 w-3 cursor-help text-slate-300 transition-colors hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400" />
      </span>
      {visible && (
        <span
          style={{
            position: "fixed",
            top: coords.top,
            left: coords.left,
            transform: "translate(-50%, -100%)",
            zIndex: 9999,
          }}
          className="pointer-events-none w-56 rounded border border-slate-200 bg-white px-2.5 py-2 text-left text-[11px] leading-relaxed text-slate-600 shadow-lg dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          {text}
        </span>
      )}
    </>
  );
}

function KpiCard({
  label,
  value,
  accent,
  tooltip,
}: {
  label: string;
  value: string;
  accent?: "teal" | "red";
  tooltip?: string;
}) {
  const valueClass =
    accent === "teal"
      ? "text-teal-700 dark:text-teal-400"
      : accent === "red"
      ? "text-red-600 dark:text-red-400"
      : "text-slate-900 dark:text-slate-100";

  return (
    <div className="rounded border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {label}
        </p>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <p className={`mt-1 text-xl font-bold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

function Th({
  children,
  left,
  bold,
  tooltip,
  className = "",
}: {
  children?: React.ReactNode;
  left?: boolean;
  bold?: boolean;
  tooltip?: string;
  className?: string;
}) {
  return (
    <th
      className={`px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 ${
        left ? "text-left" : "text-right"
      } ${bold ? "text-slate-600 dark:text-slate-300" : ""} ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        {tooltip && <InfoTooltip text={tooltip} />}
      </span>
    </th>
  );
}

function Td({
  children,
  bold,
  className = "",
}: {
  children?: React.ReactNode;
  bold?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`px-4 py-2.5 text-right tabular-nums ${
        bold ? "font-semibold text-slate-800 dark:text-slate-200" : "text-slate-600 dark:text-slate-400"
      } ${className}`}
    >
      {children}
    </td>
  );
}

function DetailTable({
  situations,
  projectId,
  orgId,
}: {
  situations: SituationRow[];
  projectId: string;
  orgId: string;
}) {
  if (situations.length === 0) {
    return (
      <p className="text-xs italic text-slate-400">Aucune situation enregistrée.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-700">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">N°</th>
            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Période</th>
            <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <span className="inline-flex items-center justify-end gap-1">
                Déclaré cumulé
                <InfoTooltip text="Montant HT cumulé depuis le début du chantier, tel que déclaré par l'entreprise dans cette situation (avant ajustement MOE)." />
              </span>
            </th>
            <th className="hidden px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:table-cell">
              <span className="inline-flex items-center justify-end gap-1">
                Ajusté MOE
                <InfoTooltip text="Montant HT cumulé après révision par le MOE. S'il diffère du déclaré, c'est la valeur retenue pour le calcul du montant de période." />
              </span>
            </th>
            <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <span className="inline-flex items-center justify-end gap-1">
                Montant période
                <InfoTooltip text="Montant HT net de la période, avant déductions. Calculé comme : Cumulé accepté (période N) − Cumulé accepté (période N−1)." />
              </span>
            </th>
            <th className="hidden px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400 md:table-cell">
              <span className="inline-flex items-center justify-end gap-1">
                Retenue
                <InfoTooltip text="Retenue de garantie prélevée sur cette situation. Généralement 5 % du montant de période HT, conservée jusqu'à la réception des travaux." />
              </span>
            </th>
            <th className="hidden px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400 md:table-cell">
              <span className="inline-flex items-center justify-end gap-1">
                Pénalités
                <InfoTooltip text="Montant des pénalités contractuelles appliquées sur cette situation (retard, non-conformité, etc.), déduit du montant à payer." />
              </span>
            </th>
            <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <span className="inline-flex items-center justify-end gap-1">
                Net payé
                <InfoTooltip text="Montant HT final à régler pour cette situation. Formule : Montant période − Retenue de garantie − Remboursement d'avance − Pénalités." />
              </span>
            </th>
            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Statut</th>
          </tr>
        </thead>
        <tbody>
          {situations.map((s) => (
            <tr
              key={s.id}
              className="border-b border-slate-100 last:border-0 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
            >
              <td className="px-3 py-2 text-slate-500">
                <Link
                  href={`/projects/${projectId}/situations/${orgId}/${s.id}`}
                  className="font-medium text-slate-700 underline hover:text-slate-900 dark:text-slate-300"
                  onClick={(e) => e.stopPropagation()}
                >
                  {s.numero}
                </Link>
              </td>
              <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{fmtPeriod(s.periodLabel)}</td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                {fmtEur(s.cumulativeAmountHtCents)}
              </td>
              <td className="hidden px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400 sm:table-cell">
                {dash(s.moeAdjustedAmountHtCents)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">
                {dash(s.periodNetBeforeDeductionsHtCents)}
              </td>
              <td className="hidden px-3 py-2 text-right tabular-nums text-amber-700 dark:text-amber-400 md:table-cell">
                {s.retenueGarantieAmountCents && s.retenueGarantieAmountCents > 0
                  ? `- ${fmtEur(s.retenueGarantieAmountCents)}`
                  : "—"}
              </td>
              <td className="hidden px-3 py-2 text-right tabular-nums text-red-600 dark:text-red-400 md:table-cell">
                {s.penaltyAmountCents && s.penaltyAmountCents > 0
                  ? `- ${fmtEur(s.penaltyAmountCents)}`
                  : "—"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums font-medium text-slate-800 dark:text-slate-200">
                {dash(s.netAmountHtCents)}
              </td>
              <td className="px-3 py-2">
                <StatusBadge status={s.status} label={STATUS_LABELS[s.status] ?? s.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
