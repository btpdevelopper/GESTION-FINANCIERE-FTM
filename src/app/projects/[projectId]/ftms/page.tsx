import Link from "next/link";
import { getAuthUser } from "@/lib/auth/user";
import { notFound } from "next/navigation";
import { Capability } from "@prisma/client";
import { requireProjectMember } from "@/server/membership";
import { listFtms, phaseLabel } from "@/server/ftm/queries";
import { can } from "@/lib/permissions/resolve";

export default async function FtmsListPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await getAuthUser();
  if (!user?.id) notFound();
  const pm = await requireProjectMember(user.id, projectId);
  const ftms = await listFtms(projectId, pm);

  const canCreate = await can(pm.id, Capability.CREATE_FTM);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href={`/projects/${projectId}`} className="text-sm text-slate-600 underline">
            ← Projet
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">FTM</h1>
        </div>
        {canCreate && (
          <Link
            className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white dark:bg-slate-100 dark:text-slate-900"
            href={`/projects/${projectId}/ftms/new`}
          >
            Nouveau FTM
          </Link>
        )}
      </div>
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">
        {ftms.map((f) => (
          <li key={f.id}>
            <Link
              href={`/projects/${projectId}/ftms/${f.id}`}
              className="block px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <div className="font-medium">{f.title}</div>
              <div className="mt-1 text-xs text-slate-500">
                {phaseLabel(f.phase)} · {f.modificationSource}
              </div>
            </Link>
          </li>
        ))}
        {ftms.length === 0 && (
          <li className="px-4 py-6 text-sm text-slate-500">Aucun FTM pour le moment.</li>
        )}
      </ul>
    </div>
  );
}
