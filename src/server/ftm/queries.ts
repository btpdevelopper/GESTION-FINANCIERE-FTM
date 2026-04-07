import { FtmPhase, ProjectRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export async function listFtms(projectId: string, member: {
  role: ProjectRole;
  organizationId: string;
}) {
  const base = { projectId } as const;
  if (member.role === ProjectRole.ENTREPRISE) {
    return prisma.ftmRecord.findMany({
      where: {
        ...base,
        concernedOrgs: { some: { organizationId: member.organizationId } },
      },
      orderBy: { updatedAt: "desc" },
      include: { concernedOrgs: { include: { organization: true } } },
    });
  }
  return prisma.ftmRecord.findMany({
    where: base,
    orderBy: { updatedAt: "desc" },
    include: { concernedOrgs: { include: { organization: true } } },
  });
}

export async function getFtmDetail(
  projectId: string,
  ftmId: string,
  member: { role: ProjectRole; organizationId: string },
) {
  const ftm = await prisma.ftmRecord.findFirst({
    where: { id: ftmId, projectId },
    include: {
      concernedOrgs: { include: { organization: true } },
      lots: { include: { organization: true } },
      initiator: { include: { user: true, organization: true } },
      chatMessages: {
        orderBy: { createdAt: "asc" },
        include: { author: { include: { user: true, organization: true } } },
      },
      quoteSubmissions: {
        orderBy: { submittedAt: "desc" },
        include: {
          organization: true,
          ftmLot: true,
          reviews: { include: { reviewer: { include: { user: true, organization: true } } } },
        },
      },
      invitations: true,
    },
  });
  if (!ftm) notFound();
  if (member.role === ProjectRole.ENTREPRISE) {
    const ok = ftm.concernedOrgs.some((c) => c.organizationId === member.organizationId);
    if (!ok) notFound();
  }
  return ftm;
}

export function phaseLabel(p: FtmPhase): string {
  const map: Record<FtmPhase, string> = {
    CREATION: "1 — Création",
    ETUDES: "2 — Études",
    QUOTING: "3 — Devis",
    ANALYSIS: "4 — Analyse MOE",
    MOA_FINAL: "5 — Validation MOA finale",
    CANCELLED: "Annulé",
    ACCEPTED: "Accepté",
  };
  return map[p] ?? p;
}
