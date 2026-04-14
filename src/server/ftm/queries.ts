import { FtmPhase, ProjectRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export async function listFtms(projectId: string, member: {
  role: ProjectRole;
  organizationId: string;
}) {
  const isEntreprise = member.role === ProjectRole.ENTREPRISE;

  return prisma.ftmRecord.findMany({
    where: {
      projectId,
      ...(isEntreprise ? { concernedOrgs: { some: { organizationId: member.organizationId } } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    include: {
      concernedOrgs: { include: { organization: true } },
      initiator: { include: { user: true, organization: true } },
      chatMessages: { select: { id: true } },
      quoteSubmissions: {
        where: isEntreprise ? { organizationId: member.organizationId } : undefined,
        select: {
          id: true,
          organizationId: true,
          indice: true,
          amountHtCents: true,
          submittedAt: true,
          reviews: {
            orderBy: { decidedAt: "desc" as const },
            take: 1,
            select: { decision: true }
          }
        },
        orderBy: { submittedAt: "desc" as const }
      }
    },
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
      invitations: { orderBy: { createdAt: "desc" as const } },
      documents: {
        include: { uploadedBy: true, organization: true },
        orderBy: { createdAt: "desc" as const },
      },
    },
  });
  if (!ftm) notFound();
  if (member.role === ProjectRole.ENTREPRISE) {
    const ok = ftm.concernedOrgs.some((c) => c.organizationId === member.organizationId);
    if (!ok) notFound();

    // Zero-Trust Security: Filter out data belonging to other companies so it doesn't leak to the client
    ftm.quoteSubmissions = ftm.quoteSubmissions.filter(
      (q) => q.organizationId === member.organizationId
    );
    ftm.concernedOrgs = ftm.concernedOrgs.filter(
      (c) => c.organizationId === member.organizationId
    );
    ftm.lots = ftm.lots.filter(
      (l) => l.organizationId === member.organizationId
    );
    ftm.chatMessages = ftm.chatMessages.filter((m) => {
      if (!m.author) return true; // Keep guest messages
      if (m.author.role === ProjectRole.MOE || m.author.role === ProjectRole.MOA) return true;
      return m.author.organizationId === member.organizationId;
    });
    ftm.documents = ftm.documents.filter(
      (d) => !d.organizationId || d.organizationId === member.organizationId
    );
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
