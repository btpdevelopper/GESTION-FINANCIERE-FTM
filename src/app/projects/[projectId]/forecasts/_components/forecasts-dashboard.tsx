"use client";

import { useState, useMemo, Fragment, useRef } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ChevronDown, ChevronRight, Info } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";

// ── Types ─────────────────────────────────────────────────────────────────────

type ApprovedEntry = {
  periodLabel: string;
  plannedAmountHtCents: number;
};

type ActualEntry = {
  periodLabel: string;
  netAmountHtCents: number;
};

type OrgRow = {
  org: { id: string; name: string };
  marcheActuel: number;
  forecastWaived: boolean;
  latestStatus: string | null;
  latestIndice: number | null;
  approvedEntries: ApprovedEntry[];
  approvedTotal: number;
  actualByPeriod: ActualEntry[];
};

type Props = {
  data: OrgRow[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const CHART_COLORS = ["#0d9488", "#0f766e", "#115e59", "#64748b", "#475569", "#334155", "#1d4ed8", "#7c3aed"];

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

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function ForecastsDashboard({ data }: Props) {
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null);

  // ── KPI totals ──────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const marcheActuel = data.reduce((s, r) => s + r.marcheActuel, 0);
    const prevuTotal = data.reduce((s, r) => s + r.approvedTotal, 0);
    const approvedCount = data.filter((r) => r.latestStatus === "MOA_APPROVED").length;
    const couverture = marcheActuel > 0 ? (prevuTotal / marcheActuel) * 100 : 0;
    return { marcheActuel, prevuTotal, couverture, approvedCount, total: data.length };
  }, [data]);

  // ── Chart 1 — Projection mensuelle (stacked bars, approved forecast entries) ─
  const { projectionData, orgNames } = useMemo(() => {
    const periods = new Set<string>();
    const perOrgPerPeriod = new Map<string, Map<string, number>>();

    for (const row of data) {
      for (const e of row.approvedEntries) {
        periods.add(e.periodLabel);
        if (!perOrgPerPeriod.has(row.org.name)) perOrgPerPeriod.set(row.org.name, new Map());
        const m = perOrgPerPeriod.get(row.org.name)!;
        m.set(e.periodLabel, (m.get(e.periodLabel) ?? 0) + e.plannedAmountHtCents);
      }
    }

    const sortedPeriods = [...periods].sort();
    const names = data.filter((r) => r.approvedEntries.length > 0).map((r) => r.org.name);

    const projection = sortedPeriods.map((period) => {
      const entry: Record<string, string | number> = { period: fmtPeriod(period) };
      for (const name of names) {
        entry[name] = perOrgPerPeriod.get(name)?.get(period) ?? 0;
      }
      return entry;
    });

    return { projectionData: projection, orgNames: names };
  }, [data]);

  // ── Chart 2 — Prévisionnel vs Réalisé ──────────────────────────────────────
  const deviationData = useMemo(() => {
    const periods = new Set<string>();
    const prevuByPeriod = new Map<string, number>();
    const realiseByPeriod = new Map<string, number>();

    for (const row of data) {
      for (const e of row.approvedEntries) {
        periods.add(e.periodLabel);
        prevuByPeriod.set(e.periodLabel, (prevuByPeriod.get(e.periodLabel) ?? 0) + e.plannedAmountHtCents);
      }
      for (const a of row.actualByPeriod) {
        periods.add(a.periodLabel);
        realiseByPeriod.set(a.periodLabel, (realiseByPeriod.get(a.periodLabel) ?? 0) + a.netAmountHtCents);
      }
    }

    return [...periods]
      .sort()
      .map((period) => {
        const prevu = prevuByPeriod.get(period) ?? 0;
        const realise = realiseByPeriod.get(period) ?? 0;
        return {
          period: fmtPeriod(period),
          Prévu: prevu,
          Réalisé: realise,
          over: realise > prevu,
        };
      });
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
          label="Total prévu (approuvé)"
          value={totals.prevuTotal > 0 ? fmtEur(totals.prevuTotal) : "—"}
          tooltip="Somme des montants HT prévisionnels validés MOA sur toutes les entreprises. Inclut uniquement les entrées des prévisionnels au statut MOA_APPROVED."
        />
        <KpiCard
          label="Couverture prévisionnelle"
          value={totals.couverture > 0 ? `${totals.couverture.toFixed(1)} %` : "—"}
          accent={totals.couverture >= 90 ? "teal" : totals.couverture >= 50 ? undefined : "amber"}
          tooltip="Total prévu (MOA_APPROVED) ÷ Marché actuel total × 100. Indique dans quelle mesure le plan de facturation couvre la valeur totale du marché. En dessous de 90 % = couverture insuffisante."
        />
        <KpiCard
          label="Prévisionnels approuvés"
          value={`${totals.approvedCount} / ${totals.total}`}
          accent={totals.approvedCount === totals.total ? "teal" : undefined}
          tooltip="Nombre d'entreprises dont le dernier prévisionnel est au statut MOA_APPROVED, sur le total d'entreprises actives sur le projet."
        />
      </div>

      {/* ── Charts ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Chart 1 — Projection mensuelle */}
        <div className="rounded border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Projection mensuelle de facturation
          </p>
          {projectionData.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-xs italic text-slate-400">
              Aucun prévisionnel approuvé MOA.
            </div>
          ) : (
            <div style={{ height: Math.max(projectionData.length * 30, 180) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={projectionData} margin={{ top: 0, right: 10, bottom: 0, left: 0 }}>
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
                  <Legend
                    iconSize={8}
                    wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
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

        {/* Chart 2 — Prévisionnel vs Réalisé */}
        <div className="rounded border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Prévisionnel vs Réalisé
          </p>
          {deviationData.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-xs italic text-slate-400">
              Aucune donnée disponible.
            </div>
          ) : (
            <div style={{ height: Math.max(deviationData.length * 30, 180) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deviationData} margin={{ top: 0, right: 10, bottom: 0, left: 0 }}>
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
                  <Legend
                    iconSize={8}
                    wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                  />
                  <Bar dataKey="Prévu" fill="#0d9488" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Réalisé" fill="#475569" radius={[3, 3, 0, 0]} />
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
                <Th bold tooltip="Marché de base + FTM validés. Représente la valeur contractuelle totale en vigueur pour cette entreprise.">Marché actuel</Th>
                <Th tooltip="Somme des montants HT des entrées du dernier prévisionnel validé MOA pour cette entreprise. Représente le plan de facturation officiel.">Total prévu</Th>
                <Th className="hidden lg:table-cell" tooltip="Total prévu ÷ Marché actuel × 100. Indique dans quelle mesure le plan de facturation couvre la valeur totale du marché de l'entreprise.">Couverture</Th>
                <Th className="hidden md:table-cell" tooltip="Nombre de mois distincts planifiés dans le dernier prévisionnel validé MOA de cette entreprise.">Périodes</Th>
                <Th tooltip="Numéro de révision du dernier prévisionnel soumis par cette entreprise (incrémenté à chaque nouvelle version).">Indice</Th>
                <Th left>Statut</Th>
                <Th>{/* toggle */}</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => {
                const isExpanded = expandedOrgId === row.org.id;
                const pct = row.marcheActuel > 0 && row.approvedTotal > 0
                  ? (row.approvedTotal / row.marcheActuel) * 100
                  : 0;

                return (
                  <Fragment key={row.org.id}>
                    <tr
                      onClick={() => setExpandedOrgId(isExpanded ? null : row.org.id)}
                      className="cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                    >
                      <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-200">
                        {row.org.name}
                      </td>
                      <Td bold>{fmtEur(row.marcheActuel)}</Td>
                      <Td>
                        {row.forecastWaived ? (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                            Dispensé
                          </span>
                        ) : row.approvedTotal > 0 ? (
                          fmtEur(row.approvedTotal)
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td className="hidden lg:table-cell">
                        {!row.forecastWaived && row.marcheActuel > 0 && row.approvedTotal > 0 ? (
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded bg-slate-100 dark:bg-slate-700">
                              <div
                                className="h-full rounded bg-teal-500 transition-all"
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                            <span className="tabular-nums">{pct.toFixed(1)} %</span>
                          </div>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td className="hidden md:table-cell">
                        {row.approvedEntries.length > 0
                          ? `${new Set(row.approvedEntries.map((e) => e.periodLabel)).size}`
                          : "—"}
                      </Td>
                      <Td>
                        {row.latestIndice != null ? `#${row.latestIndice}` : "—"}
                      </Td>
                      <td className="px-4 py-2.5">
                        {row.latestStatus ? (
                          <StatusBadge
                            status={row.latestStatus}
                            label={STATUS_LABELS[row.latestStatus] ?? row.latestStatus}
                          />
                        ) : row.forecastWaived ? (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                            Dispensé
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">Aucun</span>
                        )}
                      </td>
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
                        <td colSpan={8} className="px-4 py-3">
                          <ForecastDetailTable row={row} />
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
  accent?: "teal" | "amber";
  tooltip?: string;
}) {
  const valueClass =
    accent === "teal"
      ? "text-teal-700 dark:text-teal-400"
      : accent === "amber"
      ? "text-amber-600 dark:text-amber-400"
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

function ForecastDetailTable({ row }: { row: OrgRow }) {
  if (row.forecastWaived) {
    return (
      <p className="text-xs italic text-slate-400">
        Dispensé de prévisionnel — aucune entrée requise.
      </p>
    );
  }
  if (row.approvedEntries.length === 0) {
    return (
      <p className="text-xs italic text-slate-400">
        Aucun prévisionnel approuvé MOA pour cette entreprise.
      </p>
    );
  }

  const total = row.approvedEntries.reduce((s, e) => s + e.plannedAmountHtCents, 0);

  return (
    <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-700">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Période
            </th>
            <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Montant HT prévu
            </th>
            <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              % du total prévu
            </th>
          </tr>
        </thead>
        <tbody>
          {row.approvedEntries.map((e) => (
            <tr
              key={e.periodLabel}
              className="border-b border-slate-100 last:border-0 dark:border-slate-800"
            >
              <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                {fmtPeriod(e.periodLabel)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-700 dark:text-slate-300">
                {fmtEur(e.plannedAmountHtCents)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                {total > 0 ? `${((e.plannedAmountHtCents / total) * 100).toFixed(1)} %` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/40">
            <td className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Total
            </td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800 dark:text-slate-200">
              {fmtEur(total)}
            </td>
            <td className="px-3 py-2 text-right tabular-nums text-slate-500">100 %</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
