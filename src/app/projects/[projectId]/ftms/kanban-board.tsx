"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { FtmPhase, ModificationSource, ProjectRole } from "@prisma/client";
import {
  FileEdit, MessageSquare, ChevronRight, CheckCircle2, Clock,
  Search, Filter, AlertCircle, BarChart3, ArrowUpDown, Layers
} from "lucide-react";
import { FtmAnalyticsDashboard } from "./analytics-dashboard";

export type FtmItem = {
  id: string;
  number: number;
  title: string;
  phase: FtmPhase;
  modificationSource: ModificationSource;
  createdAt: Date;
  updatedAt: Date;
  requestedMoeResponseDate: Date | null;
  concernedOrgs: {
    dateLimiteDevis: Date | null;
    organizationId: string;
    organization: { id: string; name: string }
  }[];
  initiator: {
    user: { name: string | null; email: string };
    organization: { name: string };
  };
  chatMessages: { id: string }[];
  quoteSubmissions: {
    id: string;
    organizationId: string;
    indice: number;
    amountHtCents: bigint;
    submittedAt: Date;
    reviews: { decision: string }[];
  }[];
};

const PHASES = [
  { id: FtmPhase.ETUDES, label: "Études", color: "bg-blue-50 border-blue-100 dark:bg-blue-900/20 dark:border-blue-800/50" },
  { id: FtmPhase.QUOTING, label: "Devis", color: "bg-amber-50 border-amber-100 dark:bg-amber-900/20 dark:border-amber-800/50" },
  { id: FtmPhase.ANALYSIS, label: "Analyse MOE", color: "bg-purple-50 border-purple-100 dark:bg-purple-900/20 dark:border-purple-800/50" },
  { id: FtmPhase.MOA_FINAL, label: "Validation MOA", color: "bg-indigo-50 border-indigo-100 dark:bg-indigo-900/20 dark:border-indigo-800/50" },
  { id: "COMPLETED", label: "Terminés", color: "bg-emerald-50 border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800/50" },
  { id: FtmPhase.CANCELLED, label: "Annulés", color: "bg-red-50 border-red-100 dark:bg-red-900/20 dark:border-red-800/50" },
];

function getSourceBadge(source: ModificationSource) {
  switch (source) {
    case "MOE":
      return <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Demande MOE</span>;
    case "MOA":
      return <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">Demande MOA</span>;
    case "ALEAS_EXECUTION":
      return <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">Aléas Chantier</span>;
    default:
      return <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">{source}</span>;
  }
}

// Helper to determine if an FTM has overdue quote responses
function hasOverdueQuotes(ftm: FtmItem) {
  if (ftm.phase !== FtmPhase.QUOTING) return false;
  const now = new Date();

  // To strictly check if overdue is at midnight, we zero out the time on 'now'
  const todayAtMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (const org of ftm.concernedOrgs) {
    if (!org.dateLimiteDevis) continue;
    const deadline = new Date(org.dateLimiteDevis);

    // Check if this specific org has submitted a decent quote
    const latestSub = ftm.quoteSubmissions.find(q => q.organizationId === org.organizationId);

    // If quote is submitted and not "RESEND_CORRECTION", it's not overdue to them
    const isPendingOrCorrection = !latestSub || latestSub.reviews?.[0]?.decision === "RESEND_CORRECTION";

    if (isPendingOrCorrection && deadline < todayAtMidnight) {
      return true;
    }
  }
  return false;
}

// Compute total quote value considering only the latest indice for each organization
function computeTotalQuoteValue(ftm: FtmItem): number {
  let totalCents = 0;
  for (const org of ftm.concernedOrgs) {
    const latestSub = ftm.quoteSubmissions.find(q => q.organizationId === org.organizationId);
    if (latestSub) {
      totalCents += Number(latestSub.amountHtCents);
    }
  }
  return totalCents;
}

const COMPANY_PHASES = [
  { id: "UPCOMING", label: "À Venir", color: "bg-slate-100 border-slate-200 dark:bg-slate-800/50 dark:border-slate-700" },
  { id: "TO_QUOTE", label: "À Chiffrer", color: "bg-red-50 border-red-100 dark:bg-red-900/20 dark:border-red-800/50" },
  { id: "PENDING", label: "En Attente", color: "bg-amber-50 border-amber-100 dark:bg-amber-900/20 dark:border-amber-800/50" },
  { id: "ACCEPTED", label: "Validés", color: "bg-emerald-50 border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800/50" },
  { id: FtmPhase.CANCELLED, label: "Annulés", color: "bg-red-50 border-red-100 dark:bg-red-900/20 dark:border-red-800/50" },
];

