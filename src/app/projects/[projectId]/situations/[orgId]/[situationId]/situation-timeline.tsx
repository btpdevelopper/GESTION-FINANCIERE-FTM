import { SituationStatus } from "@prisma/client";
import { Check, X, AlertTriangle, Clock, FileText, Send, ClipboardCheck, BadgeCheck, Hourglass } from "lucide-react";

type StepState = "complete" | "active" | "warning" | "error" | "upcoming";

type Step = {
  id: string;
  label: string;
  role: string;
  state: StepState;
  date: Date | null;
  person: string | null;
  note: string | null;
};

type SituationForTimeline = {
  status: SituationStatus;
  createdAt: Date;
  submittedAt: Date | null;
  submittedBy: { user: { name: string | null; email: string } } | null;
  moeStatus: string | null;
  moeReviewedAt: Date | null;
  moeReviewedBy: { user: { name: string | null; email: string } } | null;
  moeComment: string | null;
  moaStatus: string | null;
  moaValidatedAt: Date | null;
  moaValidatedBy: { user: { name: string | null; email: string } } | null;
  moaComment: string | null;
  organization: { name: string } | null;
};

function buildSteps(s: SituationForTimeline): Step[] {
  const st = s.status;

  const draftState: StepState =
    st === SituationStatus.DRAFT ? "active" : "complete";

  let submitState: StepState = "upcoming";
  if (st === SituationStatus.SUBMITTED) submitState = "active";
  else if (st === SituationStatus.MOE_CORRECTION) submitState = "warning";
  else if (
    st === SituationStatus.MOE_APPROVED ||
    st === SituationStatus.MOE_REFUSED ||
    st === SituationStatus.MOA_APPROVED ||
    st === SituationStatus.MOA_REFUSED
  )
    submitState = "complete";

  let moeState: StepState = "upcoming";
  if (st === SituationStatus.SUBMITTED) moeState = "active";
  else if (st === SituationStatus.MOE_CORRECTION) moeState = "warning";
  else if (st === SituationStatus.MOE_REFUSED) moeState = "error";
  else if (
    st === SituationStatus.MOE_APPROVED ||
    st === SituationStatus.MOA_APPROVED ||
    st === SituationStatus.MOA_REFUSED
  )
    moeState = "complete";

  let moaState: StepState = "upcoming";
  if (st === SituationStatus.MOE_APPROVED) moaState = "active";
  else if (st === SituationStatus.MOA_REFUSED) moaState = "error";
  else if (st === SituationStatus.MOA_APPROVED) moaState = "complete";

  const personName = (u: { name: string | null; email: string } | null) =>
    u ? (u.name ?? u.email) : null;

  return [
    {
      id: "draft",
      label: "Brouillon",
      role: s.organization?.name ?? "Entreprise",
      state: draftState,
      date: s.createdAt,
      person: null,
      note: null,
    },
    {
      id: "submit",
      label: "Soumis au MOE",
      role: "Entreprise",
      state: submitState,
      date: s.submittedAt,
      person: personName(s.submittedBy?.user ?? null),
      note:
        st === SituationStatus.MOE_CORRECTION
          ? "Correction demandée — en attente de resoumission"
          : null,
    },
    {
      id: "moe",
      label:
        st === SituationStatus.MOE_REFUSED
          ? "Refusé par le MOE"
          : st === SituationStatus.MOE_CORRECTION
          ? "Correction demandée"
          : "Révision MOE",
      role: "MOE",
      state: moeState,
      date: s.moeReviewedAt,
      person: personName(s.moeReviewedBy?.user ?? null),
      note:
        moeState === "error" || moeState === "warning"
          ? s.moeComment
          : null,
    },
    {
      id: "moa",
      label:
        st === SituationStatus.MOA_REFUSED
          ? "Refusé par le MOA"
          : st === SituationStatus.MOA_APPROVED
          ? "Validé par le MOA"
          : "Validation MOA",
      role: "MOA",
      state: moaState,
      date: s.moaValidatedAt,
      person: personName(s.moaValidatedBy?.user ?? null),
      note: moaState === "error" ? s.moaComment : null,
    },
  ];
}

const STEP_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  draft: FileText,
  submit: Send,
  moe: ClipboardCheck,
  moa: BadgeCheck,
};

const STATE_STYLES: Record<
  StepState,
  { ring: string; bg: string; text: string; connector: string }
