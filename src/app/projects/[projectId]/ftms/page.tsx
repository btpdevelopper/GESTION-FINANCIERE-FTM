import Link from "next/link";
import { getAuthUser } from "@/lib/auth/user";
import { notFound } from "next/navigation";
import { Capability, ProjectRole } from "@prisma/client";
import { requireProjectMember } from "@/server/membership";
import { listFtms, listFtmDemands } from "@/server/ftm/queries";
import { can } from "@/lib/permissions/resolve";
import { FtmKanbanBoard } from "./kanban-board";
import { DemandsList } from "./demands-list";

export default async function FtmsListPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { projectId } = await params;
  const { tab } = await searchParams;
  const isDemandes = tab === "demandes";

  const user = await getAuthUser();
  if (!user?.id) notFound();
  const pm = await requireProjectMember(user.id, projectId);
  
  const ftms = await listFtms(projectId, pm) as any;
  const demands = await listFtmDemands(projectId, pm) as any;

  const canCreate = await can(pm.id, Capability.CREATE_FTM);

  return (
    <div className="flex h-full flex-col space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href={`/projects/${projectId}`} className="text-sm text-slate-600 underline">
            ← Revenir au tableau de bord
          </Link>
          <div className="mt-2 flex flex-col pt-1">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Fiches de Travaux Modificatifs
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Suivi et gestion des FTM du projet.
            </p>
          </div>
        </div>
        {pm.role === ProjectRole.ENTREPRISE && (
          <Link
            href={`/projects/${projectId}/ftms/new`}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Nouvelle demande
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          <Link
            href={`/projects/${projectId}/ftms`}
            className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
              !isDemandes
                ? "border-indigo-500 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-300"
            }`}
          >
            Kanban FTM ({ftms.length})
          </Link>
          <Link
            href={`/projects/${projectId}/ftms?tab=demandes`}
            className={`whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium ${
              isDemandes
                ? "border-indigo-500 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-300"
            }`}
          >
            Demandes Entreprises ({demands.length})
          </Link>
        </nav>
      </div>

      <div className="flex-1 overflow-hidden">
        {isDemandes ? (
          <div className="max-w-5xl mx-auto align-middle">
          <DemandsList demands={demands} projectId={projectId} isCompany={pm.role === ProjectRole.ENTREPRISE} />
          </div>
        ) : (
          <FtmKanbanBoard projectId={projectId} ftms={ftms} isCompany={pm.role === ProjectRole.ENTREPRISE} />
        )}
      </div>
    </div>
  );
}