export function FtmKanbanBoard({
  projectId,
  ftms,
  isCompany = false,
}: {
  projectId: string;
  ftms: FtmItem[];
  isCompany?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<ModificationSource | "ALL">("ALL");
  const [orgFilter, setOrgFilter] = useState<string>("ALL");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [sortByValue, setSortByValue] = useState<"NONE" | "ASC" | "DESC">("NONE");
  const [showAnalytics, setShowAnalytics] = useState(false);

  // Extract unique organizations across all FTMs for the dropdown
  const allOrganizations = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of ftms) {
      for (const org of f.concernedOrgs) {
        map.set(org.organizationId, org.organization.name);
      }
    }
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [ftms]);

  // Apply filters and sorting
  const filteredFtms = useMemo(() => {
    let result = ftms.filter((f) => {
      if (search) {
        const query = search.toLowerCase();
        const matchesTitle = f.title.toLowerCase().includes(query);
        const matchesNumber = f.number.toString().includes(query);
        const matchesInitiator = (f.initiator.user.name || f.initiator.user.email).toLowerCase().includes(query);
        if (!matchesTitle && !matchesNumber && !matchesInitiator) return false;
      }
      if (sourceFilter !== "ALL" && f.modificationSource !== sourceFilter) return false;
      if (orgFilter !== "ALL" && !f.concernedOrgs.some((co) => co.organizationId === orgFilter)) return false;
      if (overdueOnly && !hasOverdueQuotes(f)) return false;
      return true;
    });

    if (sortByValue !== "NONE") {
      result.sort((a, b) => {
        const valA = computeTotalQuoteValue(a);
        const valB = computeTotalQuoteValue(b);
        return sortByValue === "ASC" ? valA - valB : valB - valA;
      });
    }

    return result;
  }, [ftms, search, sourceFilter, orgFilter, overdueOnly, sortByValue]);

  const [collapsedOverrides, setCollapsedOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Reset manual overrides when filtering so zeroed columns auto-collapse
    setCollapsedOverrides({});
  }, [search, sourceFilter, orgFilter, overdueOnly, sortByValue]);

  const toggleColumn = (colId: string, currentState: boolean) => {
    setCollapsedOverrides((prev) => ({
      ...prev,
      [colId]: !currentState,
    }));
  };

  return (
    <div className="flex flex-col gap-4">
      {/* ── Toolbar ── */}
      <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/60 lg:flex-row lg:items-center lg:justify-between">
        
        {/* Left Controls */}
        <div className="flex items-center gap-3 w-full lg:w-auto">
          {!isCompany && (
            <div className="group relative">
               <button
                  onClick={() => setShowAnalytics(!showAnalytics)}
                  className={`flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${
                    showAnalytics 
                      ? "border-indigo-600 bg-indigo-50 text-indigo-700 dark:border-indigo-500/50 dark:bg-indigo-900/30 dark:text-indigo-300"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                  }`}
                >
                  <BarChart3 className="h-4 w-4" />
                </button>
                <div className="pointer-events-none absolute left-1/2 top-full mt-2 w-max -translate-x-1/2 rounded bg-slate-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 dark:bg-slate-700 z-10">
                  Analytics & Totaux
                </div>
            </div>
          )}

          <div className="group relative">
             <button
                onClick={() => setOverdueOnly(!overdueOnly)}
                className={`flex h-9 w-9 items-center justify-center rounded-md border transition-colors ${
                  overdueOnly 
                    ? "border-red-600 bg-red-50 text-red-700 dark:border-red-500/50 dark:bg-red-900/30 dark:text-red-400"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                }`}
              >
                <Clock className="h-4 w-4" />
              </button>
              <div className="pointer-events-none absolute left-1/2 top-full mt-2 w-max -translate-x-1/2 rounded bg-slate-800 px-2 py-1 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100 dark:bg-slate-700 z-10">
                Retards devis
              </div>
          </div>

          <div className="flex min-w-[200px] flex-1 lg:flex-none items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 focus-within:ring-1 focus-within:ring-slate-400 dark:border-slate-700 dark:bg-slate-800">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="N° FTM, titre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500 dark:text-slate-100"
            />
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
          
          <div className="flex items-center rounded-md border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 focus-within:ring-1 focus-within:ring-slate-400">
            <Layers className="h-4 w-4 mr-1 text-slate-400" />
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as ModificationSource | "ALL")}
              className="bg-transparent text-sm text-slate-700 outline-none dark:text-slate-200 py-0.5"
            >
              <option value="ALL">Sources</option>
              <option value="MOA">MOA</option>
              <option value="MOE">MOE</option>
              <option value="ALEAS_EXECUTION">Aléas</option>
            </select>
          </div>

          <div className="flex items-center rounded-md border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 focus-within:ring-1 focus-within:ring-slate-400">
            <Filter className="h-4 w-4 mr-1 text-slate-400" />
            <select
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              className="bg-transparent text-sm text-slate-700 outline-none dark:text-slate-200 max-w-[150px] truncate py-0.5"
            >
              <option value="ALL">Entreprises</option>
              {allOrganizations.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center rounded-md border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 focus-within:ring-1 focus-within:ring-slate-400">
            <ArrowUpDown className="h-4 w-4 mr-1 text-slate-400" />
            <select
              value={sortByValue}
              onChange={(e) => setSortByValue(e.target.value as any)}
              className="bg-transparent text-sm text-slate-700 outline-none dark:text-slate-200 py-0.5"
            >
              <option value="NONE">Tri par défaut</option>
              <option value="DESC">Montant ⬇</option>
              <option value="ASC">Montant ⬆</option>
            </select>
          </div>

        </div>
      </div>

      <div className={`grid transition-all duration-300 ease-in-out ${showAnalytics && !isCompany ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
        <div className="overflow-hidden">
          <FtmAnalyticsDashboard ftms={filteredFtms} />
        </div>
      </div>

      {/* ── Board ── */}
      <div className="flex h-[calc(100vh-16rem)] w-full gap-4 overflow-x-auto pb-4 pt-1 hide-scrollbar">
        {(isCompany ? COMPANY_PHASES : PHASES).map((col) => {
          const columnFtms = filteredFtms.filter((f) => {
            if (!isCompany) {
              if (col.id === "COMPLETED") return f.phase === FtmPhase.ACCEPTED;
              return f.phase === col.id;
            } else {
              // Company routing logic
              if (col.id === FtmPhase.CANCELLED) return f.phase === FtmPhase.CANCELLED;
              if (f.phase === FtmPhase.CANCELLED) return false;

              if (col.id === "UPCOMING") {
                return f.phase === FtmPhase.ETUDES;
              }

              if (col.id === "ACCEPTED") {
                return f.phase === FtmPhase.ACCEPTED;
              }

              // Evaluate Quote submission status for TO_QUOTE vs PENDING
              const latestQuote = f.quoteSubmissions.sort((a, b) => b.indice - a.indice)[0];
              const isResend = latestQuote?.reviews?.some(r => r.decision === "RESEND_CORRECTION");

              if (col.id === "TO_QUOTE") {
                // Must be in a phase where quotes are relevant
                if (f.phase !== FtmPhase.QUOTING && f.phase !== FtmPhase.ANALYSIS && f.phase !== FtmPhase.MOA_FINAL) return false;
                return !latestQuote || isResend;
              }

              if (col.id === "PENDING") {
                if (f.phase !== FtmPhase.ANALYSIS && f.phase !== FtmPhase.MOA_FINAL && f.phase !== FtmPhase.QUOTING) return false;
                return !!latestQuote && !isResend;
              }

              return false;
            }
          });

          const isEmpty = columnFtms.length === 0;
          const isCollapsed = collapsedOverrides[col.id] !== undefined ? collapsedOverrides[col.id] : isEmpty;

          return (
            <div
              key={col.id}
              onClick={() => {
                if (isCollapsed) toggleColumn(col.id, true);
              }}
              className={`group flex shrink-0 flex-col rounded-xl p-3 shadow-sm ring-1 ring-slate-200/60 transition-all duration-300 ease-in-out dark:ring-slate-800/80 ${isCollapsed
                ? "w-12 cursor-pointer items-center bg-slate-50/50 hover:bg-slate-100 dark:bg-slate-800/20 dark:hover:bg-slate-800/60"
                : "w-[340px] bg-slate-50/70 dark:bg-slate-800/40"
                }`}
            >
              {isCollapsed ? (
                <div className="flex h-full w-full flex-col items-center pt-1 animate-in fade-in duration-300">
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                    {columnFtms.length}
                  </div>
                  <div className="mt-4 flex-1 [writing-mode:vertical-rl] text-sm font-semibold tracking-wide text-slate-500 group-hover:text-slate-700 dark:text-slate-400 dark:group-hover:text-slate-200 rotate-180">
                    {col.label}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col h-full w-full animate-in fade-in duration-300 min-w-0">
                  {/* Column Header */}
                  <div className="mb-3 flex items-center justify-between px-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
                    <div className="flex items-center gap-2">
                      <span>{col.label}</span>
                      <span className="flex h-5 items-center justify-center rounded-full bg-slate-200 px-2 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
                        {columnFtms.length}
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleColumn(col.id, false);
                      }}
                      className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
                      title="Réduire la colonne"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Cards Container */}
                  <div
                    className="flex flex-col gap-3 overflow-y-auto pb-6 hide-scrollbar"
                    style={{ WebkitMaskImage: "linear-gradient(to bottom, black 90%, transparent 100%)", maskImage: "linear-gradient(to bottom, black 90%, transparent 100%)" }}
                  >
                    {columnFtms.map((ftm) => {
                      const isOverdue = hasOverdueQuotes(ftm);

                      // Progress metrics
                      const validSubmissionsCount = ftm.concernedOrgs.filter(org => {
                        const sub = ftm.quoteSubmissions.find(q => q.organizationId === org.organizationId);
                        return sub && sub.reviews?.[0]?.decision !== "RESEND_CORRECTION";
                      }).length;
                      const totalOrgs = ftm.concernedOrgs.length;
                      const progressPerc = totalOrgs === 0 ? 0 : Math.round((validSubmissionsCount / totalOrgs) * 100);

                      const totalEstimatedValue = computeTotalQuoteValue(ftm);

                      return (
                        <Link
                          key={ftm.id}
                          href={`/projects/${projectId}/ftms/${ftm.id}`}
                          className={`group relative flex flex-col gap-2 rounded-lg border bg-white p-3 shadow-sm transition-all hover:shadow-md dark:bg-slate-900 ${col.color}`}
                        >
                          {/* Top Header */}
                          <div className="flex items-start justify-between">
                            <span className="flex items-center gap-2 text-[12px] font-bold text-slate-700 tracking-wider dark:text-slate-300">
                              <span>FTM N°{ftm.number}</span>
                              {isOverdue && (
                                <span className="flex items-center gap-1 text-[10px] uppercase font-bold text-red-600 animate-pulse bg-red-50 px-1.5 py-0.5 rounded dark:bg-red-950/40 dark:text-red-400">
                                  <AlertCircle className="h-3 w-3" />
                                  En retard
                                </span>
                              )}
                            </span>
                            {getSourceBadge(ftm.modificationSource)}
                          </div>

                          {/* Main Title */}
                          <h3 className="text-sm font-semibold leading-snug text-slate-900 line-clamp-2 dark:text-slate-100">
                            {ftm.title}
                          </h3>

                          {/* Info lines */}
                          <div className="mt-1 flex flex-col gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <div className="flex items-center justify-between">
                              <span className="truncate max-w-[200px]">
                                Par {ftm.initiator.user.name || ftm.initiator.user.email.split('@')[0]} ({ftm.initiator.organization.name})
                              </span>
                              {totalEstimatedValue > 0 && (
                                <span className="font-semibold text-slate-700 dark:text-slate-300">
                                  {(totalEstimatedValue / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Footer & Metrics */}
                          <div className="mt-1 flex flex-col border-t border-slate-100 pt-2 dark:border-slate-800">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                                  <Clock className="h-3 w-3" />
                                  {new Date(ftm.updatedAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                                </div>

                                {/* Chat Activity Badge */}
                                {ftm.chatMessages.length > 0 && (
                                  <div className="flex items-center gap-1 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                                    <MessageSquare className="h-3 w-3" />
                                    {ftm.chatMessages.length}
                                  </div>
                                )}
                              </div>

                              {/* Terminated states */}
                              {ftm.phase === FtmPhase.ACCEPTED && (
                                <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                  <CheckCircle2 className="h-3 w-3" /> Validé
                                </span>
                              )}
                              {ftm.phase === FtmPhase.CANCELLED && (
                                <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 dark:text-red-400">
                                  Annulé
                                </span>
                              )}
                            </div>

                            {/* Progress Bar for Quoting Phase */}
                            {(ftm.phase === FtmPhase.QUOTING || ftm.phase === FtmPhase.ANALYSIS) && !isCompany && totalOrgs > 0 && (
                              <div className="mt-2.5">
                                <div className="flex justify-between text-[10px] font-medium text-slate-400 mb-1">
                                  <span>Avancement devis</span>
                                  <span>{validSubmissionsCount} / {totalOrgs}</span>
                                </div>
                                <div className="h-1 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                                  <div
                                    className={`h-full transition-all duration-500 ${progressPerc === 100 ? 'bg-emerald-500' : 'bg-amber-400'}`}
                                    style={{ width: `${progressPerc}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </Link>
                      );
                    })}

                    {columnFtms.length === 0 && (
                      <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-transparent dark:border-slate-800">
                        <span className="text-xs font-medium tracking-wide text-slate-400">Aucun FTM</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
