"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { StatusBadge } from "@/components/ui/badge";
import {
  ArrowRight,
  FileCheck2,
  Scale,
  Gavel,
  Handshake,
  Clock,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import {
  createDgdDraftAction,
  submitDgdAction,
} from "@/server/dgd/dgd-actions";

// ── Types ─────────────────────────────────────────────────────────────────────

type LiveTotals = {
  marcheBaseHtCents: number;
  ftmAcceptedTotalHtCents: number;
  marcheActualiseHtCents: number;
  penaltiesTotalHtCents: number;
  retenueGarantieCents: number;
  cautionBancaireActive: boolean;
  acomptesVersesHtCents: number;
  soldeDgdHtCents: number;
  lots: { lotId: string; lotLabel: string; montantMarcheHtCents: number }[];
};

type DgdRecord = {
  id: string;
  status: string;
  marcheBaseHtCents: bigint | null;
  ftmAcceptedTotalHtCents: bigint | null;
  marcheActualiseHtCents: bigint | null;
  penaltiesTotalHtCents: bigint | null;
  retenueGarantieCents: bigint | null;
  acomptesVersesHtCents: bigint | null;
  soldeDgdHtCents: bigint | null;
  moeComment: string | null;
  moeAdjustedSoldeHtCents: bigint | null;
  moaComment: string | null;
  disputeDeadline: Date | null;
  disputeJustification: string | null;
  amicableAdjustedSoldeHtCents: bigint | null;
  courtSoldeHtCents: bigint | null;
  submittedAt: Date | null;
  moeReviewedAt: Date | null;
  moaValidatedAt: Date | null;
  disputedAt: Date | null;
  reviews: {
    id: string;
    eventType: string;
    decision: string | null;
    comment: string | null;
    adjustedSoldeCents: bigint | null;
    createdAt: Date;
    member: { user: { name: string | null; email: string } };
  }[];
} | null;

type Props = {
  projectId: string;
  organizationId: string;
  dgd: DgdRecord;
  liveTotals: LiveTotals;
  canCreate: boolean;
  role: string;
};

// ── Status config ─────────────────────────────────────────────────────────────

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

const EVENT_LABELS: Record<string, string> = {
  SUBMITTED: "Soumis par l'entreprise",
  MOE_REVIEWED: "Analysé par le MOE",
  MOA_VALIDATED: "Validé par le MOA",
  DISPUTED: "Contesté par l'entreprise",
  RESOLVED_AMICABLY: "Résolution amiable",
  IN_LITIGATION: "Passage en contentieux",
  RESOLVED_BY_COURT: "Décision de justice",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtEur(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  });
}

