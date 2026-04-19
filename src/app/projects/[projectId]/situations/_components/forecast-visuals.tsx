"use client";

import { AlertTriangle, CheckCircle2 } from "lucide-react";

export type ForecastEntry = { periodLabel: string; plannedAmountHtCents: number };

export function formatEurShared(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

export function fmtPeriodShared(p: string): string {
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

// ── Compliance helper ─────────────────────────────────────────────────────────

export function forecastCompliance(
  entries: ForecastEntry[],
  periodLabel: string,
  thisPeriodCents: number
) {
  const planned = entries.find((e) => e.periodLabel === periodLabel)?.plannedAmountHtCents ?? null;
  const delta = planned !== null ? thisPeriodCents - planned : null;
  const deltaRatio = planned !== null && planned > 0 ? delta! / planned : null;
  const compliant = deltaRatio !== null && Math.abs(deltaRatio) <= 0.05;
  return {
    planned,
    delta,
    compliant,
    overForecast: delta !== null && delta > 0 && !compliant,
    underForecast: delta !== null && delta < 0 && !compliant,
    missingEntry: planned === null,
  };
}

// ── Progress bar ──────────────────────────────────────────────────────────────

export function SituationProgressBar({
  previousCents,
  thisPeriodCents,
  marcheTotalCents,
}: {
  previousCents: number;
  thisPeriodCents: number;
  marcheTotalCents: number;
}) {
  const base = Math.max(marcheTotalCents, previousCents + thisPeriodCents, 1);
  const prevPct = Math.min((previousCents / base) * 100, 100);
  const thisPct = Math.min((thisPeriodCents / base) * 100, 100 - prevPct);
  const newCumulative = previousCents + thisPeriodCents;
  const over = marcheTotalCents > 0 && newCumulative > marcheTotalCents;

  return (
    <div className="space-y-1.5">
      <div className="relative h-5 overflow-hidden rounded bg-slate-100 dark:bg-slate-800">
        {prevPct > 0 && (
          <div
            className="absolute left-0 top-0 h-full bg-slate-400 dark:bg-slate-500 transition-all duration-300"
            style={{ width: `${prevPct}%` }}
          />
        )}
        {thisPct > 0 && (
          <div
            className={`absolute top-0 h-full transition-all duration-300 ${over ? "bg-red-400" : "bg-teal-500"}`}
            style={{ left: `${prevPct}%`, width: `${thisPct}%` }}
          />
        )}
        {marcheTotalCents > 0 && base > marcheTotalCents && (
          <div
            className="absolute top-0 h-full w-px bg-slate-600 dark:bg-slate-300"
            style={{ left: `${(marcheTotalCents / base) * 100}%` }}
          />
        )}
        <div className="absolute inset-0 flex items-center px-2">
          <span className="select-none truncate text-[10px] font-medium text-white drop-shadow-sm">
            {newCumulative > 0
              ? marcheTotalCents > 0
                ? `${((newCumulative / marcheTotalCents) * 100).toFixed(1)} % du marché`
                : formatEurShared(newCumulative)
              : ""}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded-sm bg-slate-400 dark:bg-slate-500" />
          M-1 : {formatEurShared(previousCents)}
        </span>
        {thisPeriodCents > 0 && (
          <span className={`flex items-center gap-1 ${over ? "text-red-600 dark:text-red-400" : ""}`}>
            <span className={`inline-block h-2 w-3 rounded-sm ${over ? "bg-red-400" : "bg-teal-500"}`} />
            +M : {formatEurShared(thisPeriodCents)}
          </span>
        )}
        {marcheTotalCents > 0 && (
          <span className="ml-auto font-medium text-slate-600 dark:text-slate-300">
            Marché : {formatEurShared(marcheTotalCents)}
          </span>
        )}
      </div>

      {over && (
        <p className="flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          Dépasse le montant du marché de {formatEurShared(newCumulative - marcheTotalCents)}
        </p>
      )}
    </div>
  );
}

// ── Compliance banner (inline, inside form left column) ───────────────────────

export function ForecastComplianceBanner({
  entries,
  periodLabel,
  thisPeriodCents,
}: {
  entries: ForecastEntry[];
  periodLabel: string;
  thisPeriodCents: number;
}) {
  if (!periodLabel || thisPeriodCents <= 0) return null;
  const { planned, delta, compliant, overForecast, underForecast, missingEntry } =
    forecastCompliance(entries, periodLabel, thisPeriodCents);

  const cls = compliant
    ? "border-green-200 bg-green-50 text-green-800 dark:border-green-900/50 dark:bg-green-950/20 dark:text-green-300"
    : "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300";

  return (
    <div className={`flex items-start gap-2 rounded border px-3 py-2 text-xs ${cls}`}>
      {compliant ? (
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      ) : (
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      )}
      <span>
        {missingEntry
          ? "Hors prévisionnel — aucune entrée prévisionnelle pour cette période."
          : compliant
          ? `Conforme — ${formatEurShared(thisPeriodCents)} ce mois (prévu : ${formatEurShared(planned!)})`
          : overForecast
          ? `Dépassement de ${formatEurShared(Math.abs(delta!))} vs prévisionnel de ${formatEurShared(planned!)}.`
          : underForecast
          ? `En dessous de ${formatEurShared(Math.abs(delta!))} vs prévisionnel de ${formatEurShared(planned!)}.`
          : null}
      </span>
    </div>
  );
}

// ── Forecast panel (right column table) ──────────────────────────────────────

export function SituationForecastPanel({
  entries,
  forecastWaived,
  periodLabel,
  thisPeriodCents,
}: {
  entries: ForecastEntry[];
  forecastWaived: boolean;
  periodLabel: string;
  thisPeriodCents: number;
}) {
  return (
    <div className="rounded border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Prévisionnel approuvé
      </p>

      {forecastWaived ? (
        <p className="text-xs italic text-slate-500 dark:text-slate-400">
          Dispensé de prévisionnel pour ce projet.
        </p>
      ) : entries.length === 0 ? (
        <p className="text-xs italic text-slate-400 dark:text-slate-500">
          Aucun prévisionnel approuvé.
        </p>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="pb-1 text-left font-medium text-slate-400">Mois</th>
                <th className="pb-1 text-right font-medium text-slate-400">Prévu</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const isSelected = entry.periodLabel === periodLabel;
                const { delta, compliant, overForecast } = isSelected
                  ? forecastCompliance(entries, periodLabel, thisPeriodCents)
                  : { delta: null, compliant: false, overForecast: false };

                return (
                  <tr
                    key={entry.periodLabel}
                    className={`border-b border-slate-100 last:border-0 dark:border-slate-800/60 ${
                      isSelected ? "bg-slate-50 dark:bg-slate-800" : ""
                    }`}
                  >
                    <td
                      className={`py-1.5 pr-2 ${
                        isSelected
                          ? "font-semibold text-slate-800 dark:text-slate-200"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {fmtPeriodShared(entry.periodLabel)}
                    </td>
                    <td
                      className={`py-1.5 text-right tabular-nums ${
                        isSelected
                          ? "font-semibold text-slate-800 dark:text-slate-200"
                          : "text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      {formatEurShared(entry.plannedAmountHtCents)}
                      {isSelected && delta !== null && thisPeriodCents > 0 && (
                        <span
                          className={`ml-1 text-[10px] font-normal ${
                            compliant
                              ? "text-green-600 dark:text-green-400"
                              : overForecast
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-blue-600 dark:text-blue-400"
                          }`}
                        >
                          {delta > 0 ? `+${formatEurShared(delta)}` : delta < 0 ? formatEurShared(delta) : "✓"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
