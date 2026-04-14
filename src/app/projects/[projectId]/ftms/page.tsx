import Link from "next/link";
import { getAuthUser } from "@/lib/auth/user";
import { notFound } from "next/navigation";
import { Capability, ProjectRole } from "@prisma/client";
import { requireProjectMember } from "@/server/membership";
import { listFtms } from "@/server/ftm/queries";
import { can } from "@/lib/permissions/resolve";
import { FtmKanbanBoard } from "./kanban-board";

export default async function FtmsListPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await getAuthUser();
  if (!user?.id) notFound();
  const pm = await requireProjectMember(user.id, projectId);
  
  // listFtms returns number and initiator now based on our query update
  const ftms = await listFtms(projectId, pm) as any;

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
              Suivi et gestion des {ftms.length} FTM du projet.
            </p>
          </div>
        </div>
        {canCreate && (
          <Link
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
            href={`/projects/${projectId}/ftms/new`}
          >
            Créer un FTM
          </Link>
        )}
      </div>

      <FtmKanbanBoard projectId={projectId} ftms={ftms} isCompany={pm.role === ProjectRole.ENTREPRISE} />
    </div>
  );
}
