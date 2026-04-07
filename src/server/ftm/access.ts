import type { ProjectRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function userCanViewFtm(
  userId: string,
  projectId: string,
  role: ProjectRole,
  ftmId: string,
  organizationId: string,
): Promise<boolean> {
  if (role === "MOA" || role === "MOE") {
    const pm = await prisma.projectMember.findFirst({
      where: { userId, projectId },
    });
    return !!pm;
  }
  const concerned = await prisma.ftmConcernedOrganization.findFirst({
    where: { ftmId, organizationId },
  });
  return !!concerned;
}
