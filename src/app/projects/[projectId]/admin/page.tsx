import Link from "next/link";
import { getAuthUser } from "@/lib/auth/user";
import { notFound } from "next/navigation";
import { Capability, ProjectRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/server/membership";
import { can } from "@/lib/permissions/resolve";
import { DEFAULT_GROUP_NAMES } from "@/lib/permissions/defaults";
import { ConfigurationClient } from "./configuration-client";

export default async function ProjectAdminPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const user = await getAuthUser();
  if (!user?.id) notFound();
  
  const pm = await requireProjectMember(user.id, projectId);
  
  // Actually, some parts might be viewable by others, but 'Administration' is highly restricted.
  const isAdmin = await can(pm.id, Capability.ADMIN_PROJECT_PERMISSIONS);
  if (!isAdmin) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
        Vous n’avez pas le droit d’administrer les paramètres de ce projet.
      </div>
    );
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      baseContract: true,
      lots: {
        orderBy: { label: "asc" },
        include: {
          organizations: {
            orderBy: { organization: { name: "asc" } },
            include: { organization: true },
          },
        },
      },
    },
  });

  if (!project) notFound();

  const groups = await prisma.projectPermissionGroup.findMany({
    where: { projectId },
    include: { capabilities: true },
    orderBy: { name: "asc" },
  });

  const members = await prisma.projectMember.findMany({
    where: { projectId },
    include: {
      user: true,
      organization: true,
      permissionGroup: true,
      capabilityOverrides: true,
    },
    orderBy: { role: "asc" },
  });

  const allCapabilities = Object.values(Capability);

  // Only suggest organizations already involved in this project (members or
  // assigned to a lot). Admins can still type a new name to create one.
  const projectOrgNames = new Set<string>();
  for (const m of members) projectOrgNames.add(m.organization.name);
  for (const lot of project.lots) {
    for (const lo of lot.organizations) projectOrgNames.add(lo.organization.name);
  }
  const organizationNames = Array.from(projectOrgNames).sort((a, b) =>
    a.localeCompare(b, "fr"),
  );
  const currentMemberId = pm.id;

  const defaultGroupIdsByRole = Object.fromEntries(
    (Object.values(ProjectRole) as ProjectRole[]).map((role) => {
      const group = groups.find((g) => g.name === DEFAULT_GROUP_NAMES[role]);
      return [role, group?.id ?? null];
    }),
  ) as Record<ProjectRole, string | null>;

  // Load enterprise orgs with their contract settings for the Contrats tab
  const enterpriseMembers = await prisma.projectMember.findMany({
    where: { projectId, role: "ENTREPRISE" },
    include: { organization: true },
    distinct: ["organizationId"],
  });

  const contractSettingsList = await prisma.companyContractSettings.findMany({
    where: { projectId },
  });
  const settingsByOrg = new Map(contractSettingsList.map((s) => [s.organizationId, s]));

  const enterprises = enterpriseMembers.map((m) => {
    const s = settingsByOrg.get(m.organizationId) ?? null;
    return {
      id: m.organization.id,
      name: m.organization.name,
      settings: s
        ? {
            retenueGarantieActive: s.retenueGarantieActive,
            retenueGarantiePercent: s.retenueGarantiePercent !== null ? Number(s.retenueGarantiePercent) : null,
            avanceTravauxAmountCents: s.avanceTravauxAmountCents !== null ? Number(s.avanceTravauxAmountCents) : null,
            avanceTravauxRefundStartMonth: s.avanceTravauxRefundStartMonth,
            avanceTravauxRefundStartPercent:
              s.avanceTravauxRefundStartPercent !== null ? Number(s.avanceTravauxRefundStartPercent) : null,
            avanceTravauxRefundInstallments: s.avanceTravauxRefundInstallments,
            penaltyType: s.penaltyType as "NONE" | "FREE_AMOUNT" | "DAILY_RATE",
            penaltyDailyRateCents: s.penaltyDailyRateCents !== null ? Number(s.penaltyDailyRateCents) : null,
          }
        : null,
    };
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/projects/${projectId}`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 transition hover:text-slate-700 dark:hover:text-slate-300"
        >
          ← Retour au projet
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Configuration du projet
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Gérez les informations générales, le découpage financier et les permissions de l'équipe.
        </p>
      </div>

      <ConfigurationClient
        project={project}
        groups={groups}
        members={members}
        allCapabilities={allCapabilities}
        organizationNames={organizationNames}
        currentMemberId={currentMemberId}
        enterprises={enterprises}
        defaultGroupIdsByRole={defaultGroupIdsByRole}
      />
    </div>
  );
}
