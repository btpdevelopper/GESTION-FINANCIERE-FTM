import Link from "next/link";
import { getAuthUser } from "@/lib/auth/user";
import { notFound } from "next/navigation";
import { Capability } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/server/membership";
import { can } from "@/lib/permissions/resolve";
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
      <div className="rounded-md bg-red-50 p-4 text-sm text-red-600">
        Vous n’avez pas le droit d’administrer les paramètres de ce projet.
      </div>
    );
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      baseContract: true,
      lots: {
        include: { organizations: { include: { organization: true } } }
      }
    }
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

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/projects/${projectId}`} className="text-sm text-slate-600 hover:underline">
          ← Retour au projet
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Configuration du Projet
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Gérez le découpage financier, la sécurité et les paramètres globaux.
        </p>
      </div>

      <ConfigurationClient 
        project={project}
        groups={groups}
        members={members}
        allCapabilities={allCapabilities}
      />
    </div>
  );
}
