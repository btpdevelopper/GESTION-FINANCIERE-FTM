"use client";

import { useState, useTransition } from "react";
import {
  submitPenaltyAction,
  updatePenaltyDraftAction,
  moaReviewPenaltyAction,
  cancelPenaltyAction,
  contestPenaltyAction,
  maintainPenaltyAction,
} from "@/server/penalties/penalty-actions";
import { StatusBadge, Button, Input, Select } from "@/components/ui";
import { ChevronDown, ChevronUp, Clock, CheckCircle, XCircle, AlertTriangle, Pencil } from "lucide-react";
import { PenaltyStatus, ProjectRole } from "@prisma/client";

type PenaltyReviewRow = {
  id: string;
  action: string;
  comment: string | null;
  createdAt: Date;
  member: { user: { name: string | null; email: string } };
};

type PenaltyRow = {
  id: string;
  label: string;
  justification: string;
  amountType: string;
  inputValue: bigint;
  frozenAmountCents: bigint | null;
  applicationTarget: string;
  situationId: string | null;
  status: PenaltyStatus;
  createdAt: Date;
  situation: { id: string; numero: number; periodLabel: string } | null;
  createdBy: { user: { name: string | null; email: string } };
  reviews: PenaltyReviewRow[];
};

interface Props {
  penalty: PenaltyRow;
  projectId: string;
  orgId: string;
  pmRole: ProjectRole;
  canCreate: boolean;
  canMoaValidate: boolean;
  canContest: boolean;
  marcheTotalCents: number;
  approvedFtmTotalCents: number;
}

