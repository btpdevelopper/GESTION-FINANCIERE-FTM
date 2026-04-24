import Link from "next/link";
import { getAuthUser } from "@/lib/auth/user";
import { listProjectsForUser } from "@/server/membership";
import { prisma } from "@/lib/prisma";
import { Button } from "@/components/ui";
import { getProjectPendingCounts } from "@/server/notifications/pending-counts";
import { Plus, FolderOpen } from "lucide-react";
import { ProjectGrid } from "./project-grid";

export default async function ProjectsPage() {
  const user = await getAuthUser();
  if (!user?.id) return null;

  const [dbUser, projects, memberships] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id } }),
    listProjectsForUser(user.id),
    prisma.projectMember.findMany({
      where: { userId: user.id },
      select: { projectId: true, role: true, organizationId: true },
    }),
  ]);

  const membershipByProject = new Map(memberships.map((m) => [m.projectId, m]));

  const countResults = await Promise.all(
    memberships.map((pm) =>
      getProjectPendingCounts(pm.projectId, pm).then(
        (c) => [pm.projectId, c] as const,
      ),
    ),
  );
  const countMap = new Map(countResults);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Tableau de bord
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {dbUser?.isAdmin
              ? "Supervisez tous les chantiers et créez-en de nouveaux."
              : "Retrouvez ici la liste de vos chantiers assignés."}
          </p>
        </div>
        {dbUser?.isAdmin && (
          <Link href="/projects/new">
            <Button size="md">
              <Plus className="h-3.5 w-3.5" />
              Créer un projet
            </Button>
          </Link>
        )}
      </div>

      {projects.length > 0 ? (
        <ProjectGrid
          projects={projects.map((p) => ({
            id: p.id,
            name: p.name,
            code: p.code,
            city: p.city,
            startDate: p.startDate?.toISOString() ?? null,
            endDate: p.endDate?.toISOString() ?? null,
          }))}
          countMap={Object.fromEntries(
            Array.from(countMap.entries()).map(([id, c]) => [id, c.total]),
          )}
        />
      ) : (
        <div className="rounded border-2 border-dashed border-slate-200 bg-white p-10 text-center dark:border-slate-700 dark:bg-slate-900">
          <FolderOpen className="mx-auto mb-3 h-8 w-8 text-slate-300 dark:text-slate-700" />
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Aucun chantier assigné
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {dbUser?.isAdmin
              ? "Commencez par créer un nouveau projet."
              : "Vous n'avez pas encore été invité sur un projet."}
          </p>
        </div>
      )}
    </div>
  );
}
