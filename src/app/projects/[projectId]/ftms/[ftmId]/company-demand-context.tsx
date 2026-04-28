"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  MessageSquareText,
  Clock,
  CheckCircle2,
  CalendarClock,
  User,
} from "lucide-react";

type Props = {
  companyName: string;
  submitterName: string | null;
  description: string;
  documents: { id: string; name: string; url: string }[];
  demandTitle: string | null;
  ftmTitle: string;
  requestedDate?: Date | string | null;
  submittedAt: Date | string;
  approvedAt?: Date | string | null;
};

function fmtAbsolute(d: Date | string): string {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function fmtRelative(d: Date | string): string {
  const ms = Date.now() - new Date(d).getTime();
  const days = Math.round(ms / (1000 * 60 * 60 * 24));
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "il y a 1 jour";
  if (days < 30) return `il y a ${days} jours`;
  const months = Math.round(days / 30);
  if (months === 1) return "il y a 1 mois";
  if (months < 12) return `il y a ${months} mois`;
  const years = Math.round(days / 365);
  return years === 1 ? "il y a 1 an" : `il y a ${years} ans`;
}

function daysBetween(from: Date | string, to: Date | string): number {
  return Math.max(
    0,
    Math.round(
      (new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24),
    ),
  );
}

export function CompanyDemandContext({
  companyName,
  submitterName,
  description,
  documents,
  demandTitle,
  ftmTitle,
  requestedDate,
  submittedAt,
  approvedAt,
}: Props) {
  const [open, setOpen] = useState(true);
  const titleDiverged = demandTitle && demandTitle.trim() !== ftmTitle.trim();
  const turnaroundDays = approvedAt ? daysBetween(submittedAt, approvedAt) : null;

  return (
    <div className="mb-6 rounded border border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/15">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-amber-100/40 dark:hover:bg-amber-950/30"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <MessageSquareText className="h-4 w-4 shrink-0 text-amber-700 dark:text-amber-500" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-sm font-semibold text-amber-900 dark:text-amber-300">
                Demande initiale — {companyName}
              </span>
              <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                <CheckCircle2 className="h-2.5 w-2.5" />
                Approuvée
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-amber-700/80 dark:text-amber-500/80">
              {submitterName && (
                <span className="inline-flex items-center gap-1">
                  <User className="h-2.5 w-2.5" />
                  {submitterName}
                </span>
              )}
              <span title={fmtAbsolute(submittedAt)}>
                Soumise {fmtRelative(submittedAt)}
              </span>
              {turnaroundDays != null && (
                <span>
                  · Approuvée en {turnaroundDays === 0 ? "moins d'un jour" : turnaroundDays === 1 ? "1 jour" : `${turnaroundDays} jours`}
                </span>
              )}
              {documents.length > 0 && (
                <span>· {documents.length} pièce{documents.length > 1 ? "s" : ""} jointe{documents.length > 1 ? "s" : ""}</span>
              )}
            </div>
          </div>
        </div>
        <span className="shrink-0 text-amber-600 dark:text-amber-500">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {/* Body — collapsible */}
      {open && (
        <div className="animate-slide-up space-y-3 border-t border-amber-200/60 px-4 py-3 dark:border-amber-900/30">
          {titleDiverged && (
            <div className="flex flex-wrap items-baseline gap-x-2 text-xs">
              <span className="font-semibold uppercase tracking-wider text-amber-900/60 dark:text-amber-500/60">
                Titre demandé
              </span>
              <span className="text-amber-900 dark:text-amber-300">{demandTitle}</span>
            </div>
          )}

          <div className="whitespace-pre-wrap rounded border border-amber-100 bg-white/70 p-3 text-sm leading-relaxed text-amber-900 dark:border-amber-900/30 dark:bg-black/20 dark:text-amber-200/90">
            {description}
          </div>

          {(requestedDate || approvedAt) && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-amber-800 dark:text-amber-400">
              {requestedDate && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="h-3 w-3" />
                  <span className="font-medium">Réponse souhaitée :</span>
                  {fmtAbsolute(requestedDate)}
                </span>
              )}
              {approvedAt && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="h-3 w-3" />
                  <span className="font-medium">Approuvée le :</span>
                  {fmtAbsolute(approvedAt)}
                </span>
              )}
            </div>
          )}

          {documents.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-amber-900/60 dark:text-amber-500/60">
                Documents joints à la demande
              </p>
              <div className="flex flex-wrap gap-1.5">
                {documents.map((doc) => (
                  <a
                    key={doc.id}
                    href={`/api/ftm-doc?path=${encodeURIComponent(doc.url)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded border border-amber-200 bg-amber-100/50 px-2 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-200 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-400 dark:hover:bg-amber-900/60"
                  >
                    <FileText className="h-3 w-3" />
                    {doc.name}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