function formatEurNum(cents: number): string {
  return (cents / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function formatEur(cents: bigint | null | undefined): string {
  if (cents == null) return "—";
  return (Number(cents) / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

function formatPeriod(label: string): string {
  if (/^\d{4}-\d{2}$/.test(label)) {
    const [y, m] = label.split("-");
    const s = new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString("fr-FR", {
      month: "long",
      year: "numeric",
    });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return label;
}

const STATUS_LABEL: Record<PenaltyStatus, string> = {
  DRAFT: "Brouillon",
  SUBMITTED: "Soumis au MOA",
  MOA_APPROVED: "Approuvé MOA",
  MOA_REFUSED: "Refusé MOA",
  CONTESTED: "Contesté",
  CANCELLED: "Annulé",
  MAINTAINED: "Maintenu",
};

const AMOUNT_TYPE_LABEL: Record<string, string> = {
  FIXED: "Montant fixe",
  PCT_BASE_MARCHE: "% marché de base",
  PCT_ACTUAL_MARCHE: "% marché actuel",
};

const REVIEW_ACTION_LABEL: Record<string, string> = {
  SUBMITTED: "Soumis",
  MOA_APPROVED: "Approuvé MOA",
  MOA_REFUSED: "Refusé MOA",
  CONTESTED: "Contesté",
  CANCELLED: "Annulé",
  MAINTAINED: "Maintenu",
};

export function PenaltyCard({
  penalty,
  projectId,
  orgId,
  canCreate,
  canMoaValidate,
  canContest,
  marcheTotalCents,
  approvedFtmTotalCents,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Edit draft state
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(penalty.label);
  const [editJustification, setEditJustification] = useState(penalty.justification);
  const [editAmountType, setEditAmountType] = useState<"FIXED" | "PCT_BASE_MARCHE" | "PCT_ACTUAL_MARCHE">(
    penalty.amountType as "FIXED" | "PCT_BASE_MARCHE" | "PCT_ACTUAL_MARCHE",
  );
  const [editInputValue, setEditInputValue] = useState(
    String(Number(penalty.inputValue) / 100),
  );
  const [editTarget, setEditTarget] = useState<"SITUATION" | "DGD">(
    penalty.applicationTarget as "SITUATION" | "DGD",
  );
  const [editSituationId, setEditSituationId] = useState(penalty.situationId ?? "");

  // Live amount preview in edit form
  const editParsed = parseFloat(editInputValue);
  let editPreviewCents = 0;
  if (!isNaN(editParsed) && editParsed > 0) {
    if (editAmountType === "FIXED") {
      editPreviewCents = Math.round(editParsed * 100);
    } else {
      const base = editAmountType === "PCT_ACTUAL_MARCHE"
        ? marcheTotalCents + approvedFtmTotalCents
        : marcheTotalCents;
      editPreviewCents = Math.round((base * editParsed) / 100);
    }
  }

  // Other action form states
  const [moaDecision, setMoaDecision] = useState<"APPROVED" | "REFUSED" | null>(null);
  const [moaComment, setMoaComment] = useState("");
  const [contestJustification, setContestJustification] = useState("");
  const [showContestForm, setShowContestForm] = useState(false);
  const [maintainComment, setMaintainComment] = useState("");
  const [showMaintainForm, setShowMaintainForm] = useState(false);

  const isActive = penalty.status === PenaltyStatus.MOA_APPROVED || penalty.status === PenaltyStatus.MAINTAINED;

  function run(action: () => Promise<unknown>) {
    setError(null);
    startTransition(async () => {
      try {
        await action();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue.");
      }
    });
  }

  return (
    <div
      className={`rounded border bg-white dark:bg-slate-900 ${
        penalty.status === PenaltyStatus.CONTESTED
          ? "border-l-4 border-orange-400 border-r-slate-200 border-t-slate-200 border-b-slate-200 dark:border-r-slate-700 dark:border-t-slate-700 dark:border-b-slate-700"
          : penalty.status === PenaltyStatus.SUBMITTED
          ? "border-l-4 border-blue-400 border-r-slate-200 border-t-slate-200 border-b-slate-200 dark:border-r-slate-700 dark:border-t-slate-700 dark:border-b-slate-700"
          : "border-slate-200 dark:border-slate-700"
      }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
              {penalty.label}
            </span>
            <StatusBadge status={penalty.status} label={STATUS_LABEL[penalty.status]} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
            <span>{AMOUNT_TYPE_LABEL[penalty.amountType]}</span>
            {penalty.frozenAmountCents != null ? (
              <span className={`font-semibold ${isActive ? "text-red-600 dark:text-red-400" : ""}`}>
                {formatEur(penalty.frozenAmountCents)}
              </span>
            ) : (
              <span className="italic">Montant non calculé (brouillon)</span>
            )}
            {penalty.situation && (
              <span>
                → Situation n°{penalty.situation.numero} ({formatPeriod(penalty.situation.periodLabel)})
              </span>
            )}
            {penalty.applicationTarget === "DGD" && <span>→ DGD</span>}
            <span>{new Date(penalty.createdAt).toLocaleDateString("fr-FR")}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {canCreate && penalty.status === PenaltyStatus.DRAFT && !editing && (
            <button
              onClick={() => { setEditing(true); setExpanded(true); }}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              title="Modifier"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-100 p-4 space-y-4 dark:border-slate-800">
          {/* Justification */}
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">Justification</p>
            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
              {penalty.justification}
            </p>
          </div>

          {/* Amount detail */}
          {penalty.amountType !== "FIXED" && (
            <div className="text-xs text-slate-500">
              <span>
                {penalty.amountType === "PCT_BASE_MARCHE" ? "% marché de base" : "% marché actuel"}
                {" : "}
                <strong>{(Number(penalty.inputValue) / 100).toFixed(2)} %</strong>
              </span>
            </div>
          )}

          {/* Review timeline */}
          {penalty.reviews.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 mb-2">Historique</p>
              <div className="space-y-2">
                {penalty.reviews.map((r) => (
                  <div key={r.id} className="flex gap-2.5 text-xs">
                    <div className="mt-0.5 shrink-0">
                      {r.action === "MOA_APPROVED" || r.action === "MAINTAINED" ? (
                        <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                      ) : r.action === "MOA_REFUSED" || r.action === "CANCELLED" ? (
                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                      ) : r.action === "CONTESTED" ? (
                        <AlertTriangle className="h-3.5 w-3.5 text-orange-500" />
                      ) : (
                        <Clock className="h-3.5 w-3.5 text-blue-500" />
                      )}
                    </div>
                    <div>
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {REVIEW_ACTION_LABEL[r.action]}
                      </span>
                      <span className="text-slate-400">
                        {" par "}
                        {r.member.user.name ?? r.member.user.email}
                        {" · "}
                        {new Date(r.createdAt).toLocaleDateString("fr-FR")}
                      </span>
                      {r.comment && (
                        <p className="mt-0.5 text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 rounded px-2 py-1 whitespace-pre-wrap">
                          {r.comment}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

          {/* Action area */}
          <div className="flex flex-wrap gap-2">
            {/* MOE: Edit + Submit DRAFT */}
            {canCreate && penalty.status === PenaltyStatus.DRAFT && (
              editing ? (
                <div className="w-full space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Libellé</label>
                      <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} required />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Type de montant</label>
                      <Select value={editAmountType} onChange={(e) => setEditAmountType(e.target.value as typeof editAmountType)}>
                        <option value="FIXED">Montant fixe (€)</option>
                        <option value="PCT_BASE_MARCHE">% du marché de base</option>
                        <option value="PCT_ACTUAL_MARCHE">% du marché actuel (base + FTMs)</option>
                      </Select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        {editAmountType === "FIXED" ? "Montant (€ HT)" : "Pourcentage (%)"}
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={editInputValue}
                        onChange={(e) => setEditInputValue(e.target.value)}
                        required
                      />
                      {editPreviewCents > 0 && (
                        <p className="mt-1 text-xs text-slate-500">
                          Montant calculé :{" "}
                          <strong className="text-red-600 dark:text-red-400">{formatEurNum(editPreviewCents)}</strong>
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Application</label>
                      <Select value={editTarget} onChange={(e) => setEditTarget(e.target.value as "SITUATION" | "DGD")}>
                        <option value="SITUATION">Sur une situation de travaux</option>
                        <option value="DGD">Au DGD (décompte final)</option>
                      </Select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">Justification</label>
                      <textarea
                        value={editJustification}
                        onChange={(e) => setEditJustification(e.target.value)}
                        rows={3}
                        required
                        className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-500 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={isPending}
                      onClick={() =>
                        run(async () => {
                          const rawInput = editAmountType === "FIXED"
                            ? Math.round(parseFloat(editInputValue) * 100)
                            : Math.round(parseFloat(editInputValue) * 100);
                          await updatePenaltyDraftAction({
                            penaltyId: penalty.id,
                            projectId,
                            label: editLabel,
                            justification: editJustification,
                            amountType: editAmountType,
                            inputValue: rawInput,
                            applicationTarget: editTarget,
                            situationId: editTarget === "SITUATION" && editSituationId ? editSituationId : null,
                          });
                          setEditing(false);
                        })
                      }
                    >
                      {isPending ? "Enregistrement…" : "Enregistrer"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={isPending}>
                      Abandonner les modifications
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  disabled={isPending}
                  onClick={() =>
                    run(() => submitPenaltyAction({ penaltyId: penalty.id, projectId }))
                  }
                >
                  Soumettre au MOA
                </Button>
              )
            )}

            {/* MOA: review SUBMITTED */}
            {canMoaValidate && penalty.status === PenaltyStatus.SUBMITTED && (
              <div className="w-full space-y-2">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() => setMoaDecision("APPROVED")}
                  >
                    Approuver
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={isPending}
                    onClick={() => setMoaDecision("REFUSED")}
                  >
                    Refuser
                  </Button>
                </div>
                {moaDecision && (
                  <div className="space-y-2">
                    <textarea
                      value={moaComment}
                      onChange={(e) => setMoaComment(e.target.value)}
                      rows={2}
                      placeholder={moaDecision === "REFUSED" ? "Commentaire obligatoire…" : "Commentaire (optionnel)…"}
                      className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={moaDecision === "REFUSED" ? "danger-solid" : "primary"}
                        disabled={isPending || (moaDecision === "REFUSED" && !moaComment.trim())}
                        onClick={() =>
                          run(() =>
                            moaReviewPenaltyAction({
                              penaltyId: penalty.id,
                              projectId,
                              decision: moaDecision,
                              comment: moaComment || null,
                            }),
                          )
                        }
                      >
                        {isPending ? "…" : moaDecision === "APPROVED" ? "Confirmer l'approbation" : "Confirmer le refus"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setMoaDecision(null)}>
                        Annuler
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* MOE/MOA: Maintain after contest */}
            {(canCreate || canMoaValidate) && penalty.status === PenaltyStatus.CONTESTED && (
              <>
                {!showMaintainForm ? (
                  <Button size="sm" variant="primary" onClick={() => setShowMaintainForm(true)}>
                    Maintenir la pénalité
                  </Button>
                ) : (
                  <div className="w-full space-y-2">
                    <textarea
                      value={maintainComment}
                      onChange={(e) => setMaintainComment(e.target.value)}
                      rows={2}
                      placeholder="Motif du maintien (optionnel)…"
                      className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={isPending}
                        onClick={() =>
                          run(() =>
                            maintainPenaltyAction({
                              penaltyId: penalty.id,
                              projectId,
                              comment: maintainComment || null,
                            }),
                          )
                        }
                      >
                        Confirmer le maintien
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowMaintainForm(false)}>
                        Annuler
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ENTREPRISE: Contest MOA_APPROVED */}
            {canContest && penalty.status === PenaltyStatus.MOA_APPROVED && (
              <>
                {!showContestForm ? (
                  <Button size="sm" variant="danger" onClick={() => setShowContestForm(true)}>
                    Contester
                  </Button>
                ) : (
                  <div className="w-full space-y-2">
                    <textarea
                      value={contestJustification}
                      onChange={(e) => setContestJustification(e.target.value)}
                      rows={3}
                      placeholder="Justification de la contestation (obligatoire, 10 caractères min.)…"
                      className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="danger-solid"
                        disabled={isPending || contestJustification.trim().length < 10}
                        onClick={() =>
                          run(() =>
                            contestPenaltyAction({
                              penaltyId: penalty.id,
                              projectId,
                              justification: contestJustification,
                            }),
                          )
                        }
                      >
                        {isPending ? "…" : "Confirmer la contestation"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowContestForm(false)}>
                        Annuler
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Cancel penalty — MOE on DRAFT only, MOA on any non-terminal */}
            {canCreate && penalty.status === PenaltyStatus.DRAFT && !editing && (
              <Button
                size="sm"
                variant="danger"
                disabled={isPending}
                onClick={() =>
                  run(() => cancelPenaltyAction({ penaltyId: penalty.id, projectId, comment: null }))
                }
              >
                Supprimer le brouillon
              </Button>
            )}
            {canMoaValidate &&
              !(["MOA_REFUSED", "CANCELLED", "MAINTAINED"] as string[]).includes(penalty.status) && (
              <Button
                size="sm"
                variant="danger"
                disabled={isPending}
                onClick={() =>
                  run(() => cancelPenaltyAction({ penaltyId: penalty.id, projectId, comment: null }))
                }
              >
                Annuler la pénalité
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
