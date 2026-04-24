import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAuthUser } from "@/lib/auth/user";
import { requireProjectMember } from "@/server/membership";
import { getDgdDashboardData, getDgdEligibility } from "@/server/dgd/dgd-queries";
import { prisma } from "@/lib/prisma";
import { ProjectRole } from "@prisma/client";
import { DgdDashboard } from "./_components/dgd-dashboard";
import { DgdEntrepriseView } from "./_components/dgd-entreprise-view";

export default async function DgdPage({
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
    select: { name: true },
  });
  if (!project) notFound();

  // ENTREPRISE: show their own DGD view
  if (pm.role === ProjectRole.ENTREPRISE) {
    const eligibility = await getDgdEligibility(projectId);
    return (
      <DgdEntrepriseView
        projectId={projectId}
        projectName={project.name}
        organizationId={pm.organizationId}
        eligibility={eligibility}
      />
    );
  }

  // MOE/MOA: consolidated dashboard
  const dashboardData = await getDgdDashboardData(projectId);

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <Link
          href={`/projects/${projectId}`}
          className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        >
          ← Tableau de bord
        </Link>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Décompte Général Définitif
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Clôture financière des marchés par entreprise — {project.name}
        </p>
      </div>

      <DgdDashboard data={dashboardData} projectId={projectId} />
    </div>
  );
}
