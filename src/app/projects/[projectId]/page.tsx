import Link from "next/link";
import { getAuthUser } from "@/lib/auth/user";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/server/membership";
import { getProjectPendingCounts } from "@/server/notifications/pending-counts";
import { getOrgMarcheTotalCents } from "@/server/situations/situation-queries";
import { FileEdit, FileText, FileCheck2, Settings, BarChart2, AlertTriangle } from "lucide-react";
import { ProjectRole } from "@prisma/client";
import { CountBadge } from "@/components/ui";

export default async function ProjectHomePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await getAuthUser();
  if (!user?.id) notFound();

  const pm = await requireProjectMember(user.id, projectId);

  const isEntreprise = pm.role === ProjectRole.ENTREPRISE;

  const [project, counts, orgMarcheCents] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      // Only fetch the base contract for MOE/MOA — never expose full project financials to ENTREPRISE
      include: { baseContract: true },
    }),
    getProjectPendingCounts(projectId, pm),
    isEntreprise && pm.organizationId
      ? getOrgMarcheTotalCents(projectId, pm.organizationId)
      : Promise.resolve(null),
  ]);
  if (!project) notFound();

  const modules = [
    {
      href: `/projects/${projectId}/ftms`,
      icon: FileEdit,
      label: "Gestion des FTM",
      description:
        "Suivez les Fiches de Travaux Modificatifs, de la demande initiale à la validation finale.",
      pendingCount: counts.ftm,
      show: true,
    },
    {
      href: `/projects/${projectId}/situations`,
      icon: FileText,
      label: "Situations de travaux",
      description:
        "Suivi des avancements mensuels, validation MOE/MOA et décomptes financiers par entreprise.",
      pendingCount: counts.situations,
      show: true,
    },
    {
      href: `/projects/${projectId}/forecasts`,
      icon: BarChart2,
      label: "Prévisionnels",
      description:
        "Plans de facturation mensuels déclarés par chaque entreprise, soumis à validation MOE puis MOA.",
      pendingCount: counts.forecasts,
      show: true,
    },
    {
      href: `/projects/${projectId}/penalties`,
      icon: AlertTriangle,
      label: "Pénalités",
      description:
        "Gestion des pénalités contractuelles par entreprise, soumises par le MOE et validées par le MOA.",
      pendingCount: counts.penalties,
      show: pm.role !== ProjectRole.ENTREPRISE || counts.penalties > 0,
    },
    {
      href: `/projects/${projectId}/dgd`,
      icon: FileCheck2,
      label: "Décompte Général Définitif",
      description:
        "Clôture financière des marchés : consolidation, validation et solde final par entreprise.",
      pendingCount: counts.dgd,
      show: true,
    },
    {
      href: `/projects/${projectId}/admin`,
      icon: Settings,
      label: "Configuration",
      description:
        "Paramètres du projet, gestion des lots, et administration des participants.",
      pendingCount: 0,
      show: pm.role !== ProjectRole.ENTREPRISE,
    },
  ].filter((m) => m.show);

  return (
    <div className="max-w-3xl space-y-5">
      <div>
        <Link
          href="/projects"
          className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        >
          ← Tous les projets
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          {project.name}
        </h1>
        {!isEntreprise && project.baseContract && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Marché de base :{" "}
            <strong className="text-slate-700 dark:text-slate-300">
              {project.baseContract.label}
            </strong>{" "}
            —{" "}
            {(Number(project.baseContract.amountHtCents) / 100).toLocaleString("fr-FR", {
              style: "currency",
              currency: "EUR",
            })}{" "}
            HT
          </p>
        )}
        {isEntreprise && orgMarcheCents !== null && orgMarcheCents > BigInt(0) && (
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Votre marché :{" "}
            <strong className="text-slate-700 dark:text-slate-300">
              {(Number(orgMarcheCents) / 100).toLocaleString("fr-FR", {
                style: "currency",
                currency: "EUR",
              })}{" "}
              HT
            </strong>
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map(({ href, icon: Icon, label, description, pendingCount }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col rounded border border-slate-200 bg-white p-4 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700 dark:hover:bg-slate-800/60"
          >
            <div className="flex items-center justify-between">
              <div className="flex h-8 w-8 items-center justify-center rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <Icon className="h-4 w-4" />
              </div>
              <CountBadge count={pendingCount} />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
              {label}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
