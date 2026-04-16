"use client";

import React, { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { Info, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { FtmPhase } from "@prisma/client";
import type { FtmItem } from "./kanban-board";

const COLORS = {
  CREATION: "#f1f5f9",
  ETUDES: "#eff6ff",
  QUOTING: "#fef3c7",
  ANALYSIS: "#f3e8ff",
  MOA_FINAL: "#e0e7ff",
  ACCEPTED: "#ecfdf5",
  CANCELLED: "#fef2f2"
};

const BORDER_COLORS = {
  CREATION: "#cbd5e1",
  ETUDES: "#bfdbfe",
  QUOTING: "#fde68a",
  ANALYSIS: "#e9d5ff",
  MOA_FINAL: "#c7d2fe",
  ACCEPTED: "#a7f3d0",
  CANCELLED: "#fecaca"
};

const LABEL_MAP: Record<string, string> = {
  CREATION: "Création",
  ETUDES: "Études",
  QUOTING: "Devis",
  ANALYSIS: "Analyse MOE",
  MOA_FINAL: "Validation MOA",
  ACCEPTED: "Validés",
  CANCELLED: "Annulés"
};

export function FtmAnalyticsDashboard({ ftms }: { ftms: FtmItem[] }) {

  // 1. Compute Financial Totals
  const { montantEngage, expositionFinanciere, montantPotentielTotal } = useMemo(() => {
    let engage = 0;
    let exposure = 0;
    
    for (const f of ftms) {
      let maxOrLatestAmount = 0;
      for (const org of f.concernedOrgs) {
        const latestSub = f.quoteSubmissions.find(q => q.organizationId === org.organizationId);
        if (latestSub) {
          maxOrLatestAmount += Number(latestSub.amountHtCents);
        }
      }

      if (f.phase === FtmPhase.ACCEPTED) {
        engage += maxOrLatestAmount;
      } else if (f.phase === FtmPhase.QUOTING || f.phase === FtmPhase.ANALYSIS || f.phase === FtmPhase.MOA_FINAL) {
        exposure += maxOrLatestAmount;
      }
    }

    return {
      montantEngage: engage,
      expositionFinanciere: exposure,
      montantPotentielTotal: engage + exposure
    };
  }, [ftms]);

  // 2. Status Breakdown Array for PIE Chart
  const phaseDistribution = useMemo(() => {
    const map = new Map<FtmPhase, number>();
    for (const f of ftms) {
      map.set(f.phase, (map.get(f.phase) || 0) + 1);
    }
    return Array.from(map.entries()).map(([k, v]) => ({
      name: LABEL_MAP[k] || k,
      phase: k,
      value: v
    }));
  }, [ftms]);

  // 3. Hall of Shame (Overdue quotes by company)
  const hallOfShame = useMemo(() => {
    const delays = new Map<string, number>();
    const now = new Date();
    const todayAtMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    for (const f of ftms) {
      if (f.phase !== FtmPhase.QUOTING) continue;
      
      for (const org of f.concernedOrgs) {
        if (!org.dateLimiteDevis) continue;
        const deadline = new Date(org.dateLimiteDevis);
        const latestSub = f.quoteSubmissions.find(q => q.organizationId === org.organizationId);
        const isPendingOrCorrection = !latestSub || latestSub.reviews?.[0]?.decision === "RESEND_CORRECTION";

        if (isPendingOrCorrection && deadline < todayAtMidnight) {
          delays.set(org.organization.name, (delays.get(org.organization.name) || 0) + 1);
        }
      }
    }
    return Array.from(delays.entries())
      .map(([name, count]) => ({ name, Retards: count }))
      .sort((a, b) => b.Retards - a.Retards)
      .slice(0, 5); // top 5
  }, [ftms]);

  // 4. Time to Resolution Average
  const averageDaysToResolution = useMemo(() => {
    let totalDays = 0;
    let count = 0;
    for (const f of ftms) {
      if (f.phase === FtmPhase.ACCEPTED || f.phase === FtmPhase.CANCELLED) {
        const days = (new Date(f.updatedAt).getTime() - new Date(f.createdAt || f.updatedAt).getTime()) / (1000 * 3600 * 24);
        totalDays += Math.max(1, days);
        count++;
      }
    }
    return count > 0 ? Math.round(totalDays / count) : 0;
  }, [ftms]);

  const formatEuro = (cents: number) => (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/60 flex flex-col gap-6 mb-2">
      
      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        
        {/* Metric: Engagé */}
        <div className="flex flex-col gap-1 rounded-md border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Montant Engagé
            <div className="group relative">
              <Info className="h-3.5 w-3.5 cursor-help text-slate-400" />
              <div className="pointer-events-none absolute top-full left-1/2 mt-2 -translate-x-1/2 w-48 opacity-0 transition-opacity group-hover:opacity-100 z-50 rounded bg-slate-800 px-2 py-1 text-center text-xs text-white">
                Total HT des FTM en statut Validé
              </div>
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {formatEuro(montantEngage)}
          </div>
        </div>

        {/* Metric: Exposure */}
        <div className="flex flex-col gap-1 rounded-md border border-amber-100 bg-amber-50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-500">
            Exposition (En Cours)
            <div className="group relative">
              <Info className="h-3.5 w-3.5 cursor-help text-amber-600 dark:text-amber-500" />
              <div className="pointer-events-none absolute top-full left-1/2 mt-2 -translate-x-1/2 w-48 opacity-0 transition-opacity group-hover:opacity-100 z-50 rounded bg-slate-800 px-2 py-1 text-center text-xs text-white">
                Total HT des devis récupérés sur les FTM non encore validés/annulés
              </div>
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-900 dark:text-amber-300">
            {formatEuro(expositionFinanciere)}
          </div>
        </div>

        {/* Metric: Time to Resolution */}
        <div className="flex flex-col gap-1 rounded-md border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Délai Moyen de Résolution
          </div>
          <div className="flex items-end gap-2 text-2xl font-bold text-slate-900 dark:text-white">
            {averageDaysToResolution === 0 ? "-" : averageDaysToResolution} <span className="text-sm font-medium text-slate-500 pb-1">jours</span>
          </div>
        </div>

        {/* Metric: Taux Avancement */}
        <div className="flex flex-col gap-1 rounded-md border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Résolution Globale
          </div>
          <div className="flex items-end gap-2 text-2xl font-bold text-slate-900 dark:text-white">
            {ftms.length > 0 ? Math.round((ftms.filter(f => f.phase === FtmPhase.ACCEPTED || f.phase === FtmPhase.CANCELLED).length / ftms.length) * 100) : 0}%
          </div>
        </div>

      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Graphic: Status Breakdown */}
        <div className="flex flex-col h-72 border border-slate-100 rounded-md p-3 dark:border-slate-800">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Répartition par Statut</h4>
          <div className="flex-1 min-h-0 relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                <Pie
                  data={phaseDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={75}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => (percent || 0) > 0.05 ? `${name}` : ''}
                  labelLine={false}
                >
                  {phaseDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={BORDER_COLORS[entry.phase as keyof typeof BORDER_COLORS] || '#ccc'} />
                  ))}
                </Pie>
                <RechartsTooltip formatter={(value: any) => [value, "FTMs"]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Graphic: Hall of Shame */}
        <div className="flex flex-col h-72 border border-slate-100 rounded-md p-3 dark:border-slate-800">
          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex flex-wrap items-center gap-2">
            Classement des Retards <span className="text-xs font-normal text-slate-400">(Devis manquant / Date dépassée)</span>
          </h4>
          <div className="flex-1 min-h-0 relative">
            {hallOfShame.length === 0 ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                 <CheckCircle2 className="h-8 w-8 mb-2 text-emerald-400 opacity-50" />
                 <span className="text-sm">Aucun retard recensé</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hallOfShame} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} hide />
                  <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <RechartsTooltip cursor={{ fill: "#f1f5f9" }} />
                  <Bar dataKey="Retards" fill="#f87171" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}
