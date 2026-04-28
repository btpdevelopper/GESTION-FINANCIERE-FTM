"use client";

import { useState } from "react";
import { SituationEventType, SituationStatus } from "@prisma/client";
import {
  Send,
  ClipboardCheck,
  BadgeCheck,
  FileText,
  Check,
  X,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

type ReviewMember = {
  user: { name: string | null; email: string };
};

type ReviewEvent = {
  id: string;
  eventType: SituationEventType;
  createdAt: Date;
  member: ReviewMember;
  amountHtCents: bigint | null;
  documentName: string | null;
  documentUrl: string | null;
  correctionComment: string | null;
  decision: string | null;
  comment: string | null;
  adjustedAmountHtCents: bigint | null;
};

type Props = {
  status: SituationStatus;
  moaStatus?: string | null;
  createdAt: Date;
  orgName: string | null;
  reviews: ReviewEvent[];
  ftmDeclaredCents?: bigint;
  reviewDocumentUrls?: Record<string, string>;
};

function formatEur(cents: bigint | null | undefined): string {
  if (cents == null) return "—";
  return (Number(cents) / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function personName(member: ReviewMember): string {
  return member.user.name ?? member.user.email;
}

// ─── Horizontal progress bar ─────────────────────────────────────────────────

type StepState = "complete" | "active" | "warning" | "error" | "upcoming";

const STEPS = [
  { id: "draft", label: "Brouillon", icon: FileText },
  { id: "submit", label: "Soumission", icon: Send },
  { id: "moe", label: "Révision MOE", icon: ClipboardCheck },
  { id: "moa", label: "Validation MOA", icon: BadgeCheck },
] as const;

function getStepStates(
  status: SituationStatus,
  moaStatus?: string | null,
): Record<string, StepState> {
  switch (status) {
    case SituationStatus.DRAFT:
      return { draft: "active", submit: "upcoming", moe: "upcoming", moa: "upcoming" };
    case SituationStatus.SUBMITTED:
      return { draft: "complete", submit: "active", moe: "upcoming", moa: "upcoming" };
    case SituationStatus.MOE_CORRECTION:
      if (moaStatus === "CORRECTION_NEEDED") {
        return { draft: "complete", submit: "warning", moe: "complete", moa: "warning" };
      }
      return { draft: "complete", submit: "warning", moe: "warning", moa: "upcoming" };
    case SituationStatus.MOE_APPROVED:
      return { draft: "complete", submit: "complete", moe: "complete", moa: "active" };
    case SituationStatus.MOE_REFUSED:
      return { draft: "complete", submit: "complete", moe: "error", moa: "upcoming" };
    case SituationStatus.MOA_APPROVED:
      return { draft: "complete", submit: "complete", moe: "complete", moa: "complete" };
    case SituationStatus.MOA_REFUSED:
      return { draft: "complete", submit: "complete", moe: "complete", moa: "error" };
    default:
      return { draft: "upcoming", submit: "upcoming", moe: "upcoming", moa: "upcoming" };
  }
}

const STATE_RING: Record<StepState, string> = {
  complete: "border-green-500 bg-green-500 text-white",
  active: "border-slate-700 bg-slate-700 text-white",
  warning: "border-amber-400 bg-amber-400 text-white",
  error: "border-red-500 bg-red-500 text-white",
  upcoming: "border-slate-300 bg-white text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-500",
};

const STATE_LABEL: Record<StepState, string> = {
  complete: "text-green-600 dark:text-green-400",
  active: "text-slate-800 dark:text-slate-100 font-semibold",
  warning: "text-amber-600 dark:text-amber-400",
  error: "text-red-600 dark:text-red-400",
  upcoming: "text-slate-400 dark:text-slate-500",
};

const CONNECTOR: Record<StepState, string> = {
  complete: "bg-green-400",
  active: "bg-slate-200 dark:bg-slate-700",
  warning: "bg-amber-300",
  error: "bg-slate-200 dark:bg-slate-700",
  upcoming: "bg-slate-200 dark:bg-slate-700",
};

function HorizontalProgress({
  status,
  moaStatus,
}: {
  status: SituationStatus;
  moaStatus?: string | null;
}) {
  const states = getStepStates(status, moaStatus);

  return (
    <div className="flex items-center">
      {STEPS.map((step, i) => {
        const state = states[step.id];
        const Icon = step.icon;
        const isLast = i === STEPS.length - 1;
        const connectorState = states[STEPS[i].id];

        return (
          <div key={step.id} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1.5 min-w-0">
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${STATE_RING[state]}`}
              >
                {state === "complete" && <Check className="h-4 w-4" strokeWidth={2.5} />}
                {state === "error" && <X className="h-4 w-4" strokeWidth={2.5} />}
                {state === "warning" && <AlertTriangle className="h-3.5 w-3.5" />}
                {state === "active" && <Clock className="h-3.5 w-3.5" />}
                {state === "upcoming" && <Icon className="h-3.5 w-3.5" />}
              </div>
              <span className={`text-center text-[11px] leading-tight ${STATE_LABEL[state]}`}>
                {step.label}
              </span>
            </div>

            {!isLast && (
              <div className={`mx-1 mb-5 h-0.5 flex-1 ${CONNECTOR[connectorState]}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Event log rows ───────────────────────────────────────────────────────────

function EventRow({
  icon,
  iconBg,
  title,
  subtitle,
  isLast,
  children,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  isLast: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${iconBg}`}
        >
          {icon}
        </div>
        {!isLast && (
          <div className="mt-1 w-px flex-1 min-h-[1rem] bg-slate-200 dark:bg-slate-700" />
        )}
      </div>
      <div className={isLast ? "pb-0" : "pb-4"}>
        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{title}</p>
        <p className="text-[11px] text-slate-500">{subtitle}</p>
        {children && <div className="mt-1.5 space-y-1">{children}</div>}
      </div>
    </div>
  );
}

function SubmittedRow({
  event,
  prevMoeEvent,
  isLast,
  ftmDeclaredCents,
  docUrl,
}: {
  event: ReviewEvent;
  prevMoeEvent: ReviewEvent | null;
  isLast: boolean;
  ftmDeclaredCents: bigint;
  docUrl?: string;
}) {
  const hasMoeAdjusted = prevMoeEvent?.adjustedAmountHtCents != null;
  const acceptedMoeAmount =
    hasMoeAdjusted && event.amountHtCents === prevMoeEvent!.adjustedAmountHtCents;
  const worksCents = event.amountHtCents ?? BigInt(0);
  const declaredTotal = worksCents + ftmDeclaredCents;

  return (
    <EventRow
      icon={<Send className="h-3 w-3 text-white" />}
      iconBg="bg-slate-600"
      title="Soumis au MOE"
      subtitle={`${personName(event.member)} · ${formatDate(event.createdAt)}`}
      isLast={isLast}
    >
      <p className="text-xs text-slate-600 dark:text-slate-400">
        Montant déclaré :{" "}
        <span className="font-medium text-slate-800 dark:text-slate-200">
          {formatEur(declaredTotal)}
        </span>
      </p>
      {ftmDeclaredCents > BigInt(0) && (
        <p className="text-[11px] text-slate-500">
          dont travaux {formatEur(worksCents)} + FTMs {formatEur(ftmDeclaredCents)}
        </p>
      )}
      {hasMoeAdjusted && (
        <span
          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            acceptedMoeAmount
              ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
              : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
          }`}
        >
          {acceptedMoeAmount ? (
            <><Check className="h-3 w-3" />Montant MOE accepté</>
          ) : (
            <><AlertTriangle className="h-3 w-3" />Montant alternatif proposé</>
          )}
        </span>
      )}
      {event.correctionComment && (
        <p className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {event.correctionComment}
        </p>
      )}
      {event.documentName && (
        <p className="flex items-center gap-1 text-[11px] text-slate-500">
          <FileText className="h-3 w-3 shrink-0" />
          {docUrl ? (
            <a
              href={docUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-700 dark:hover:text-slate-300 truncate"
            >
              {event.documentName}
            </a>
          ) : (
            event.documentName
          )}
        </p>
      )}
    </EventRow>
  );
}

function MoeReviewRow({ event, isLast }: { event: ReviewEvent; isLast: boolean }) {
  const isApproved = event.decision === "APPROVED";
  const isRefused = event.decision === "REFUSED";

  const bg = isApproved ? "bg-green-600" : isRefused ? "bg-red-600" : "bg-amber-500";
  const icon = isApproved ? (
    <Check className="h-3 w-3 text-white" strokeWidth={2.5} />
  ) : isRefused ? (
    <X className="h-3 w-3 text-white" strokeWidth={2.5} />
  ) : (
    <AlertTriangle className="h-3 w-3 text-white" />
  );
  const title = isApproved
    ? "Approuvé par le MOE"
    : isRefused
    ? "Refusé par le MOE"
    : "Correction demandée par le MOE";

  return (
    <EventRow
      icon={icon}
      iconBg={bg}
      title={title}
      subtitle={`${personName(event.member)} · ${formatDate(event.createdAt)}`}
      isLast={isLast}
    >
      {event.adjustedAmountHtCents != null && (
        <p className="text-xs text-slate-600 dark:text-slate-400">
          Montant ajusté :{" "}
          <span className="font-medium text-amber-700 dark:text-amber-400">
            {formatEur(event.adjustedAmountHtCents)}
          </span>
        </p>
      )}
      {event.comment && (
        <p className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {event.comment}
        </p>
      )}
    </EventRow>
  );
}

function MoaValidatedRow({ event, isLast }: { event: ReviewEvent; isLast: boolean }) {
  const isApproved = event.decision === "APPROVED";
  const isCorrection = event.decision === "CORRECTION_NEEDED";

  const bg = isApproved ? "bg-green-600" : isCorrection ? "bg-amber-500" : "bg-red-600";
  const icon = isApproved ? (
    <Check className="h-3 w-3 text-white" strokeWidth={2.5} />
  ) : isCorrection ? (
    <AlertTriangle className="h-3 w-3 text-white" />
  ) : (
    <X className="h-3 w-3 text-white" strokeWidth={2.5} />
  );
  const title = isApproved
    ? "Validé par le MOA"
    : isCorrection
    ? "Correction demandée par le MOA"
    : "Refusé par le MOA";

  return (
    <EventRow
      icon={icon}
      iconBg={bg}
      title={title}
      subtitle={`${personName(event.member)} · ${formatDate(event.createdAt)}`}
      isLast={isLast}
    >
      {event.comment && (
        <p className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {event.comment}
        </p>
      )}
    </EventRow>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

const VISIBLE_LIMIT = 4;

export function SituationTimeline({
  status,
  moaStatus,
  createdAt,
  orgName,
  reviews,
  ftmDeclaredCents = BigInt(0),
  reviewDocumentUrls = {},
}: Props) {
  const [expanded, setExpanded] = useState(false);

  // Build a flat list: synthetic draft entry + all review events
  type Item =
    | { kind: "draft" }
    | { kind: "review"; event: ReviewEvent; reviewIndex: number };

  const allItems: Item[] = [
    { kind: "draft" },
    ...reviews.map((event, reviewIndex) => ({
      kind: "review" as const,
      event,
      reviewIndex,
    })),
  ];

  const needsCollapse = allItems.length > VISIBLE_LIMIT;
  const hiddenCount = needsCollapse ? allItems.length - VISIBLE_LIMIT : 0;
  const visibleItems = needsCollapse && !expanded
    ? allItems.slice(-VISIBLE_LIMIT)
    : allItems;

  function renderItem(item: Item, isLast: boolean) {
    if (item.kind === "draft") {
      return (
        <EventRow
          key="draft"
          icon={<FileText className="h-3 w-3 text-slate-500 dark:text-slate-400" />}
          iconBg="bg-slate-100 dark:bg-slate-700"
          title="Brouillon créé"
          subtitle={`${orgName ?? "Entreprise"} · ${formatDate(createdAt)}`}
          isLast={isLast}
        />
      );
    }

    const { event, reviewIndex } = item;
    const prevMoeEvent =
      event.eventType === "SUBMITTED"
        ? (reviews
            .slice(0, reviewIndex)
            .reverse()
            .find((r) => r.eventType === "MOE_REVIEWED") ?? null)
        : null;

    if (event.eventType === "SUBMITTED") {
      return (
        <SubmittedRow
          key={event.id}
          event={event}
          prevMoeEvent={prevMoeEvent}
          isLast={isLast}
          ftmDeclaredCents={ftmDeclaredCents}
          docUrl={reviewDocumentUrls[event.id]}
        />
      );
    }
    if (event.eventType === "MOE_REVIEWED") {
      return <MoeReviewRow key={event.id} event={event} isLast={isLast} />;
    }
    if (event.eventType === "MOA_VALIDATED") {
      return <MoaValidatedRow key={event.id} event={event} isLast={isLast} />;
    }
    return null;
  }

  return (
    <div className="rounded border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
      {/* Horizontal progress */}
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <div className="max-w-sm mx-auto">
          <HorizontalProgress status={status} moaStatus={moaStatus} />
        </div>
      </div>

      {/* Event log */}
      <div className="px-4 py-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Historique
        </p>

        {/* Collapse toggle */}
        {needsCollapse && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mb-3 flex items-center gap-1.5 text-[11px] font-medium text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            {expanded ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" />
                Masquer les actions anciennes
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" />
                {hiddenCount} action{hiddenCount > 1 ? "s" : ""} masquée{hiddenCount > 1 ? "s" : ""}
              </>
            )}
          </button>
        )}

        {reviews.length === 0 && (
          <p className="mt-1 text-xs italic text-slate-400">Aucune soumission encore effectuée.</p>
        )}

        {visibleItems.map((item, i) => {
          const isLast = i === visibleItems.length - 1;
          return renderItem(item, isLast);
        })}
      </div>
    </div>
  );
}
