import Link from "next/link";
import { getAuthUser } from "@/lib/auth/user";
import { notFound } from "next/navigation";
import { ProjectRole } from "@prisma/client";
import { requireProjectMember } from "@/server/membership";
import { listFtms, listFtmDemands } from "@/server/ftm/queries";
import { FtmKanbanBoard } from "./kanban-board";
import { DemandsList } from "./demands-list";
import { FtmTableView } from "./ftm-table-view";
import { Button, CountBadge, SegmentedNav, SegmentedNavLink } from "@/components/ui";
import { LayoutGrid, Table2, Inbox, Plus } from "lucide-react";

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
  const isTable = tab === "tableau";

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

      <div>
        <SegmentedNav>
          <SegmentedNavLink
            href={`/projects/${projectId}/ftms`}
            active={!isDemandes && !isTable}
            className="flex items-center gap-1.5"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Kanban ({ftms.length})
          </SegmentedNavLink>
          <SegmentedNavLink
            href={`/projects/${projectId}/ftms?tab=tableau`}
            active={isTable}
            className="flex items-center gap-1.5"
          >
            <Table2 className="h-3.5 w-3.5" />
            Tableau
          </SegmentedNavLink>
          <SegmentedNavLink
            href={`/projects/${projectId}/ftms?tab=demandes`}
            active={isDemandes}
            className="flex items-center gap-1.5"
          >
            <Inbox className="h-3.5 w-3.5" />
            Demandes ({demands.length})
            <CountBadge count={pendingDemandsCount} />
          </SegmentedNavLink>
        </SegmentedNav>
      </div>

      <div className="flex-1 overflow-hidden">
        {isTable ? (
          <FtmTableView
            ftms={ftms}
            projectId={projectId}
            isCompany={pm.role === ProjectRole.ENTREPRISE}
          />
        ) : isDemandes ? (
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
