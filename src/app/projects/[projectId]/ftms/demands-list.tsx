"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

type FtmDemand = {
  id: string;
  projectId: string;
  title: string;
  status: string;
  requestedMoeResponseDate: Date | null;
  createdAt: Date;
  initiator: {
    organization: { name: string } | null;
    user: { name: string | null; email: string };
  };
  ftmRecords: { id: string; number: number }[];
};

const STATUS_META: Record<
  string,
  { label: string; dot: string; text: string }
> = {
  DRAFT: {
    label: "Brouillon",
    dot: "bg-slate-400 dark:bg-slate-500",
    text: "text-slate-500 dark:text-slate-400",
  },
  PENDING_MOE: {
    label: "En attente MOE",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
  },
  APPROVED: {
    label: "Approuvée",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  REJECTED: {
    label: "Refusée",
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
  },
};

function fmtRelative(d: Date): string {
  const days = Math.round((Date.now() - new Date(d).getTime()) / 86_400_000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return "hier";
  if (days < 7) return `il y a ${days} j`;
  if (days < 30) return `il y a ${Math.round(days / 7)} sem`;
  if (days < 365) return `il y a ${Math.round(days / 30)} mois`;
  return `il y a ${Math.round(days / 365)} an${Math.round(days / 365) > 1 ? "s" : ""}`;
}

function rowHrefAndAction(
  demand: FtmDemand,
  projectId: string,
  isCompany: boolean,
): { href: string; action: string } {
  if (demand.status === "APPROVED" && demand.ftmRecords.length > 0) {
    return {
      href: `/projects/${projectId}/ftms/${demand.ftmRecords[0].id}?from=demandes`,
      action: `Voir FTM N°${demand.ftmRecords[0].number}`,
    };
  }
  if (demand.status === "PENDING_MOE" && !isCompany) {
    return {
      href: `/projects/${projectId}/ftms/new?demandId=${demand.id}`,
      action: "Instruire",
    };
  }
  if (demand.status === "DRAFT" && isCompany) {
    return {
      href: `/projects/${projectId}/ftms/new?demandId=${demand.id}`,
      action: "Modifier",
    };
  }
  return {
    href: `/projects/${projectId}/ftms/new?demandId=${demand.id}`,
    action: "Consulter",
  };
}

export function DemandsList({
  demands,
  projectId,
  isCompany,
}: {
  demands: FtmDemand[];
  projectId: string;
  isCompany: boolean;
}) {
  if (demands.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded border border-slate-200 bg-white py-12 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Aucune demande en cours.
        </p>
        {isCompany && (
          <Link
            href={`/projects/${projectId}/ftms/new`}
            className="mt-4 inline-flex items-center gap-1.5 rounded border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Faire une demande
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {demands.map((demand) => {
          const status = STATUS_META[demand.status] ?? STATUS_META.DRAFT;
          const { href, action } = rowHrefAndAction(demand, projectId, isCompany);
          const submitter =
            demand.initiator.organization?.name ??
            demand.initiator.user.name ??
            demand.initiator.user.email;

          return (
            <li key={demand.id}>
              <Link
                href={href}
                className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-900/60"
              >
                {/* Status dot */}
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`}
                  aria-hidden
                />

                {/* Main content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-x-2">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {demand.title}
                    </p>
                    {demand.ftmRecords.length > 0 && (
                      <span className="shrink-0 font-mono text-[11px] text-slate-400 dark:text-slate-500">
                        FTM N°{demand.ftmRecords[0].number}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                    <span className={`font-medium ${status.text}`}>
                      {status.label}
                    </span>
                    <span className="text-slate-300 dark:text-slate-700">·</span>
                    <span className="truncate">{submitter}</span>
                    <span className="text-slate-300 dark:text-slate-700">·</span>
                    <span
                      title={new Intl.DateTimeFormat("fr-FR", {
                        day: "2-digit",
                        month: "long",
                        year: "numeric",
                      }).format(new Date(demand.createdAt))}
                    >
                      {fmtRelative(demand.createdAt)}
                    </span>
                    {demand.requestedMoeResponseDate && (
                      <>
                        <span className="text-slate-300 dark:text-slate-700">·</span>
                        <span>
                          réponse souhaitée :{" "}
                          {new Intl.DateTimeFormat("fr-FR", {
                            day: "2-digit",
                            month: "short",
                          }).format(new Date(demand.requestedMoeResponseDate))}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Trailing action hint */}
                <div className="hidden shrink-0 items-center gap-1 text-xs text-slate-400 transition-colors group-hover:text-slate-700 sm:flex dark:text-slate-500 dark:group-hover:text-slate-200">
                  <span className="opacity-0 transition-opacity group-hover:opacity-100">
                    {action}
                  </span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
