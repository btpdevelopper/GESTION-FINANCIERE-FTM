import { ForecastEventType, ForecastStatus } from "@prisma/client";
import { Send, ClipboardCheck, BadgeCheck, FileBarChart, Check, X, AlertTriangle, Clock } from "lucide-react";

type ReviewMember = { user: { name: string | null; email: string } };

type ReviewEvent = {
  id: string;
  eventType: ForecastEventType;
  createdAt: Date;
  member: ReviewMember;
  decision: string | null;
  comment: string | null;
  correctionComment: string | null;
};

type Props = {
  status: ForecastStatus;
  indice: number;
  createdAt: Date;
  orgName: string | null;
  reviews: ReviewEvent[];
};

function formatDate(d: Date): string {
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric", month: "short", year: "numeric",
  });
}

function personName(m: ReviewMember): string {
  return m.user.name ?? m.user.email;
}

// ─── Horizontal progress ─────────────────────────────────────────────────────

type StepState = "complete" | "active" | "warning" | "error" | "upcoming";

const STEPS = [
  { id: "draft",  label: "Brouillon",     icon: FileBarChart },
  { id: "submit", label: "Soumission",    icon: Send },
  { id: "moe",    label: "Révision MOE",  icon: ClipboardCheck },
  { id: "moa",    label: "Validation MOA",icon: BadgeCheck },
] as const;

function getStates(status: ForecastStatus): Record<string, StepState> {
  switch (status) {
    case ForecastStatus.DRAFT:          return { draft: "active",   submit: "upcoming", moe: "upcoming", moa: "upcoming" };
    case ForecastStatus.SUBMITTED:      return { draft: "complete", submit: "active",   moe: "upcoming", moa: "upcoming" };
    case ForecastStatus.MOE_CORRECTION: return { draft: "complete", submit: "warning",  moe: "warning",  moa: "upcoming" };
    case ForecastStatus.MOE_APPROVED:   return { draft: "complete", submit: "complete", moe: "complete", moa: "active"   };
    case ForecastStatus.MOE_REFUSED:    return { draft: "complete", submit: "complete", moe: "error",    moa: "upcoming" };
    case ForecastStatus.MOA_APPROVED:   return { draft: "complete", submit: "complete", moe: "complete", moa: "complete" };
    case ForecastStatus.MOA_REFUSED:    return { draft: "complete", submit: "complete", moe: "complete", moa: "error"    };
  }
}

const RING: Record<StepState, string> = {
  complete: "border-green-500 bg-green-500 text-white",
  active:   "border-slate-700 bg-slate-700 text-white",
  warning:  "border-amber-400 bg-amber-400 text-white",
  error:    "border-red-500 bg-red-500 text-white",
  upcoming: "border-slate-300 bg-white text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-500",
};

const LABEL: Record<StepState, string> = {
  complete: "text-green-600 dark:text-green-400",
  active:   "text-slate-800 dark:text-slate-100 font-semibold",
  warning:  "text-amber-600 dark:text-amber-400",
  error:    "text-red-600 dark:text-red-400",
  upcoming: "text-slate-400 dark:text-slate-500",
};

const CONNECTOR: Record<StepState, string> = {
  complete: "bg-green-400",
  active:   "bg-slate-200 dark:bg-slate-700",
  warning:  "bg-amber-300",
  error:    "bg-slate-200 dark:bg-slate-700",
  upcoming: "bg-slate-200 dark:bg-slate-700",
};

