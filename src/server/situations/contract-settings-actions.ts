"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/user";
import { requireProjectMember } from "@/server/membership";
import { can } from "@/lib/permissions/resolve";
import { Capability } from "@prisma/client";

const ContractSettingsSchema = z.object({
  projectId: z.string().uuid(),
  organizationId: z.string().uuid(),
  retenueGarantieActive: z.boolean(),
  retenueGarantiePercent: z.number().min(0).max(100).nullable(),
  avanceTravauxAmountCents: z.number().int().min(0).nullable(),
  avanceTravauxRefundStartMonth: z.number().int().min(1).nullable(),
  avanceTravauxRefundStartPercent: z.number().min(0).max(100).nullable(),
  avanceTravauxRefundInstallments: z.number().int().min(1).nullable(),
  revisionPrixActive: z.boolean(),
});

export async function upsertCompanyContractSettingsAction(raw: unknown) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parsed = ContractSettingsSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Données invalides : " + parsed.error.message);
  const data = parsed.data;

  const member = await requireProjectMember(user.id, data.projectId);
  const allowed = await can(member.id, Capability.CONFIGURE_CONTRACT_SETTINGS);
  if (!allowed) throw new Error("Permission refusée.");

  await prisma.companyContractSettings.upsert({
    where: {
      projectId_organizationId: {
        projectId: data.projectId,
        organizationId: data.organizationId,
      },
    },
    create: {
      projectId: data.projectId,
      organizationId: data.organizationId,
      retenueGarantieActive: data.retenueGarantieActive,
      retenueGarantiePercent: data.retenueGarantiePercent,
      avanceTravauxAmountCents:
        data.avanceTravauxAmountCents !== null ? BigInt(data.avanceTravauxAmountCents) : null,
      avanceTravauxRefundStartMonth: data.avanceTravauxRefundStartMonth,
      avanceTravauxRefundStartPercent: data.avanceTravauxRefundStartPercent,
      avanceTravauxRefundInstallments: data.avanceTravauxRefundInstallments,
      revisionPrixActive: data.revisionPrixActive,
    },
    update: {
      retenueGarantieActive: data.retenueGarantieActive,
      retenueGarantiePercent: data.retenueGarantiePercent,
      avanceTravauxAmountCents:
        data.avanceTravauxAmountCents !== null ? BigInt(data.avanceTravauxAmountCents) : null,
      avanceTravauxRefundStartMonth: data.avanceTravauxRefundStartMonth,
      avanceTravauxRefundStartPercent: data.avanceTravauxRefundStartPercent,
      avanceTravauxRefundInstallments: data.avanceTravauxRefundInstallments,
      revisionPrixActive: data.revisionPrixActive,
    },
  });

  revalidatePath(`/projects/${data.projectId}/admin`);
}
