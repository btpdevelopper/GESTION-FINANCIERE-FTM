import Link from "next/link";
import { getAuthUser } from "@/lib/auth/user";
import { listProjectsForUser } from "@/server/membership";

export default async function ProjectsPage() {
  const user = await getAuthUser();
  if (!user?.id) return null;
  const projects = await listProjectsForUser(user.id);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Projets</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Sélectionnez un chantier pour gérer les FTM.
        </p>
      </div>
      <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-900">
        {projects.map((p) => (
          <li key={p.id}>
            <Link
              href={`/projects/${p.id}`}
              className="block px-4 py-3 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              {p.name}
              {p.code && (
                <span className="ml-2 font-normal text-slate-500">({p.code})</span>
              )}
            </Link>
          </li>
        ))}
        {projects.length === 0 && (
          <li className="px-4 py-6 text-sm text-slate-500">Aucun projet assigné.</li>
        )}
      </ul>
    </div>
  );
}
