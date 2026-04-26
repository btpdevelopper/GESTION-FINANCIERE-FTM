import type { DgdFinancialRecapData } from "@/server/dgd/dgd-queries";

function fmt(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function pct(billed: number, total: number): string {
  if (total === 0) return "—";
  return `${Math.round((billed / total) * 100)} %`;
}

const TH = "px-3 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide";
const TD = "px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300";
const TD_R = "px-3 py-1.5 text-xs text-right tabular-nums text-slate-700 dark:text-slate-300";
const TD_R_AMBER = "px-3 py-1.5 text-xs text-right tabular-nums text-amber-700 dark:text-amber-400";
const TD_R_RED = "px-3 py-1.5 text-xs text-right tabular-nums text-red-700 dark:text-red-400";

export function DgdFinancialRecap({ data }: { data: DgdFinancialRecapData }) {
  const { situations, ftms, dgdPenalties } = data;

  if (situations.length === 0) {
    return (
      <div className="rounded border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        Aucune situation validée — le récapitulatif sera disponible après la première approbation MOA.
      </div>
    );
  }

  const ftmTotalAccepted = ftms.reduce((s, f) => s + f.totalAmountCents, 0);
  const ftmTotalBilled = ftms.reduce((s, f) => s + f.billedAmountCents, 0);

  return (
    <div className="space-y-5">
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        Récapitulatif financier
      </h2>

      {/* ── Section A — FTM Summary ─────────────────────────────────────── */}
      {ftms.length > 0 && (
        <div className="rounded border border-slate-200 dark:border-slate-800">
          <div className="border-b border-slate-200 px-3 py-2 dark:border-slate-800">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              Travaux Modificatifs — Récapitulatif
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
                <tr>
                  <th className={TH}>N° FTM</th>
                  <th className={TH}>Titre</th>
                  <th className={TH}>Devis / Indice</th>
                  <th className={`${TH} text-right`}>Montant accepté</th>
                  <th className={`${TH} text-right`}>Montant facturé</th>
                  <th className={`${TH} text-right`}>% facturé</th>
                  <th className={`${TH} text-right`}>Restant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {ftms.map((f) => (
                  <tr key={f.ftmId} className="hover:bg-slate-50 dark:hover:bg-slate-900/30">
                    <td className={TD}>{f.number}</td>
                    <td className={TD}>{f.title}</td>
                    <td className={`${TD} font-mono`}>
                      D{f.quoteNumber ?? "—"} / Ind.{f.indice}
                    </td>
                    <td className={TD_R}>{fmt(f.totalAmountCents)}</td>
                    <td className={TD_R}>{fmt(f.billedAmountCents)}</td>
                    <td className={TD_R}>{pct(f.billedAmountCents, f.totalAmountCents)}</td>
                    <td className={TD_R}>{fmt(f.totalAmountCents - f.billedAmountCents)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
                <tr>
                  <td colSpan={3} className="px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Total
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                    {fmt(ftmTotalAccepted)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                    {fmt(ftmTotalBilled)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                    {pct(ftmTotalBilled, ftmTotalAccepted)}
                  </td>
                  <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                    {fmt(ftmTotalAccepted - ftmTotalBilled)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Section B — Chronological situations ───────────────────────── */}
      <div className="rounded border border-slate-200 dark:border-slate-800">
        <div className="border-b border-slate-200 px-3 py-2 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Décompte chronologique des situations
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
              <tr>
                <th className={TH} style={{ width: "55%" }}>Poste</th>
                <th className={`${TH} text-right`}>Montant HT</th>
                <th className={`${TH} text-right`}>Cumul HT</th>
              </tr>
            </thead>
            <tbody>
              {situations.map((sit) => (
                <>
                  {/* Situation header */}
                  <tr key={`hdr-${sit.id}`} className="bg-slate-100 dark:bg-slate-800/60">
                    <td
                      colSpan={3}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200"
                    >
                      Situation N°{sit.numero} — {sit.periodLabel}
                    </td>
                  </tr>

                  {/* Travaux bruts — split base/revision when revision exists */}
                  {sit.periodRevisionHtCents > 0 ? (
                    <>
                      <tr key={`brut-base-${sit.id}`} className="hover:bg-slate-50 dark:hover:bg-slate-900/20">
                        <td className={`${TD} pl-5`}>Travaux bruts — Base</td>
                        <td className={TD_R}>{fmt(sit.periodNetBeforeDeductionsHtCents - sit.periodRevisionHtCents)}</td>
                        <td className="px-3 py-1.5 text-xs text-slate-400 dark:text-slate-600 text-right">—</td>
                      </tr>
                      <tr key={`brut-rev-${sit.id}`} className="hover:bg-slate-50 dark:hover:bg-slate-900/20">
                        <td className={`${TD} pl-5`}>Révision de prix</td>
                        <td className={TD_R}>{fmt(sit.periodRevisionHtCents)}</td>
                        <td className="px-3 py-1.5 text-xs text-slate-400 dark:text-slate-600 text-right">—</td>
                      </tr>
                      <tr key={`brut-total-${sit.id}`} className="hover:bg-slate-50 dark:hover:bg-slate-900/20 border-t border-slate-100 dark:border-slate-800">
                        <td className={`${TD} font-medium`}>Travaux bruts de la période (total)</td>
                        <td className={`${TD_R} font-medium`}>{fmt(sit.periodNetBeforeDeductionsHtCents)}</td>
                        <td className="px-3 py-1.5 text-xs text-slate-400 dark:text-slate-600 text-right">—</td>
                      </tr>
                    </>
                  ) : (
                    <tr key={`brut-${sit.id}`} className="hover:bg-slate-50 dark:hover:bg-slate-900/20">
                      <td className={TD}>Travaux bruts de la période</td>
                      <td className={TD_R}>{fmt(sit.periodNetBeforeDeductionsHtCents)}</td>
                      <td className="px-3 py-1.5 text-xs text-slate-400 dark:text-slate-600 text-right">—</td>
                    </tr>
                  )}

                  {/* FTM billing sub-rows */}
                  {sit.ftmBillings.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/20">
                      <td className="px-3 py-1 text-xs text-slate-500 dark:text-slate-400 pl-7">
                        ↳ FTM &quot;{b.ftmTitle}&quot; (N°{b.ftmNumber}, {b.percentage} %)
                      </td>
                      <td className="px-3 py-1 text-xs text-right tabular-nums text-slate-500 dark:text-slate-400">
                        {fmt(b.billedAmountCents)}
                      </td>
                      <td className="px-3 py-1 text-xs text-right text-slate-400 dark:text-slate-600">—</td>
                    </tr>
                  ))}

                  {/* Retenue de garantie */}
                  {sit.retenueGarantieAmountCents > 0 && (
                    <tr key={`ret-${sit.id}`} className="hover:bg-slate-50 dark:hover:bg-slate-900/20">
                      <td className={TD}>Retenue de garantie</td>
                      <td className={TD_R_AMBER}>− {fmt(sit.retenueGarantieAmountCents)}</td>
                      <td className="px-3 py-1.5 text-xs text-slate-400 dark:text-slate-600 text-right">—</td>
                    </tr>
                  )}

                  {/* Remboursement avance travaux */}
                  {sit.avanceTravauxRemboursementCents > 0 && (
                    <tr key={`avance-${sit.id}`} className="hover:bg-slate-50 dark:hover:bg-slate-900/20">
                      <td className={TD}>Remb. avance de travaux</td>
                      <td className={TD_R_AMBER}>− {fmt(sit.avanceTravauxRemboursementCents)}</td>
                      <td className="px-3 py-1.5 text-xs text-slate-400 dark:text-slate-600 text-right">—</td>
                    </tr>
                  )}

                  {/* Per-situation penalty detail rows */}
                  {sit.penalties.map((p) => (
                    <tr key={`pen-${p.id}`} className="hover:bg-slate-50 dark:hover:bg-slate-900/20">
                      <td className="px-3 py-1 text-xs text-red-700 dark:text-red-400 pl-7">↳ Pénalité — {p.label}</td>
                      <td className="px-3 py-1 text-xs text-right tabular-nums text-red-700 dark:text-red-400">
                        − {fmt(p.frozenAmountCents)}
                      </td>
                      <td className="px-3 py-1 text-xs text-right text-slate-400 dark:text-slate-600">—</td>
                    </tr>
                  ))}

                  {/* Pénalités total row (if any and no detail already shown via frozen snapshot) */}
                  {sit.penaltyAmountCents > 0 && sit.penalties.length === 0 && (
                    <tr key={`pentot-${sit.id}`} className="hover:bg-slate-50 dark:hover:bg-slate-900/20">
                      <td className={TD}>Pénalités de la période</td>
                      <td className={TD_R_RED}>− {fmt(sit.penaltyAmountCents)}</td>
                      <td className="px-3 py-1.5 text-xs text-slate-400 dark:text-slate-600 text-right">—</td>
                    </tr>
                  )}

                  {/* Net à payer */}
                  <tr key={`net-${sit.id}`} className="border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950">
                    <td className="px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-100">
                      Net à payer
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                      {fmt(sit.netAmountHtCents)}
                    </td>
                    <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                      {fmt(sit.acceptedCumulativeHtCents)}
                    </td>
                  </tr>
                </>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Section C — DGD-level penalties ────────────────────────────── */}
      {dgdPenalties.length > 0 && (
        <div className="rounded border border-red-200 dark:border-red-900/40">
          <div className="border-b border-red-200 px-3 py-2 dark:border-red-900/40">
            <p className="text-xs font-semibold text-red-700 dark:text-red-400">
              Pénalités au DGD
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-red-100 bg-red-50/50 dark:border-red-900/30 dark:bg-red-950/10">
                <tr>
                  <th className={TH}>Libellé</th>
                  <th className={`${TH} text-right`}>Montant HT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-red-50 dark:divide-red-900/20">
                {dgdPenalties.map((p) => (
                  <tr key={p.id} className="hover:bg-red-50/50 dark:hover:bg-red-950/10">
                    <td className={TD}>{p.label}</td>
                    <td className={TD_R_RED}>− {fmt(p.frozenAmountCents)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/10">
                <tr>
                  <td className="px-3 py-2 text-xs font-semibold text-red-700 dark:text-red-400">Total pénalités DGD</td>
                  <td className="px-3 py-2 text-right text-xs font-semibold tabular-nums text-red-700 dark:text-red-400">
                    − {fmt(dgdPenalties.reduce((s, p) => s + p.frozenAmountCents, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
