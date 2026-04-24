"use client";

import { Fragment, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Info, FileCheck2, Scale, Gavel, Handshake } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import type { DgdDashboardRow } from "@/server/dgd/dgd-queries";

// ── Status labels ─────────────────────────────────────────────────────────────

const DGD_STATUS_LABELS: Record<string, string> = {
  DRAFT: "Brouillon",
  PENDING_MOE: "En attente MOE",
  PENDING_MOA: "En attente MOA",
  APPROVED: "Approuvé",
  DISPUTED: "En réclamation",
  RESOLVED_AMICABLY: "Résolu à l'amiable",
  IN_LITIGATION: "En contentieux",
  RESOLVED_BY_COURT: "Décision de justice",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtEur(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

type Props = {
  data: DgdDashboardRow[];
  projectId: string;
};

export function DgdDashboard({ data, projectId }: Props) {
  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null);

  // ── KPI totals ──────────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    const marcheActuel = data.reduce((s, r) => s + r.marcheActuel, 0);
    const totalSolde = data.reduce((s, r) => s + (r.effectiveSolde ?? 0), 0);
    const submitted = data.filter((r) => r.status && r.status !== "DRAFT").length;
    const approved = data.filter((r) =>
      r.status && ["APPROVED", "RESOLVED_AMICABLY", "RESOLVED_BY_COURT"].includes(r.status)
    ).length;
    const disputed = data.filter((r) =>
      r.status && ["DISPUTED", "IN_LITIGATION"].includes(r.status)
    ).length;
    return { marcheActuel, totalSolde, submitted, approved, disputed, total: data.length };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="rounded border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
        Aucune entreprise associée à ce projet.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── KPI cards ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Marché total actualisé"
          value={fmtEur(totals.marcheActuel)}
          tooltip="Somme des marchés de base + FTM acceptés pour toutes les entreprises."
        />
        <KpiCard
          label="Solde DGD total"
          value={fmtEur(totals.totalSolde)}
          accent={totals.totalSolde < 0 ? "red" : undefined}
          tooltip="Somme des soldes DGD effectifs de toutes les entreprises ayant soumis leur décompte final."
        />
        <KpiCard
          label="DGD clôturés"
          value={`${totals.approved} / ${totals.total}`}
          accent={totals.approved === totals.total && totals.total > 0 ? "teal" : undefined}
          tooltip="Nombre de DGD approuvés, résolus à l'amiable ou par décision de justice."
        />
        <KpiCard
          label="En litige"
          value={String(totals.disputed)}
          accent={totals.disputed > 0 ? "red" : undefined}
          tooltip="Nombre de DGD en réclamation ou en contentieux."
        />
      </div>

      {/* ── Consolidated table ─────────────────────────────────────────────── */}
      <div className="rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Synthèse DGD par entreprise
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/40">
                <Th left>Entreprise</Th>
                <Th tooltip="Montant HT initial des lots attribués.">Marché base</Th>
                <Th className="hidden md:table-cell" tooltip="Somme des FTM acceptés (avenants validés).">FTM</Th>
                <Th bold tooltip="Marché base + FTM. Valeur contractuelle totale.">Marché actualisé</Th>
                <Th className="hidden lg:table-cell" tooltip="Pénalités actives (MOA_APPROVED + MAINTAINED).">Pénalités</Th>
                <Th className="hidden lg:table-cell" tooltip="Retenue de garantie calculée sur le marché actualisé. Nulle si caution bancaire fournie.">Retenue</Th>
                <Th tooltip="Cumulé des travaux déjà facturés et validés (situations).">Acomptes</Th>
                <Th bold tooltip="Marché actualisé − Pénalités − Retenue − Acomptes. Montant final dû.">Solde DGD</Th>
                <Th>Statut</Th>
                <Th>{/* toggle */}</Th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => {
                const isExpanded = expandedOrgId === row.org.id;
                const soldeNeg = (row.effectiveSolde ?? 0) < 0;

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
                        {row.ftmValide > 0 ? `+${fmtEur(row.ftmValide)}` : "—"}
                      </Td>
                      <Td bold>{fmtEur(row.marcheActuel)}</Td>
                      <Td className="hidden lg:table-cell text-red-600 dark:text-red-400">
                        {row.penalites > 0 ? `-${fmtEur(row.penalites)}` : "—"}
                      </Td>
                      <Td className="hidden lg:table-cell text-amber-700 dark:text-amber-400">
                        {row.retenueGarantie > 0 ? (
                          <span className="flex items-center justify-end gap-1">
                            {`-${fmtEur(row.retenueGarantie)}`}
                            {row.cautionBancaire && (
                              <span className="rounded bg-teal-100 px-1 py-0.5 text-[9px] font-semibold text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                                CB
                              </span>
                            )}
                          </span>
                        ) : row.cautionBancaire ? (
                          <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[9px] font-semibold text-teal-700 dark:bg-teal-900/40 dark:text-teal-300">
                            Caution bancaire
                          </span>
                        ) : "—"}
                      </Td>
                      <Td>{row.acomptesVerses > 0 ? fmtEur(row.acomptesVerses) : "—"}</Td>
                      <Td bold className={soldeNeg ? "text-red-600 dark:text-red-400" : ""}>
                        {row.effectiveSolde != null ? fmtEur(row.effectiveSolde) : "—"}
                      </Td>
                      <td className="px-4 py-2.5">
                        {row.status ? (
                          <StatusBadge status={row.status} label={DGD_STATUS_LABELS[row.status] ?? row.status} />
                        ) : (
                          <span className="text-[10px] italic text-slate-400">Non créé</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-400">
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-slate-50 dark:bg-slate-800/20">
                        <td colSpan={10} className="px-4 py-4">
                          <LotBreakdown
                            lots={row.lots}
                            status={row.status}
                            dgdId={row.dgdId}
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
      <span ref={ref} onMouseEnter={handleMouseEnter} onMouseLeave={() => setVisible(false)} className="inline-flex items-center">
        <Info className="h-3 w-3 cursor-help text-slate-300 transition-colors hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400" />
      </span>
      {visible && (
        <span
          style={{ position: "fixed", top: coords.top, left: coords.left, transform: "translate(-50%, -100%)", zIndex: 9999 }}
          className="pointer-events-none w-56 rounded border border-slate-200 bg-white px-2.5 py-2 text-left text-[11px] leading-relaxed text-slate-600 shadow-lg dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          {text}
        </span>
      )}
    </>
  );
}

function KpiCard({ label, value, accent, tooltip }: {
  label: string; value: string; accent?: "teal" | "red"; tooltip?: string;
}) {
  const valueClass = accent === "teal" ? "text-teal-700 dark:text-teal-400"
    : accent === "red" ? "text-red-600 dark:text-red-400"
    : "text-slate-900 dark:text-slate-100";
  return (
    <div className="rounded border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center gap-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">{label}</p>
        {tooltip && <InfoTooltip text={tooltip} />}
      </div>
      <p className={`mt-1 text-xl font-bold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

function Th({ children, left, bold, tooltip, className = "" }: {
  children?: React.ReactNode; left?: boolean; bold?: boolean; tooltip?: string; className?: string;
}) {
  return (
    <th className={`px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 ${left ? "text-left" : "text-right"} ${bold ? "text-slate-600 dark:text-slate-300" : ""} ${className}`}>
      <span className="inline-flex items-center gap-1">
        {children}
        {tooltip && <InfoTooltip text={tooltip} />}
      </span>
    </th>
  );
}

function Td({ children, bold, className = "" }: {
  children?: React.ReactNode; bold?: boolean; className?: string;
}) {
  return (
    <td className={`px-4 py-2.5 text-right tabular-nums ${bold ? "font-semibold text-slate-800 dark:text-slate-200" : "text-slate-600 dark:text-slate-400"} ${className}`}>
      {children}
    </td>
  );
}

function LotBreakdown({ lots, status, dgdId, projectId, orgId }: {
  lots: { lotId: string; lotLabel: string; montantHtCents: number }[];
  status: string | null;
  dgdId: string | null;
  projectId: string;
  orgId: string;
}) {
  const statusIcon = status ? getStatusIcon(status) : null;

  return (
    <div className="space-y-3">
      {/* Lot detail */}
      {lots.length > 0 ? (
        <div className="rounded border border-slate-200 dark:border-slate-700 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">Lot</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-slate-400">Montant marché HT</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => (
                <tr key={lot.lotId} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{lot.lotLabel}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-600 dark:text-slate-400">{fmtEur(lot.montantHtCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs italic text-slate-400">Aucun lot attribué.</p>
      )}

      {/* Quick action link */}
      <div className="flex items-center gap-3">
        <Link
          href={`/projects/${projectId}/dgd/${orgId}`}
          className="inline-flex items-center gap-1.5 rounded bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
        >
          {statusIcon}
          {status ? "Voir le DGD" : "Accéder au DGD"}
          <ChevronRight className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

function getStatusIcon(status: string) {
  switch (status) {
    case "APPROVED": case "RESOLVED_AMICABLY": return <FileCheck2 className="h-3 w-3" />;
    case "DISPUTED": return <Scale className="h-3 w-3" />;
    case "IN_LITIGATION": case "RESOLVED_BY_COURT": return <Gavel className="h-3 w-3" />;
    default: return null;
  }
}
