import { prisma } from "@/lib/prisma";

export async function getProjectMember(userId: string, projectId: string) {
  return prisma.projectMember.findFirst({
    where: { userId, projectId },
    include: {
      organization: true,
      permissionGroup: { include: { capabilities: true } },
      capabilityOverrides: true,
    },
  });
}

export async function requireProjectMember(userId: string, projectId: string) {
  const pm = await getProjectMember(userId, projectId);
  if (!pm) throw new Error("Accès refusé au projet.");
  return pm;
}

export async function listProjectsForUser(userId: string) {
  return prisma.project.findMany({
    where: { members: { some: { userId } } },
    orderBy: { name: "asc" },
  });
}
