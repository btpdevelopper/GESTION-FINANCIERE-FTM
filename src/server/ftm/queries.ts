import { FtmPhase, MoaEtudesDecision, ProjectRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";

export function computeEffectiveEntreprisePhase(ftm: any, orgId: string): FtmPhase {
  if (ftm.phase === FtmPhase.CANCELLED || ftm.phase === FtmPhase.ACCEPTED) return ftm.phase;
  if (ftm.phase === FtmPhase.ETUDES) return ftm.phase;

  const subs = ftm.quoteSubmissions.filter((s: any) => s.organizationId === orgId);
  const latestSub = subs && subs.length > 0 ? subs[0] : null;

  if (!latestSub) return FtmPhase.QUOTING;

  const reviews = latestSub.reviews;
  if (!reviews || reviews.length === 0) return FtmPhase.ANALYSIS;

  const latestReview = [...reviews].sort((a: any, b: any) => new Date(b.decidedAt).getTime() - new Date(a.decidedAt).getTime())[0];

  if (latestReview.decision === "RESEND_CORRECTION") return FtmPhase.QUOTING;
  if (latestReview.decision === "DECLINE") return FtmPhase.CANCELLED;

  if (latestReview.decision === "ACCEPT") {
    if (latestReview.context === "MOE_ANALYSIS") return FtmPhase.MOA_FINAL;
    if (latestReview.context === "MOA_FINAL_QUOTE") return FtmPhase.MOA_FINAL;
  }

  return FtmPhase.ANALYSIS;
}

export async function listFtms(projectId: string, member: {
  role: ProjectRole;
  organizationId: string;
}) {
  const isEntreprise = member.role === ProjectRole.ENTREPRISE;

  const ftms = await prisma.ftmRecord.findMany({
    where: {
      projectId,
      ...(isEntreprise ? { concernedOrgs: { some: { organizationId: member.organizationId } } } : {}),
      OR: [
        { phase: { not: FtmPhase.CANCELLED } },
        { initiator: { organizationId: member.organizationId } }
      ]
    },
    orderBy: { updatedAt: "desc" },
    include: {
      concernedOrgs: { 
        where: isEntreprise ? { organizationId: member.organizationId } : undefined,
        include: { organization: true } 
      },
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

  return ftms;
}

export async function getFtmDetail(
  projectId: string,
  ftmId: string,
  member: { role: ProjectRole; organizationId: string },
) {
  const isCompany = member.role === ProjectRole.ENTREPRISE;
  
  const ftm = await prisma.ftmRecord.findFirst({
    where: { id: ftmId, projectId },
    include: {
      fromDemand: {
        include: {
          documents: true,
          initiator: { include: { organization: true, user: true } },
        },
      },
      concernedOrgs: {
        where: isCompany ? { organizationId: member.organizationId } : undefined,
        include: { organization: true }
      },
      lots: {
        where: isCompany ? { OR: [{ organizationId: member.organizationId }, { organizationId: null }] } : undefined,
        include: { organization: true }
      },
      initiator: { include: { user: true, organization: true } },
      chatMessages: {
        where: isCompany ? { targetOrganizationId: member.organizationId } : undefined,
        orderBy: { createdAt: "asc" },
        include: { author: { include: { user: true, organization: true } } },
      },
      quoteSubmissions: {
        where: isCompany ? { organizationId: member.organizationId } : undefined,
        orderBy: { submittedAt: "desc" },
        include: {
          organization: true,
          ftmLot: true,
          reviews: { include: { reviewer: { include: { user: true, organization: true } } } },
        },
      },
      invitations: { orderBy: { createdAt: "desc" as const } },
      documents: {
        where: isCompany ? { OR: [{ organizationId: member.organizationId }, { organizationId: null }] } : undefined,
        include: { uploadedBy: true, organization: true },
        orderBy: { createdAt: "desc" as const },
      },
      cancelledBy: { include: { user: true, organization: true } },
    },
  });
  
  if (!ftm) notFound();
  
  if (isCompany) {
    // If the constrained DB query returned zero concernedOrgs for this user, they don't belong here.
    if (ftm.concernedOrgs.length === 0) notFound();

    // Evaluate the phase AFTER constraining, ensuring the phase mathematically matches their restricted view.
    ftm.phase = computeEffectiveEntreprisePhase(ftm, member.organizationId);

    // Strip technical content until MOA has approved études — companies must not see work-in-progress studies.
    if (ftm.moaEtudesDecision !== MoaEtudesDecision.APPROVED) {
      ftm.etudesDescription = null;
      for (const lot of ftm.lots) {
        lot.descriptionTravaux = "";
      }
    }
  }
  
  return ftm;
}

export function phaseLabel(p: FtmPhase): string {
  const map: Record<FtmPhase, string> = {
    ETUDES: "1 — Études",
    QUOTING: "3 — Devis",
    ANALYSIS: "4 — Analyse MOE",
    MOA_FINAL: "5 — Validation MOA finale",
    CANCELLED: "Annulé",
    ACCEPTED: "Accepté",
  };
  return map[p] ?? p;
}

export async function listFtmDemands(projectId: string, pm: any) {
  const isEntreprise = pm.role === ProjectRole.ENTREPRISE;
  return await prisma.ftmDemand.findMany({
    where: {
      projectId,
      ...(isEntreprise 
           ? { initiatorProjectMemberId: pm.id } 
           : { status: { not: "DRAFT" } }),
    },
    orderBy: { createdAt: "desc" },
    include: {
      initiator: { include: { organization: true, user: true } },
      ftmRecords: { select: { id: true, number: true } },
    },
  });
}