function fmtDate(d: Date | string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function bigintToNum(v: bigint | null): number {
  return v !== null ? Number(v) : 0;
}

// ── Main component ───────────────────────────────────────────────────────────

export function DgdDetailShell({
  projectId,
  organizationId,
  dgd,
  liveTotals,
  canCreate,
  role,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Use frozen values if submitted, otherwise live values
  const isFrozen = dgd && dgd.status !== "DRAFT";
  const vals = isFrozen
    ? {
        marcheBase: bigintToNum(dgd.marcheBaseHtCents),
        ftmAccepted: bigintToNum(dgd.ftmAcceptedTotalHtCents),
        marcheActualise: bigintToNum(dgd.marcheActualiseHtCents),
        penalties: bigintToNum(dgd.penaltiesTotalHtCents),
        retenue: bigintToNum(dgd.retenueGarantieCents),
        acomptes: bigintToNum(dgd.acomptesVersesHtCents),
        solde: bigintToNum(dgd.soldeDgdHtCents),
      }
    : {
        marcheBase: liveTotals.marcheBaseHtCents,
        ftmAccepted: liveTotals.ftmAcceptedTotalHtCents,
        marcheActualise: liveTotals.marcheActualiseHtCents,
        penalties: liveTotals.penaltiesTotalHtCents,
        retenue: liveTotals.retenueGarantieCents,
        acomptes: liveTotals.acomptesVersesHtCents,
        solde: liveTotals.soldeDgdHtCents,
      };

  // Effective solde (accounts for MOE adjustments, amicable, court)
  const effectiveSolde = dgd?.courtSoldeHtCents != null
    ? Number(dgd.courtSoldeHtCents)
    : dgd?.amicableAdjustedSoldeHtCents != null
    ? Number(dgd.amicableAdjustedSoldeHtCents)
    : dgd?.moeAdjustedSoldeHtCents != null
    ? Number(dgd.moeAdjustedSoldeHtCents)
    : vals.solde;

  async function handleCreateDraft() {
    setError(null);
    startTransition(async () => {
      try {
        await createDgdDraftAction({ projectId });
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erreur inconnue.");
      }
    });
  }

  async function handleSubmit() {
    if (!dgd) return;
    setError(null);
    startTransition(async () => {
      try {
        await submitDgdAction({ dgdId: dgd.id, projectId });
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erreur inconnue.");
      }
    });
  }

  return (
    <div className="space-y-5">
      {/* ── Status header ─────────────────────────────────────────────── */}
      {dgd && (
        <div className="flex items-center gap-3">
          <StatusBadge status={dgd.status} label={DGD_STATUS_LABELS[dgd.status] ?? dgd.status} />
          {dgd.disputeDeadline && dgd.status === "APPROVED" && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              <Clock className="mr-1 inline h-3 w-3" />
              Délai de contestation : {fmtDate(dgd.disputeDeadline)}
            </span>
          )}
        </div>
      )}

      {/* ── Financial waterfall card ──────────────────────────────────── */}
      <div className="rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {isFrozen ? "Décompte financier (montants gelés)" : "Aperçu financier (montants en temps réel)"}
          </p>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {/* Lot breakdown */}
          {liveTotals.lots.length > 0 && (
            <div className="px-5 py-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Détail par lot</p>
              {liveTotals.lots.map((lot) => (
                <div key={lot.lotId} className="flex items-center justify-between py-1">
                  <span className="text-xs text-slate-600 dark:text-slate-400">{lot.lotLabel}</span>
                  <span className="text-xs tabular-nums text-slate-600 dark:text-slate-400">{fmtEur(lot.montantMarcheHtCents)}</span>
                </div>
              ))}
            </div>
          )}

          {/* Waterfall rows */}
          <WaterfallRow label="Marché de base" value={vals.marcheBase} />
          <WaterfallRow label="+ FTM acceptés" value={vals.ftmAccepted} accent="teal" prefix="+" />
          <WaterfallRow label="= Marché actualisé" value={vals.marcheActualise} bold />

          <div className="h-px" />

          <WaterfallRow label="− Pénalités" value={vals.penalties} accent="red" prefix="−" />
          <WaterfallRow
            label={`− Retenue de garantie${liveTotals.cautionBancaireActive ? " (caution bancaire)" : ""}`}
            value={vals.retenue}
            accent={liveTotals.cautionBancaireActive ? "teal" : "amber"}
            prefix="−"
          />
          <WaterfallRow label="− Acomptes versés" value={vals.acomptes} prefix="−" />

          <div className="bg-slate-50 px-5 py-3.5 dark:bg-slate-800/30">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                = SOLDE DGD
              </span>
              <span
                className={`text-lg font-bold tabular-nums ${
                  effectiveSolde < 0 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-100"
                }`}
              >
                {fmtEur(effectiveSolde)}
              </span>
            </div>
            {effectiveSolde !== vals.solde && (
              <p className="mt-1 text-[10px] text-slate-500">
                Solde initial : {fmtEur(vals.solde)} — ajusté suite à{" "}
                {dgd?.courtSoldeHtCents != null ? "décision de justice" : dgd?.amicableAdjustedSoldeHtCents != null ? "résolution amiable" : "analyse MOE"}
              </p>
            )}
            {effectiveSolde < 0 && (
              <p className="mt-1 flex items-center gap-1 text-[10px] text-red-600 dark:text-red-400">
                <AlertTriangle className="h-3 w-3" />
                Solde négatif — l&apos;entreprise doit un remboursement au MOA.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ── MOE comment (if any) ──────────────────────────────────────── */}
      {dgd?.moeComment && (
        <div className="rounded border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/50 dark:bg-blue-950/20">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
            Commentaire MOE
          </p>
          <p className="mt-1 text-sm text-blue-800 dark:text-blue-200">{dgd.moeComment}</p>
          {dgd.moeAdjustedSoldeHtCents != null && (
            <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
              Solde ajusté par le MOE : {fmtEur(Number(dgd.moeAdjustedSoldeHtCents))}
            </p>
          )}
        </div>
      )}

      {/* ── MOA comment (if any) ──────────────────────────────────────── */}
      {dgd?.moaComment && (
        <div className="rounded border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-900/50 dark:bg-violet-950/20">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">
            Commentaire MOA
          </p>
          <p className="mt-1 text-sm text-violet-800 dark:text-violet-200">{dgd.moaComment}</p>
        </div>
      )}

      {/* ── Dispute info ──────────────────────────────────────────────── */}
      {dgd?.disputeJustification && (
        <div className="rounded border border-orange-200 bg-orange-50 px-4 py-3 dark:border-orange-900/50 dark:bg-orange-950/20">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">
            Mémoire en réclamation
          </p>
          <p className="mt-1 text-sm text-orange-800 dark:text-orange-200">{dgd.disputeJustification}</p>
          {dgd.disputedAt && (
            <p className="mt-1 text-[10px] text-orange-600 dark:text-orange-400">Contesté le {fmtDate(dgd.disputedAt)}</p>
          )}
        </div>
      )}

      {/* ── Review timeline ───────────────────────────────────────────── */}
      {dgd && dgd.reviews.length > 0 && (
        <div className="rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-4 py-2.5 dark:border-slate-800">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              Historique des actions
            </p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {dgd.reviews.map((review) => (
              <div key={review.id} className="flex items-start gap-3 px-4 py-3">
                <div className="mt-0.5">
                  {getEventIcon(review.eventType)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                      {EVENT_LABELS[review.eventType] ?? review.eventType}
                    </span>
                    {review.decision && (
                      <StatusBadge status={review.decision} label={review.decision} />
                    )}
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {review.member.user.name ?? review.member.user.email} — {fmtDate(review.createdAt)}
                  </p>
                  {review.comment && (
                    <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{review.comment}</p>
                  )}
                  {review.adjustedSoldeCents != null && (
                    <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                      Solde ajusté : {fmtEur(Number(review.adjustedSoldeCents))}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Error display ─────────────────────────────────────────────── */}
      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
          {error}
        </div>
      )}

      {/* ── Action buttons ────────────────────────────────────────────── */}
      {role === "ENTREPRISE" && (
        <div className="flex flex-wrap gap-3">
          {/* Create draft */}
          {canCreate && !dgd && (
            <button
              onClick={handleCreateDraft}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700 disabled:opacity-50"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
              Créer le Projet de Décompte Final
            </button>
          )}

          {/* Submit draft */}
          {dgd?.status === "DRAFT" && (
            <button
              onClick={handleSubmit}
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              Soumettre au MOE
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function WaterfallRow({
  label,
  value,
  bold,
  accent,
  prefix,
}: {
  label: string;
  value: number;
  bold?: boolean;
  accent?: "teal" | "red" | "amber";
  prefix?: string;
}) {
  const valueColor = accent === "teal"
    ? "text-teal-700 dark:text-teal-400"
    : accent === "red"
    ? "text-red-600 dark:text-red-400"
    : accent === "amber"
    ? "text-amber-700 dark:text-amber-400"
    : bold
    ? "text-slate-900 dark:text-slate-100"
    : "text-slate-600 dark:text-slate-400";

  return (
    <div className="flex items-center justify-between px-5 py-2.5">
      <span className={`text-xs ${bold ? "font-semibold text-slate-800 dark:text-slate-200" : "text-slate-600 dark:text-slate-400"}`}>
        {label}
      </span>
      <span className={`text-sm tabular-nums ${bold ? "font-semibold" : "font-medium"} ${valueColor}`}>
        {prefix && value > 0 ? `${prefix} ` : ""}{fmtEur(value)}
      </span>
    </div>
  );
}

function getEventIcon(eventType: string) {
  const cls = "h-4 w-4";
  switch (eventType) {
    case "SUBMITTED": return <ArrowRight className={`${cls} text-blue-500`} />;
    case "MOE_REVIEWED": return <FileCheck2 className={`${cls} text-teal-500`} />;
    case "MOA_VALIDATED": return <FileCheck2 className={`${cls} text-green-500`} />;
    case "DISPUTED": return <Scale className={`${cls} text-orange-500`} />;
    case "RESOLVED_AMICABLY": return <Handshake className={`${cls} text-teal-500`} />;
    case "IN_LITIGATION": return <Gavel className={`${cls} text-red-500`} />;
    case "RESOLVED_BY_COURT": return <Gavel className={`${cls} text-purple-500`} />;
    default: return <Clock className={`${cls} text-slate-400`} />;
  }
}
