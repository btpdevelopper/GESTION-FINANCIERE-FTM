import Link from "next/link";
import { getDgdForOrg } from "@/server/dgd/dgd-queries";
import { calculateDgdTotals } from "@/lib/dgd/calculations";
import { DgdDetailShell } from "./dgd-detail-shell";
import { AlertCircle, Info } from "lucide-react";

type Props = {
  projectId: string;
  projectName: string;
  organizationId: string;
  eligibility: {
    eligible: boolean;
    reason?: string | null;
    role: string;
    existingDgd?: { id: string; status: string } | null;
    openSituations?: { numero: number; status: string; periodLabel: string }[];
  };
};

export async function DgdEntrepriseView({
  projectId,
  projectName,
  organizationId,
  eligibility,
}: Props) {
  const existingDgd = await getDgdForOrg(projectId, organizationId);
  const liveTotals = await calculateDgdTotals(projectId, organizationId);

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <Link
          href={`/projects/${projectId}`}
          className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        >
          ← Tableau de bord
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Décompte Général Définitif
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Clôture financière de votre marché — {projectName}
        </p>
      </div>

      {/* ── Eligibility banner ──────────────────────────────────────────── */}
      {!eligibility.eligible && !existingDgd && (
        <div className="flex items-start gap-3 rounded border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/20">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="text-sm text-amber-800 dark:text-amber-200">
            <p className="font-medium">Le DGD ne peut pas encore être créé</p>
            {eligibility.reason && (
              <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">{eligibility.reason}</p>
            )}
            {eligibility.openSituations && eligibility.openSituations.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-amber-700 dark:text-amber-300">
                {eligibility.openSituations.map((s) => (
                  <li key={s.numero}>
                    • Situation N°{s.numero} ({s.periodLabel}) — {s.status}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* ── Informational banner when no DGD yet ──────────────────────── */}
      {!existingDgd && eligibility.eligible && (
        <div className="flex items-start gap-3 rounded border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/50 dark:bg-blue-950/20">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <p className="font-medium">Prêt pour le décompte final</p>
            <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
              Toutes vos situations sont clôturées. Vous pouvez maintenant créer votre Projet de Décompte Final
              pour clôturer définitivement votre marché.
            </p>
          </div>
        </div>
      )}

      {/* ── DGD Detail Shell ───────────────────────────────────────────── */}
      <DgdDetailShell
        projectId={projectId}
        organizationId={organizationId}
        dgd={existingDgd}
        liveTotals={{
          marcheBaseHtCents: Number(liveTotals.marcheBaseHtCents),
          ftmAcceptedTotalHtCents: Number(liveTotals.ftmAcceptedTotalHtCents),
          marcheActualiseHtCents: Number(liveTotals.marcheActualiseHtCents),
          penaltiesTotalHtCents: Number(liveTotals.penaltiesTotalHtCents),
          retenueGarantieCents: Number(liveTotals.retenueGarantieCents),
          cautionBancaireActive: liveTotals.cautionBancaireActive,
          acomptesVersesHtCents: Number(liveTotals.acomptesVersesHtCents),
          soldeDgdHtCents: Number(liveTotals.soldeDgdHtCents),
          lots: liveTotals.lots.map((l) => ({
            lotId: l.lotId,
            lotLabel: l.lotLabel,
            montantMarcheHtCents: Number(l.montantMarcheHtCents),
          })),
        }}
        canCreate={eligibility.eligible && !existingDgd}
        role="ENTREPRISE"
      />
    </div>
  );
}
