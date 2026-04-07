"use server";

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";

export async function submitGuestEtudesContributionAction(token: string, contribution: string) {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const inv = await prisma.ftmParticipantInvitation.findFirst({
    where: {
      tokenHash,
      expiresAt: { gt: new Date() },
      consumedAt: null,
    },
  });
  if (!inv) throw new Error("Lien invalide ou expiré.");

  await prisma.ftmParticipantInvitation.update({
    where: { id: inv.id },
    data: { contribution, consumedAt: new Date() },
  });

  const ftm = await prisma.ftmRecord.findUnique({ where: { id: inv.ftmId } });
  if (ftm) {
    const { revalidatePath } = await import("next/cache");
    revalidatePath(`/projects/${ftm.projectId}/ftms/${ftm.id}`);
  }

  return { ok: true };
}
