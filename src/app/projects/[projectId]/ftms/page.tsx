import Link from "next/link";
import { getAuthUser } from "@/lib/auth/user";
import { notFound } from "next/navigation";
import { ProjectRole } from "@prisma/client";
import { requireProjectMember } from "@/server/membership";
import { listFtms, listFtmDemands } from "@/server/ftm/queries";
import { FtmKanbanBoard } from "./kanban-board";
import { DemandsList } from "./demands-list";
import { Button, CountBadge } from "@/components/ui";
import { TAB_ACTIVE_CLS, TAB_INACTIVE_CLS } from "@/components/ui/tab-nav";
import { Plus } from "lucide-react";

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

  // Demands that need MOE/MOA action (not ENTREPRISE — their own DRAFT demands are not "pending")
  const pendingDemandsCount =
    pm.role !== ProjectRole.ENTREPRISE
      ? (demands as any[]).filter((d: any) => d.status === "PENDING_MOE").length
      : 0;

  return (
    <div className="flex h-full flex-col space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link
            href={`/projects/${projectId}`}
            className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            ← Tableau de bord
          </Link>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Fiches de Travaux Modificatifs
          </h1>
        </div>
        {pm.role === ProjectRole.ENTREPRISE && (
          <Link href={`/projects/${projectId}/ftms/new`}>
            <Button size="sm">
              <Plus className="h-3.5 w-3.5" />
              Nouvelle demande
            </Button>
          </Link>
        )}
      </div>

      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="-mb-px flex" aria-label="Tabs">
          <Link
            href={`/projects/${projectId}/ftms`}
            className={!isDemandes ? TAB_ACTIVE_CLS : TAB_INACTIVE_CLS}
          >
            Kanban FTM ({ftms.length})
          </Link>
          <Link
            href={`/projects/${projectId}/ftms?tab=demandes`}
            className={`${isDemandes ? TAB_ACTIVE_CLS : TAB_INACTIVE_CLS} flex items-center gap-1.5`}
          >
            Demandes ({demands.length})
            <CountBadge count={pendingDemandsCount} />
          </Link>
        </nav>
      </div>

      <div className="flex-1 overflow-hidden">
        {isDemandes ? (
          <div className="mx-auto max-w-5xl">
            <DemandsList
              demands={demands}
              projectId={projectId}
              isCompany={pm.role === ProjectRole.ENTREPRISE}
            />
          </div>
        ) : (
          <FtmKanbanBoard
            projectId={projectId}
            ftms={ftms}
            isCompany={pm.role === ProjectRole.ENTREPRISE}
          />
        )}
      </div>
    </div>
  );
}
