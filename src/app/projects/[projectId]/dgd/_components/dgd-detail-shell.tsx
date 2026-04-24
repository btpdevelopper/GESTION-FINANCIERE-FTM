"use client";

import { useState, useTransition, useRef } from "react";
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
  Paperclip,
  ExternalLink,
} from "lucide-react";
import {
  createDgdDraftAction,
  submitDgdAction,
  moeAnalyzeDgdAction,
  moaValidateDgdAction,
  contestDgdAction,
  resolveAmicablyAction,
  declareInLitigationAction,
  resolveByCourtAction,
  uploadDgdDocumentAction,
  getDgdDocumentSignedUrlAction,
} from "@/server/dgd/dgd-actions";
import { getEffectiveSolde } from "@/lib/dgd/calculations";
import { Button } from "@/components/ui/button";
import { INPUT_CLS } from "@/components/ui/input";

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
  disputeDocumentUrl: string | null;
  disputeDocumentName: string | null;
  amicableComment: string | null;
  amicableAdjustedSoldeHtCents: bigint | null;
  amicableDocumentUrl: string | null;
  amicableDocumentName: string | null;
  litigationComment: string | null;
  courtSoldeHtCents: bigint | null;
  courtDocumentUrl: string | null;
  courtDocumentName: string | null;
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

