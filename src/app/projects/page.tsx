import Link from "next/link";
import { getAuthUser } from "@/lib/auth/user";
import { listProjectsForUser } from "@/server/membership";
import { prisma } from "@/lib/prisma";

export default async function ProjectsPage() {
  const user = await getAuthUser();
  if (!user?.id) return null;
  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  const projects = await listProjectsForUser(user.id);

  return (
    <div className="space-y-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            Tableau de Bord
          </h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">
            {dbUser?.isAdmin
              ? "Supervisez tous les chantiers et créez-en de nouveaux."
              : "Retrouvez ici la liste de vos chantiers assignés."}
          </p>
        </div>
        {dbUser?.isAdmin && (
          <Link
            href="/projects/new"
            className="group relative inline-flex items-center justify-center overflow-hidden rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white shadow-md transition-all active:scale-95 hover:bg-slate-800 hover:shadow-lg dark:bg-indigo-600 dark:hover:bg-indigo-500"
          >
            <span className="relative z-10 flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"></path><path d="M12 5v14"></path></svg>
              Créer un Projet
            </span>
            <div className="absolute inset-0 -translate-x-[150%] bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[150%]" />
          </Link>
        )}
      </div>

      {projects.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:shadow-xl hover:shadow-indigo-500/10 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-indigo-500/50 dark:hover:bg-slate-900"
            >
              <div className="absolute right-0 top-0 h-32 w-32 -translate-y-1/2 translate-x-1/2 rounded-full bg-indigo-500/10 blur-2xl transition-all group-hover:bg-indigo-500/20 dark:bg-indigo-500/5" />
              
              <div className="relative z-10 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  {p.code && (
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {p.code}
                    </span>
                  )}
                  <svg className="h-5 w-5 text-slate-400 opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100 group-hover:text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
                </div>
                <h3 className="mt-2 text-xl font-semibold text-slate-900 dark:text-white line-clamp-2">
                  {p.name}
                </h3>
              </div>
              <div className="relative z-10 mt-6 flex items-center justify-between border-t border-slate-100 pt-4 text-sm text-slate-500 dark:border-slate-800">
                <span>Accéder au projet</span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex min-h-[300px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-8 text-center dark:border-slate-800 dark:bg-slate-900/20">
          <svg className="mb-4 h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <h3 className="text-lg font-medium text-slate-900 dark:text-white">Aucun chantier assigné</h3>
          <p className="mt-1 max-w-sm text-slate-500">
            {dbUser?.isAdmin 
              ? "Commencez par créer un nouveau projet."
              : "Vous n'avez pas encore été invité sur un projet."}
          </p>
        </div>
      )}
    </div>
  );
}
