"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Capability } from "@prisma/client";
import { getAuthUser } from "@/lib/auth/user";
import { requireProjectMember } from "@/server/membership";
import { can } from "@/lib/permissions/resolve";

async function requireAdmin(projectId: string) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, projectId);
  if (!(await can(pm.id, Capability.ADMIN_PROJECT_PERMISSIONS))) {
    throw new Error("Non autorisé.");
  }
  return pm;
}

async function recalculateBaseContract(projectId: string) {
  const allOrgs = await prisma.projectLotOrganization.findMany({
    where: { projectLot: { projectId } },
    select: { montantMarcheHtCents: true },
  });
  const totalCents = allOrgs.reduce(
    (acc, curr) => acc + curr.montantMarcheHtCents,
    BigInt(0),
  );
  await prisma.baseContract.updateMany({
    where: { projectId },
    data: { amountHtCents: totalCents },
  });
}

export async function updateProjectAction(input: {
  projectId: string;
  name: string;
  code: string;
}) {
  await requireAdmin(input.projectId);
  const name = input.name.trim();
  if (!name) throw new Error("Le nom du projet est requis.");

  await prisma.project.update({
    where: { id: input.projectId },
    data: {
      name,
      code: input.code.trim() || null,
    },
  });

  revalidatePath(`/projects/${input.projectId}/admin`);
  return { ok: true };
}

export async function addLotAction(input: {
  projectId: string;
  label: string;
  description: string;
}) {
  await requireAdmin(input.projectId);
  const label = input.label.trim();
  if (!label) throw new Error("Le nom du lot est requis.");

  await prisma.projectLot.create({
    data: {
      projectId: input.projectId,
      label,
      description: input.description.trim() || null,
    },
  });

  revalidatePath(`/projects/${input.projectId}/admin`);
  return { ok: true };
}

export async function updateLotAction(input: {
  projectId: string;
  lotId: string;
  label: string;
  description: string;
}) {
  await requireAdmin(input.projectId);
  const label = input.label.trim();
  if (!label) throw new Error("Le nom du lot est requis.");

  await prisma.projectLot.update({
    where: { id: input.lotId },
    data: {
      label,
      description: input.description.trim() || null,
    },
  });

  revalidatePath(`/projects/${input.projectId}/admin`);
  return { ok: true };
}

export async function deleteLotAction(input: {
  projectId: string;
  lotId: string;
}) {
  await requireAdmin(input.projectId);

  // Cascade deletes ProjectLotOrganization rows
  await prisma.projectLot.delete({ where: { id: input.lotId } });
  await recalculateBaseContract(input.projectId);

  revalidatePath(`/projects/${input.projectId}/admin`);
  return { ok: true };
}

export async function assignCompanyToLotAction(input: {
  projectId: string;
  projectLotId: string;
  organizationName: string;
  montantMarcheHtCents: string;
}) {
  await requireAdmin(input.projectId);
  const name = input.organizationName.trim();
  if (!name) throw new Error("Raison sociale requise.");

  let org = await prisma.organization.findFirst({ where: { name } });
  if (!org) {
    org = await prisma.organization.create({ data: { name } });
  }

  await prisma.projectLotOrganization.upsert({
    where: {
      projectLotId_organizationId: {
        projectLotId: input.projectLotId,
        organizationId: org.id,
      },
    },
    update: { montantMarcheHtCents: BigInt(input.montantMarcheHtCents) },
    create: {
      projectLotId: input.projectLotId,
      organizationId: org.id,
      montantMarcheHtCents: BigInt(input.montantMarcheHtCents),
    },
  });

  await recalculateBaseContract(input.projectId);
  revalidatePath(`/projects/${input.projectId}/admin`);
  return { ok: true };
}

export async function assignCompaniesToLotAction(input: {
  projectId: string;
  projectLotId: string;
  rows: { organizationName: string; montantMarcheHtCents: string }[];
}) {
  await requireAdmin(input.projectId);

  for (const row of input.rows) {
    const name = row.organizationName.trim();
    if (!name) continue;

    let org = await prisma.organization.findFirst({ where: { name } });
    if (!org) {
      org = await prisma.organization.create({ data: { name } });
    }

    await prisma.projectLotOrganization.upsert({
      where: {
        projectLotId_organizationId: {
          projectLotId: input.projectLotId,
          organizationId: org.id,
        },
      },
      update: { montantMarcheHtCents: BigInt(row.montantMarcheHtCents) },
      create: {
        projectLotId: input.projectLotId,
        organizationId: org.id,
        montantMarcheHtCents: BigInt(row.montantMarcheHtCents),
      },
    });
  }

  await recalculateBaseContract(input.projectId);
  revalidatePath(`/projects/${input.projectId}/admin`);
  return { ok: true };
}

export async function updateLotOrganizationAction(input: {
  projectId: string;
  lotOrganizationId: string;
  montantMarcheHtCents: string;
}) {
  await requireAdmin(input.projectId);

  await prisma.projectLotOrganization.update({
    where: { id: input.lotOrganizationId },
    data: { montantMarcheHtCents: BigInt(input.montantMarcheHtCents) },
  });

  await recalculateBaseContract(input.projectId);
  revalidatePath(`/projects/${input.projectId}/admin`);
  return { ok: true };
}

export async function removeOrganizationFromLotAction(input: {
  projectId: string;
  lotOrganizationId: string;
}) {
  await requireAdmin(input.projectId);

  await prisma.projectLotOrganization.delete({
    where: { id: input.lotOrganizationId },
  });

  await recalculateBaseContract(input.projectId);
  revalidatePath(`/projects/${input.projectId}/admin`);
  return { ok: true };
}