function parseEurToCents(val: string): number | null {
  const cleaned = val.replace(/\s/g, "").replace(",", ".");
  const parsed = parseFloat(cleaned);
  if (isNaN(parsed)) return null;
  return Math.round(parsed * 100);
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

  // MOE review form state
  const [moeDecision, setMoeDecision] = useState<"ACCEPT" | "MODIFY" | "REJECT">("ACCEPT");
  const [moeComment, setMoeComment] = useState("");
  const [moeAdjustedSolde, setMoeAdjustedSolde] = useState("");

  // MOA validation form state
  const [moaDecision, setMoaDecision] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [moaComment, setMoaComment] = useState("");

  // Contest form state
  const [contestJustification, setContestJustification] = useState("");
  const [contestDoc, setContestDoc] = useState<{ path: string; name: string } | null>(null);
  const [contestDocUploading, setContestDocUploading] = useState(false);
  const contestFileRef = useRef<HTMLInputElement>(null);

  // Amicable resolution form state
  const [amicableSolde, setAmicableSolde] = useState("");
  const [amicableComment, setAmicableComment] = useState("");
  const [amicableDoc, setAmicableDoc] = useState<{ path: string; name: string } | null>(null);
  const [amicableDocUploading, setAmicableDocUploading] = useState(false);
  const amicableFileRef = useRef<HTMLInputElement>(null);

  // Litigation form state
  const [litigationComment, setLitigationComment] = useState("");

  // Court resolution form state
  const [courtSolde, setCourtSolde] = useState("");
  const [courtComment, setCourtComment] = useState("");
  const [courtDoc, setCourtDoc] = useState<{ path: string; name: string } | null>(null);
  const [courtDocUploading, setCourtDocUploading] = useState(false);
  const courtFileRef = useRef<HTMLInputElement>(null);

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

  const effectiveSoldeRaw = dgd
    ? getEffectiveSolde({
        soldeDgdHtCents: dgd.soldeDgdHtCents,
        moeAdjustedSoldeHtCents: dgd.moeAdjustedSoldeHtCents,
        amicableAdjustedSoldeHtCents: dgd.amicableAdjustedSoldeHtCents,
        courtSoldeHtCents: dgd.courtSoldeHtCents,
        status: dgd.status,
      })
    : null;
  const effectiveSolde = effectiveSoldeRaw !== null ? Number(effectiveSoldeRaw) : vals.solde;

  const disputeDeadlinePassed = dgd?.disputeDeadline
    ? new Date() > new Date(dgd.disputeDeadline)
    : false;

  function wrap(fn: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Erreur inconnue.");
      }
    });
  }

  // ── Document upload helper ─────────────────────────────────────────────────
  async function handleDocUpload(
    file: File,
    setUploading: (v: boolean) => void,
    setDoc: (d: { path: string; name: string }) => void
  ) {
    if (!dgd) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("projectId", projectId);
      fd.append("dgdId", dgd.id);
      const result = await uploadDgdDocumentAction(fd);
      setDoc(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'upload.");
    } finally {
      setUploading(false);
    }
  }

  // ── View signed document ───────────────────────────────────────────────────
  async function handleViewDoc(path: string) {
    setError(null);
    try {
      const url = await getDgdDocumentSignedUrlAction(projectId, path);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Impossible d'ouvrir le document.");
    }
  }

  // ── ENTREPRISE actions ─────────────────────────────────────────────────────
  async function handleCreateDraft() {
    wrap(() => createDgdDraftAction({ projectId }));
  }

  async function handleSubmit() {
    if (!dgd) return;
    wrap(() => submitDgdAction({ dgdId: dgd.id, projectId }));
  }

  async function handleContest() {
    if (!dgd) return;
    wrap(() =>
      contestDgdAction({
        dgdId: dgd.id,
        projectId,
        justification: contestJustification,
        disputeDocumentUrl: contestDoc?.path ?? null,
        disputeDocumentName: contestDoc?.name ?? null,
      })
    );
  }

  // ── MOE actions ────────────────────────────────────────────────────────────
  async function handleMoeAnalyze() {
    if (!dgd) return;
    const adjustedCents = moeDecision === "MODIFY" ? parseEurToCents(moeAdjustedSolde) : null;
    if (moeDecision === "MODIFY" && adjustedCents === null) {
      setError("Le montant ajusté est invalide.");
      return;
    }
    wrap(() =>
      moeAnalyzeDgdAction({
        dgdId: dgd.id,
        projectId,
        decision: moeDecision,
        comment: moeComment,
        adjustedSoldeHtCents: adjustedCents,
      })
    );
  }

  // ── MOE/MOA amicable resolution ────────────────────────────────────────────
  async function handleResolveAmicably() {
    if (!dgd) return;
    const cents = parseEurToCents(amicableSolde);
    if (cents === null) {
      setError("Le montant du solde ajusté est invalide.");
      return;
    }
    wrap(() =>
      resolveAmicablyAction({
        dgdId: dgd.id,
        projectId,
        adjustedSoldeHtCents: cents,
        comment: amicableComment,
        amicableDocumentUrl: amicableDoc?.path ?? null,
        amicableDocumentName: amicableDoc?.name ?? null,
      })
    );
  }

  // ── MOA actions ────────────────────────────────────────────────────────────
  async function handleMoaValidate() {
    if (!dgd) return;
    wrap(() =>
      moaValidateDgdAction({
        dgdId: dgd.id,
        projectId,
        decision: moaDecision,
        comment: moaComment || null,
      })
    );
  }

  async function handleDeclareLitigation() {
    if (!dgd) return;
    wrap(() =>
      declareInLitigationAction({
        dgdId: dgd.id,
        projectId,
        comment: litigationComment,
      })
    );
  }

  async function handleResolveByCourt() {
    if (!dgd) return;
    const cents = parseEurToCents(courtSolde);
    if (cents === null) {
      setError("Le montant du solde est invalide.");
      return;
    }
    wrap(() =>
      resolveByCourtAction({
        dgdId: dgd.id,
        projectId,
        courtSoldeHtCents: cents,
        comment: courtComment,
        courtDocumentUrl: courtDoc?.path ?? null,
        courtDocumentName: courtDoc?.name ?? null,
      })
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Status header ─────────────────────────────────────────────── */}
      {dgd && (
        <div className="flex items-center gap-3">
          <StatusBadge status={dgd.status} label={DGD_STATUS_LABELS[dgd.status] ?? dgd.status} />
          {dgd.disputeDeadline && (dgd.status === "APPROVED" || dgd.status === "DISPUTED") && (
            <span className="text-xs text-slate-500 dark:text-slate-400">
              <Clock className="mr-1 inline h-3 w-3" />
              Délai de contestation : {fmtDate(dgd.disputeDeadline)}
              {disputeDeadlinePassed && (
                <span className="ml-1 text-red-500">(expiré)</span>
              )}
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
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">= SOLDE DGD</span>
              <span className={`text-lg font-bold tabular-nums ${effectiveSolde < 0 ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-100"}`}>
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

      {/* ── MOE comment display ───────────────────────────────────────── */}
      {dgd?.moeComment && (
        <div className="rounded border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-900/50 dark:bg-blue-950/20">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">Commentaire MOE</p>
          <p className="mt-1 text-sm text-blue-800 dark:text-blue-200">{dgd.moeComment}</p>
          {dgd.moeAdjustedSoldeHtCents != null && (
            <p className="mt-1 text-xs text-blue-700 dark:text-blue-300">
              Solde ajusté par le MOE : {fmtEur(Number(dgd.moeAdjustedSoldeHtCents))}
            </p>
          )}
        </div>
      )}

      {/* ── MOA comment display ───────────────────────────────────────── */}
      {dgd?.moaComment && (
        <div className="rounded border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-900/50 dark:bg-violet-950/20">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-600 dark:text-violet-400">Commentaire MOA</p>
          <p className="mt-1 text-sm text-violet-800 dark:text-violet-200">{dgd.moaComment}</p>
        </div>
      )}

      {/* ── Dispute display ───────────────────────────────────────────── */}
      {dgd?.disputeJustification && (
        <div className="rounded border border-orange-200 bg-orange-50 px-4 py-3 dark:border-orange-900/50 dark:bg-orange-950/20">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-orange-600 dark:text-orange-400">Mémoire en réclamation</p>
          <p className="mt-1 text-sm text-orange-800 dark:text-orange-200">{dgd.disputeJustification}</p>
          {dgd.disputedAt && (
            <p className="mt-1 text-[10px] text-orange-600 dark:text-orange-400">Contesté le {fmtDate(dgd.disputedAt)}</p>
          )}
          {dgd.disputeDocumentUrl && (
            <button
              onClick={() => handleViewDoc(dgd.disputeDocumentUrl!)}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-orange-700 underline hover:text-orange-900 dark:text-orange-300"
            >
              <Paperclip className="h-3 w-3" />
              {dgd.disputeDocumentName ?? "Mémoire en réclamation"}
              <ExternalLink className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      )}

      {/* ── Amicable resolution display ───────────────────────────────── */}
      {dgd?.amicableComment && (
        <div className="rounded border border-teal-200 bg-teal-50 px-4 py-3 dark:border-teal-900/50 dark:bg-teal-950/20">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400">Résolution amiable</p>
          <p className="mt-1 text-sm text-teal-800 dark:text-teal-200">{dgd.amicableComment}</p>
          {dgd.amicableAdjustedSoldeHtCents != null && (
            <p className="mt-1 text-xs font-medium text-teal-700 dark:text-teal-300">
              Solde convenu : {fmtEur(Number(dgd.amicableAdjustedSoldeHtCents))}
            </p>
          )}
          {dgd.amicableDocumentUrl && (
            <button
              onClick={() => handleViewDoc(dgd.amicableDocumentUrl!)}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 underline hover:text-teal-900 dark:text-teal-300"
            >
              <Paperclip className="h-3 w-3" />
              {dgd.amicableDocumentName ?? "Protocole d'accord"}
              <ExternalLink className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      )}

      {/* ── Litigation comment display ────────────────────────────────── */}
      {dgd?.litigationComment && (dgd.status === "IN_LITIGATION" || dgd.status === "RESOLVED_BY_COURT") && (
        <div className="rounded border border-red-200 bg-red-50 px-4 py-3 dark:border-red-900/50 dark:bg-red-950/20">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">Passage en contentieux</p>
          <p className="mt-1 text-sm text-red-800 dark:text-red-200">{dgd.litigationComment}</p>
        </div>
      )}

      {/* ── Court resolution display ──────────────────────────────────── */}
      {dgd?.status === "RESOLVED_BY_COURT" && dgd.courtSoldeHtCents != null && (
        <div className="rounded border border-purple-200 bg-purple-50 px-4 py-3 dark:border-purple-900/50 dark:bg-purple-950/20">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400">Décision de justice</p>
          <p className="mt-1 text-xs font-semibold text-purple-800 dark:text-purple-200">
            Solde fixé par le tribunal : {fmtEur(Number(dgd.courtSoldeHtCents))}
          </p>
          {dgd.courtDocumentUrl && (
            <button
              onClick={() => handleViewDoc(dgd.courtDocumentUrl!)}
              className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-purple-700 underline hover:text-purple-900 dark:text-purple-300"
            >
              <Paperclip className="h-3 w-3" />
              {dgd.courtDocumentName ?? "Jugement"}
              <ExternalLink className="h-2.5 w-2.5" />
            </button>
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
                <div className="mt-0.5">{getEventIcon(review.eventType)}</div>
                <div className="min-w-0 flex-1">
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

      {/* ═══════════════════════════════════════════════════════════════════
          ACTION SECTIONS — role + status gated
      ═══════════════════════════════════════════════════════════════════ */}

      {/* ── ENTREPRISE: create draft / submit draft ────────────────────── */}
      {role === "ENTREPRISE" && (
        <div className="flex flex-wrap gap-3">
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

      {/* ── ENTREPRISE: contest DGD (APPROVED + within deadline) ─────────
          Only show when the dispute window is still open.                 */}
      {role === "ENTREPRISE" && dgd?.status === "APPROVED" && !disputeDeadlinePassed && (
        <ActionCard
          title="Contester le DGD"
          icon={<Scale className="h-4 w-4 text-orange-500" />}
          colorClass="border-orange-200 dark:border-orange-900/50"
        >
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Justification (mémoire en réclamation) *</label>
              <textarea
                value={contestJustification}
                onChange={(e) => setContestJustification(e.target.value)}
                rows={4}
                placeholder="Exposez les motifs de votre contestation (min. 10 caractères)…"
                className={`${INPUT_CLS} mt-1 resize-none`}
              />
            </div>
            <DocUploadRow
              label="Mémoire en réclamation (PDF)"
              doc={contestDoc}
              uploading={contestDocUploading}
              inputRef={contestFileRef}
              onFileChange={(file) =>
                handleDocUpload(file, setContestDocUploading, setContestDoc)
              }
            />
            <Button
              onClick={handleContest}
              disabled={isPending || contestDocUploading || contestJustification.length < 10}
              variant="danger-solid"
              size="md"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scale className="h-4 w-4" />}
              Soumettre la contestation
            </Button>
          </div>
        </ActionCard>
      )}

      {/* ── MOE: analyze DGD (PENDING_MOE) ───────────────────────────── */}
      {role === "MOE" && dgd?.status === "PENDING_MOE" && (
        <ActionCard
          title="Analyse MOE"
          icon={<FileCheck2 className="h-4 w-4 text-blue-500" />}
          colorClass="border-blue-200 dark:border-blue-900/50"
        >
          <div className="space-y-3">
            {dgd.reviews.length > 0 && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Ce DGD a déjà été analysé et renvoyé. Consultez l&apos;historique ci-dessous pour le contexte des décisions précédentes.
              </p>
            )}
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Décision *</label>
              <div className="mt-1 flex gap-4">
                {(["ACCEPT", "MODIFY", "REJECT"] as const).map((d) => (
                  <label key={d} className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
                    <input
                      type="radio"
                      name="moe-decision"
                      value={d}
                      checked={moeDecision === d}
                      onChange={() => setMoeDecision(d)}
                      className="accent-blue-600"
                    />
                    {d === "ACCEPT" ? "Accepter" : d === "MODIFY" ? "Modifier le solde" : "Rejeter"}
                  </label>
                ))}
              </div>
            </div>

            {moeDecision === "MODIFY" && (
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Solde ajusté (€ HT) *</label>
                <input
                  type="text"
                  value={moeAdjustedSolde}
                  onChange={(e) => setMoeAdjustedSolde(e.target.value)}
                  placeholder="ex. 12500.00"
                  className={`${INPUT_CLS} mt-1`}
                />
                <p className="mt-0.5 text-[10px] text-slate-400">Utilisez un point ou une virgule comme séparateur décimal.</p>
              </div>
            )}

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Commentaire *</label>
              <textarea
                value={moeComment}
                onChange={(e) => setMoeComment(e.target.value)}
                rows={3}
                placeholder="Motivez votre décision…"
                className={`${INPUT_CLS} mt-1 resize-none`}
              />
            </div>

            <Button
              onClick={handleMoeAnalyze}
              disabled={isPending || !moeComment.trim() || (moeDecision === "MODIFY" && !moeAdjustedSolde.trim())}
              variant="primary"
              size="md"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
              Soumettre l&apos;analyse
            </Button>
          </div>
        </ActionCard>
      )}

      {/* ── MOA: validate DGD (PENDING_MOA) ──────────────────────────── */}
      {role === "MOA" && dgd?.status === "PENDING_MOA" && (
        <ActionCard
          title="Validation MOA"
          icon={<FileCheck2 className="h-4 w-4 text-violet-500" />}
          colorClass="border-violet-200 dark:border-violet-900/50"
        >
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Décision *</label>
              <div className="mt-1 flex gap-4">
                {(["APPROVE", "REJECT"] as const).map((d) => (
                  <label key={d} className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
                    <input
                      type="radio"
                      name="moa-decision"
                      value={d}
                      checked={moaDecision === d}
                      onChange={() => setMoaDecision(d)}
                      className="accent-violet-600"
                    />
                    {d === "APPROVE" ? "Approuver" : "Renvoyer au MOE"}
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Commentaire {moaDecision === "REJECT" ? "*" : "(optionnel)"}
              </label>
              <textarea
                value={moaComment}
                onChange={(e) => setMoaComment(e.target.value)}
                rows={3}
                placeholder={moaDecision === "REJECT" ? "Motivez le renvoi…" : "Observations éventuelles…"}
                className={`${INPUT_CLS} mt-1 resize-none`}
              />
            </div>

            <Button
              onClick={handleMoaValidate}
              disabled={isPending || (moaDecision === "REJECT" && !moaComment.trim())}
              variant={moaDecision === "APPROVE" ? "primary" : "danger-solid"}
              size="md"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
              {moaDecision === "APPROVE" ? "Approuver le DGD" : "Renvoyer au MOE"}
            </Button>
          </div>
        </ActionCard>
      )}

      {/* ── MOA: resolve amicably (DISPUTED) ─────────────────────────── */}
      {role === "MOA" && dgd?.status === "DISPUTED" && (
        <ActionCard
          title="Résolution amiable"
          icon={<Handshake className="h-4 w-4 text-teal-500" />}
          colorClass="border-teal-200 dark:border-teal-900/50"
        >
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Solde convenu (€ HT) *</label>
              <input
                type="text"
                value={amicableSolde}
                onChange={(e) => setAmicableSolde(e.target.value)}
                placeholder="ex. 12500.00"
                className={`${INPUT_CLS} mt-1`}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Commentaire *</label>
              <textarea
                value={amicableComment}
                onChange={(e) => setAmicableComment(e.target.value)}
                rows={3}
                placeholder="Termes de l'accord amiable…"
                className={`${INPUT_CLS} mt-1 resize-none`}
              />
            </div>
            <DocUploadRow
              label="Protocole d'accord transactionnel (PDF)"
              doc={amicableDoc}
              uploading={amicableDocUploading}
              inputRef={amicableFileRef}
              onFileChange={(file) =>
                handleDocUpload(file, setAmicableDocUploading, setAmicableDoc)
              }
            />
            <Button
              onClick={handleResolveAmicably}
              disabled={isPending || amicableDocUploading || !amicableSolde.trim() || !amicableComment.trim()}
              variant="primary"
              size="md"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Handshake className="h-4 w-4" />}
              Enregistrer la résolution amiable
            </Button>
          </div>
        </ActionCard>
      )}

      {/* ── MOA: declare litigation (DISPUTED) ───────────────────────── */}
      {role === "MOA" && dgd?.status === "DISPUTED" && (
        <ActionCard
          title="Déclarer le contentieux"
          icon={<Gavel className="h-4 w-4 text-red-500" />}
          colorClass="border-red-200 dark:border-red-900/50"
        >
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Si la négociation amiable n&apos;aboutit pas, vous pouvez déclarer le litige en contentieux judiciaire.
              Cette action est irréversible.
            </p>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Motif *</label>
              <textarea
                value={litigationComment}
                onChange={(e) => setLitigationComment(e.target.value)}
                rows={3}
                placeholder="Justifiez le passage en contentieux…"
                className={`${INPUT_CLS} mt-1 resize-none`}
              />
            </div>
            <Button
              onClick={handleDeclareLitigation}
              disabled={isPending || !litigationComment.trim()}
              variant="danger-solid"
              size="md"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />}
              Passer en contentieux
            </Button>
          </div>
        </ActionCard>
      )}

      {/* ── MOA: record court decision (IN_LITIGATION) ────────────────── */}
      {role === "MOA" && dgd?.status === "IN_LITIGATION" && (
        <ActionCard
          title="Enregistrer la décision de justice"
          icon={<Gavel className="h-4 w-4 text-purple-500" />}
          colorClass="border-purple-200 dark:border-purple-900/50"
        >
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Solde fixé par le tribunal (€ HT) *</label>
              <input
                type="text"
                value={courtSolde}
                onChange={(e) => setCourtSolde(e.target.value)}
                placeholder="ex. 11800.00"
                className={`${INPUT_CLS} mt-1`}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Commentaire *</label>
              <textarea
                value={courtComment}
                onChange={(e) => setCourtComment(e.target.value)}
                rows={3}
                placeholder="Résumé de la décision judiciaire…"
                className={`${INPUT_CLS} mt-1 resize-none`}
              />
            </div>
            <DocUploadRow
              label="Jugement (PDF)"
              doc={courtDoc}
              uploading={courtDocUploading}
              inputRef={courtFileRef}
              onFileChange={(file) =>
                handleDocUpload(file, setCourtDocUploading, setCourtDoc)
              }
            />
            <Button
              onClick={handleResolveByCourt}
              disabled={isPending || courtDocUploading || !courtSolde.trim() || !courtComment.trim()}
              variant="primary"
              size="md"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />}
              Enregistrer la décision de justice
            </Button>
          </div>
        </ActionCard>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ActionCard({
  title,
  icon,
  colorClass,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  colorClass: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`rounded border bg-white dark:bg-slate-900 ${colorClass}`}>
      <div className={`flex items-center gap-2 border-b px-4 py-2.5 ${colorClass}`}>
        {icon}
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-400">
          {title}
        </p>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

function DocUploadRow({
  label,
  doc,
  uploading,
  inputRef,
  onFileChange,
}: {
  label: string;
  doc: { path: string; name: string } | null;
  uploading: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onFileChange: (file: File) => void;
}) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label} (optionnel)</label>
      <div className="mt-1 flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileChange(file);
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          {uploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Paperclip className="h-3 w-3" />
          )}
          {uploading ? "Upload en cours…" : "Choisir un fichier"}
        </button>
        {doc && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            ✓ {doc.name}
          </span>
        )}
      </div>
    </div>
  );
}

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

