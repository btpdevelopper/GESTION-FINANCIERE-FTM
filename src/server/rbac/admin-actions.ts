"use server";

import { revalidatePath } from "next/cache";
import { Capability } from "@prisma/client";
import { getAuthUser } from "@/lib/auth/user";
import { prisma } from "@/lib/prisma";
import { requireProjectMember } from "@/server/membership";
import { can } from "@/lib/permissions/resolve";

export async function upsertCapabilityOverrideAction(input: {
  projectId: string;
  targetProjectMemberId: string;
  capability: Capability;
  allowed: boolean;
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, input.projectId);
  const ok = await can(pm.id, Capability.ADMIN_PROJECT_PERMISSIONS);
  if (!ok) throw new Error("Accès administration refusé.");

  await prisma.projectMemberCapabilityOverride.upsert({
    where: {
      projectMemberId_capability: {
        projectMemberId: input.targetProjectMemberId,
        capability: input.capability,
      },
    },
    update: { allowed: input.allowed },
    create: {
      projectMemberId: input.targetProjectMemberId,
      capability: input.capability,
      allowed: input.allowed,
    },
  });

  revalidatePath(`/projects/${input.projectId}/admin`);
  return { ok: true };
}

export async function deleteCapabilityOverrideAction(input: {
  projectId: string;
  overrideId: string;
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, input.projectId);
  const ok = await can(pm.id, Capability.ADMIN_PROJECT_PERMISSIONS);
  if (!ok) throw new Error("Accès administration refusé.");

  await prisma.projectMemberCapabilityOverride.delete({
    where: { id: input.overrideId },
  });

  revalidatePath(`/projects/${input.projectId}/admin`);
  return { ok: true };
}