function HorizontalProgress({ status }: { status: ForecastStatus }) {
  const states = getStates(status);
  return (
    <div className="flex items-center">
      {STEPS.map((step, i) => {
        const state = states[step.id];
        const Icon = step.icon;
        const isLast = i === STEPS.length - 1;
        return (
          <div key={step.id} className="flex flex-1 items-center">
            <div className="flex flex-col items-center gap-1.5 min-w-0">
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${RING[state]}`}>
                {state === "complete" && <Check className="h-4 w-4" strokeWidth={2.5} />}
                {state === "error"    && <X className="h-4 w-4" strokeWidth={2.5} />}
                {state === "warning"  && <AlertTriangle className="h-3.5 w-3.5" />}
                {state === "active"   && <Clock className="h-3.5 w-3.5" />}
                {state === "upcoming" && <Icon className="h-3.5 w-3.5" />}
              </div>
              <span className={`text-center text-[11px] leading-tight ${LABEL[state]}`}>{step.label}</span>
            </div>
            {!isLast && <div className={`mx-1 mb-5 h-0.5 flex-1 ${CONNECTOR[state]}`} />}
          </div>
        );
      })}
    </div>
  );
}

// ─── Event log ───────────────────────────────────────────────────────────────

function EventRow({ icon, iconBg, title, subtitle, isLast, children }: {
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
        <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${iconBg}`}>
          {icon}
        </div>
        {!isLast && <div className="mt-1 w-px flex-1 min-h-[1rem] bg-slate-200 dark:bg-slate-700" />}
      </div>
      <div className={isLast ? "pb-0" : "pb-4"}>
        <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{title}</p>
        <p className="text-[11px] text-slate-500">{subtitle}</p>
        {children && <div className="mt-1.5 space-y-1">{children}</div>}
      </div>
    </div>
  );
}

export function ForecastTimeline({ status, indice, createdAt, orgName, reviews }: Props) {
  return (
    <div className="rounded border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-800">
        <HorizontalProgress status={status} />
      </div>

      <div className="px-4 py-4">
        <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Historique — Indice {indice}
        </p>

        <EventRow
          icon={<FileBarChart className="h-3 w-3 text-slate-500 dark:text-slate-400" />}
          iconBg="bg-slate-100 dark:bg-slate-700"
          title="Brouillon créé"
          subtitle={`${orgName ?? "Entreprise"} · ${formatDate(createdAt)}`}
          isLast={reviews.length === 0}
        />

        {reviews.length === 0 && (
          <p className="mt-1 text-xs italic text-slate-400">Aucune soumission encore effectuée.</p>
        )}

        {reviews.map((event, i) => {
          const isLast = i === reviews.length - 1;

          if (event.eventType === "SUBMITTED") {
            return (
              <EventRow
                key={event.id}
                icon={<Send className="h-3 w-3 text-white" />}
                iconBg="bg-slate-600"
                title="Soumis au MOE"
                subtitle={`${personName(event.member)} · ${formatDate(event.createdAt)}`}
                isLast={isLast}
              >
                {event.correctionComment && (
                  <p className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {event.correctionComment}
                  </p>
                )}
              </EventRow>
            );
          }

          if (event.eventType === "MOE_REVIEWED") {
            const isApproved = event.decision === "APPROVED";
            const isRefused = event.decision === "REFUSED";
            return (
              <EventRow
                key={event.id}
                icon={
                  isApproved ? <Check className="h-3 w-3 text-white" strokeWidth={2.5} />
                  : isRefused ? <X className="h-3 w-3 text-white" strokeWidth={2.5} />
                  : <AlertTriangle className="h-3 w-3 text-white" />
                }
                iconBg={isApproved ? "bg-green-600" : isRefused ? "bg-red-600" : "bg-amber-500"}
                title={isApproved ? "Approuvé par le MOE" : isRefused ? "Refusé par le MOE" : "Correction demandée par le MOE"}
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

          if (event.eventType === "MOA_VALIDATED") {
            const isApproved = event.decision === "APPROVED";
            return (
              <EventRow
                key={event.id}
                icon={isApproved ? <Check className="h-3 w-3 text-white" strokeWidth={2.5} /> : <X className="h-3 w-3 text-white" strokeWidth={2.5} />}
                iconBg={isApproved ? "bg-green-600" : "bg-red-600"}
                title={isApproved ? "Validé par le MOA" : "Refusé par le MOA"}
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
          return null;
        })}
      </div>
    </div>
  );
}
