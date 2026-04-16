"use client";

import Link from "next/link";


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
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 py-16 dark:border-slate-800 dark:bg-slate-900/50">
        <p className="text-sm text-slate-500">Aucune demande en cours.</p>
        {isCompany && (
           <Link
             href={`/projects/${projectId}/ftms/new`}
             className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
           >
             Faire une demande
           </Link>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <ul role="list" className="divide-y divide-slate-100 dark:divide-slate-800">
        {demands.map((demand) => (
          <li
            key={demand.id}
            className="flex items-center justify-between gap-x-6 p-5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
          >
            <div className="min-w-0">
              <div className="flex items-start gap-x-3">
                <p className="text-sm font-semibold leading-6 text-slate-900 dark:text-white">
                  {demand.title}
                </p>
                <div className={`mt-0.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
                    demand.status === "DRAFT" 
                       ? "bg-slate-50 text-slate-600 ring-slate-500/10 dark:bg-slate-400/10 dark:text-slate-400 dark:ring-slate-400/20"
                       : demand.status === "PENDING_MOE"
                       ? "bg-yellow-50 text-yellow-800 ring-yellow-600/20 dark:bg-yellow-400/10 dark:text-yellow-500 dark:ring-yellow-400/20"
                       : demand.status === "APPROVED"
                       ? "bg-green-50 text-green-700 ring-green-600/20 dark:bg-green-500/10 dark:text-green-400 dark:ring-green-500/20"
                       : "bg-red-50 text-red-700 ring-red-600/10 dark:bg-red-400/10 dark:text-red-400 dark:ring-red-400/20"
                }`}>
                  {demand.status === "DRAFT" && "Brouillon"}
                  {demand.status === "PENDING_MOE" && "En attente MOE"}
                  {demand.status === "APPROVED" && "Approuvé"}
                  {demand.status === "REJECTED" && "Refusé"}
                </div>
                {demand.ftmRecords.length > 0 && demand.ftmRecords.map(record => (
                  <Link
                    key={record.id}
                    href={`/projects/${projectId}/ftms/${record.id}`}
                    className="mt-0.5 whitespace-nowrap flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/20 hover:bg-indigo-100 dark:bg-indigo-500/10 dark:text-indigo-400 dark:ring-indigo-500/20 dark:hover:bg-indigo-500/20 transition-colors"
                  >
                    Transformé : FTM N°{record.number}
                  </Link>
                ))}
              </div>
              <div className="mt-1 flex items-center gap-x-2 text-xs leading-5 text-slate-500 dark:text-slate-400">
                <p className="truncate">
                  Demandé par {demand.initiator.organization?.name ?? demand.initiator.user.name ?? demand.initiator.user.email}
                </p>
                <svg viewBox="0 0 2 2" className="h-0.5 w-0.5 fill-current">
                  <circle cx={1} cy={1} r={1} />
                </svg>
                <p className="whitespace-nowrap">
                  Créé le <time dateTime={demand.createdAt.toISOString()}>{new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(demand.createdAt))}</time>
                </p>
              </div>
            </div>
            <div className="flex flex-none items-center gap-x-4">
              {(() => {
                // APPROVED with linked FTM → navigate to FTM detail
                if (demand.status === "APPROVED" && demand.ftmRecords.length > 0) {
                  return (
                    <Link
                      href={`/projects/${projectId}/ftms/${demand.ftmRecords[0].id}`}
                      className="hidden rounded-md bg-emerald-600 px-2.5 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-500 sm:block"
                    >
                      Voir FTM N°{demand.ftmRecords[0].number}
                    </Link>
                  );
                }
                // PENDING_MOE for MOE/MOA → instruct the demand
                if (demand.status === "PENDING_MOE" && !isCompany) {
                  return (
                    <Link
                      href={`/projects/${projectId}/ftms/new?demandId=${demand.id}`}
                      className="hidden rounded-md bg-indigo-600 px-2.5 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 sm:block"
                    >
                      Instruire
                    </Link>
                  );
                }
                // REJECTED → read-only view
                if (demand.status === "REJECTED") {
                  return (
                    <Link
                      href={`/projects/${projectId}/ftms/new?demandId=${demand.id}`}
                      className="hidden rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700 dark:hover:bg-slate-700 sm:block"
                    >
                      Voir
                    </Link>
                  );
                }
                // DRAFT (company) → edit
                if (demand.status === "DRAFT" && isCompany) {
                  return (
                    <Link
                      href={`/projects/${projectId}/ftms/new?demandId=${demand.id}`}
                      className="hidden rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700 dark:hover:bg-slate-700 sm:block"
                    >
                      Modifier
                    </Link>
                  );
                }
                // Fallback
                return (
                  <Link
                    href={`/projects/${projectId}/ftms/new?demandId=${demand.id}`}
                    className="hidden rounded-md bg-white px-2.5 py-1.5 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700 dark:hover:bg-slate-700 sm:block"
                  >
                    Consulter
                  </Link>
                );
              })()}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
