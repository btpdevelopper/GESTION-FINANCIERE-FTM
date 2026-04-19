import Link from "next/link";
import { getAuthUser } from "@/lib/auth/user";
import { listProjectsForUser } from "@/server/membership";
import { prisma } from "@/lib/prisma";
import { Button, CountBadge } from "@/components/ui";
import { getProjectPendingCounts } from "@/server/notifications/pending-counts";
import { Plus, FolderOpen, ChevronRight } from "lucide-react";

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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const counts = countMap.get(p.id);
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex flex-col justify-between rounded border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800/60"
              >
                <div className="flex items-start justify-between gap-2">
                  {p.code ? (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {p.code}
                    </span>
                  ) : (
                    <span />
                  )}
                  <div className="flex items-center gap-1.5">
                    {counts && counts.total > 0 && <CountBadge count={counts.total} />}
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                  </div>
                </div>
                <div className="mt-3">
                  <p className="line-clamp-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {p.name}
                  </p>
                  <p className="mt-2 text-xs text-slate-500">Accéder au projet →</p>
                </div>
              </Link>
            );
          })}
        </div>
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
