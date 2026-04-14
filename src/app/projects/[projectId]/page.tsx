import Link from "next/link";
import { getAuthUser } from "@/lib/auth/user";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/server/membership";
import { FileEdit, FileText, Settings } from "lucide-react";
import { ProjectRole } from "@prisma/client";

export default async function ProjectHomePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await getAuthUser();
  if (!user?.id) notFound();
  
  const pm = await requireProjectMember(user.id, projectId);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { baseContract: true },
  });
  if (!project) notFound();

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Tableau de bord : {project.name}
        </h1>
        {project.baseContract && (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Marché de base : <strong>{project.baseContract.label}</strong> —{" "}
            {(Number(project.baseContract.amountHtCents) / 100).toLocaleString("fr-FR", {
              style: "currency",
              currency: "EUR",
            })}{" "}
            HT
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Module FTM */}
        <Link
          href={`/projects/${projectId}/ftms`}
          className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900">
            <FileEdit className="h-6 w-6" />
          </div>
          <h2 className="mt-4 text-xl font-semibold text-slate-900 dark:text-slate-100">
            Gestion des FTM
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Suivez les Fiches de Travaux Modificatifs, de la demande initiale à la validation finale.
          </p>
        </Link>

        {/* Module Situations de travaux (Stub) */}
        <div className="group relative flex flex-col rounded-2xl border border-slate-200 bg-slate-50 p-6 opacity-70 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="flex justify-between items-start">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              <FileText className="h-6 w-6" />
            </div>
            <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              À venir
            </span>
          </div>
          <h2 className="mt-4 text-xl font-semibold text-slate-900 dark:text-slate-100">
            Situations travaux
          </h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Gestion des avancements mensuels et de la facturation. Fonctionnalité en cours de développement.
          </p>
        </div>

        {/* Module Configuration (MOE / MOA / ADMIN only) */}
        {pm.role !== ProjectRole.ENTREPRISE && (
          <Link
            href={`/projects/${projectId}/admin`}
            className="group relative flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              <Settings className="h-6 w-6 group-hover:rotate-45 transition-transform duration-300" />
            </div>
            <h2 className="mt-4 text-xl font-semibold text-slate-900 dark:text-slate-100">
              Configuration
            </h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Paramètres du projet, gestion des lots, et administration des participants.
            </p>
          </Link>
        )}
      </div>
    </div>
  );
}