> = {
  complete: {
    ring: "border-green-500",
    bg: "bg-green-500",
    text: "text-green-700 dark:text-green-400",
    connector: "bg-green-400",
  },
  active: {
    ring: "border-indigo-500",
    bg: "bg-indigo-500",
    text: "text-indigo-700 dark:text-indigo-400",
    connector: "bg-slate-200 dark:bg-slate-700",
  },
  warning: {
    ring: "border-amber-400",
    bg: "bg-amber-400",
    text: "text-amber-700 dark:text-amber-400",
    connector: "bg-slate-200 dark:bg-slate-700",
  },
  error: {
    ring: "border-red-500",
    bg: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
    connector: "bg-slate-200 dark:bg-slate-700",
  },
  upcoming: {
    ring: "border-slate-300 dark:border-slate-700",
    bg: "bg-slate-200 dark:bg-slate-700",
    text: "text-slate-400 dark:text-slate-500",
    connector: "bg-slate-200 dark:bg-slate-700",
  },
};

function StepIcon({ id, state }: { id: string; state: StepState }) {
  const styles = STATE_STYLES[state];
  const Icon = STEP_ICONS[id];

  return (
    <div
      className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 ${styles.ring} ${
        state === "upcoming"
          ? "bg-white dark:bg-slate-900"
          : state === "complete"
          ? "bg-green-500"
          : state === "error"
          ? "bg-red-500"
          : state === "warning"
          ? "bg-amber-400"
          : "bg-indigo-500"
      }`}
    >
      {state === "complete" && <Check className="h-5 w-5 text-white" strokeWidth={2.5} />}
      {state === "error" && <X className="h-5 w-5 text-white" strokeWidth={2.5} />}
      {state === "warning" && <AlertTriangle className="h-4 w-4 text-white" strokeWidth={2.5} />}
      {state === "active" && <Hourglass className="h-4 w-4 text-white" />}
      {state === "upcoming" && <Icon className="h-4 w-4 text-slate-400 dark:text-slate-500" />}
    </div>
  );
}

function formatDate(d: Date | null): string | null {
  if (!d) return null;
  return new Date(d).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SituationTimeline({ situation }: { situation: SituationForTimeline }) {
  const steps = buildSteps(situation);

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-6 py-5 dark:border-slate-800 dark:bg-slate-900">
      {/* Desktop: horizontal */}
      <div className="hidden sm:flex items-start gap-0">
        {steps.map((step, i) => {
          const styles = STATE_STYLES[step.state];
          const isLast = i === steps.length - 1;

          return (
            <div key={step.id} className="flex flex-1 items-start">
              {/* Step + label */}
              <div className="flex flex-col items-center">
                <StepIcon id={step.id} state={step.state} />
                <div className="mt-2 flex flex-col items-center text-center w-28">
                  <span className={`text-xs font-semibold leading-tight ${styles.text}`}>
                    {step.label}
                  </span>
                  <span className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                    {step.role}
                  </span>
                  {step.person && (
                    <span className="mt-1 text-[11px] text-slate-600 dark:text-slate-400 font-medium truncate max-w-[7rem]" title={step.person}>
                      {step.person}
                    </span>
                  )}
                  {step.date && (
                    <span className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500 leading-tight">
                      {formatDate(step.date)}
                    </span>
                  )}
                  {step.note && (
                    <span className="mt-1 text-[10px] italic leading-tight text-amber-600 dark:text-amber-400 max-w-[7rem]">
                      {step.note}
                    </span>
                  )}
                </div>
              </div>

              {/* Connector */}
              {!isLast && (
                <div className="mt-5 flex-1 px-1">
                  <div className={`h-0.5 w-full ${styles.connector}`} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: vertical */}
      <div className="flex sm:hidden flex-col gap-0">
        {steps.map((step, i) => {
          const styles = STATE_STYLES[step.state];
          const isLast = i === steps.length - 1;

          return (
            <div key={step.id} className="flex gap-4">
              {/* Icon + vertical line */}
              <div className="flex flex-col items-center">
                <StepIcon id={step.id} state={step.state} />
                {!isLast && (
                  <div className={`mt-1 w-0.5 flex-1 min-h-[1.5rem] ${styles.connector}`} />
                )}
              </div>

              {/* Content */}
              <div className={`pb-5 ${isLast ? "" : ""}`}>
                <p className={`text-sm font-semibold ${styles.text}`}>{step.label}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">{step.role}</p>
                {step.person && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">{step.person}</p>
                )}
                {step.date && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">{formatDate(step.date)}</p>
                )}
                {step.note && (
                  <p className="mt-0.5 text-[11px] italic text-amber-600 dark:text-amber-400">{step.note}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
