"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Capability, ProjectRole } from "@prisma/client";
import { getAuthUser } from "@/lib/auth/user";
import { requireProjectMember } from "@/server/membership";
import { can } from "@/lib/permissions/resolve";

export async function addLotAction(input: {
  projectId: string;
  label: string;
  description: string;
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, input.projectId);
  if (!(await can(pm.id, Capability.ADMIN_PROJECT_PERMISSIONS))) throw new Error("Non autorisé.");

  await prisma.projectLot.create({
    data: {
      projectId: input.projectId,
      label: input.label,
      description: input.description || null,
    }
  });

  revalidatePath(`/projects/${input.projectId}/admin`);
  return { ok: true };
}

export async function assignCompanyToLotAction(input: {
  projectId: string;
  projectLotId: string;
  organizationName: string;
  montantMarcheHtCents: string;
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, input.projectId);
  if (!(await can(pm.id, Capability.ADMIN_PROJECT_PERMISSIONS))) throw new Error("Non autorisé.");

  // Find or create organization
  let org = await prisma.organization.findFirst({
    where: { name: input.organizationName },
  });
  if (!org) {
    org = await prisma.organization.create({
      data: { name: input.organizationName },
    });
  }

  await prisma.projectLotOrganization.create({
    data: {
      projectLotId: input.projectLotId,
      organizationId: org.id,
      montantMarcheHtCents: BigInt(input.montantMarcheHtCents),
    }
  });

  // Re-calculate Base Contract
  const allLots = await prisma.projectLotOrganization.findMany({
    where: { projectLot: { projectId: input.projectId } }
  });
  const totalCents = allLots.reduce((acc, curr) => acc + curr.montantMarcheHtCents, BigInt(0));

  await prisma.baseContract.updateMany({
    where: { projectId: input.projectId },
    data: { amountHtCents: totalCents }
  });

  revalidatePath(`/projects/${input.projectId}/admin`);
  return { ok: true };
}
