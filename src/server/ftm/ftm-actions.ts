"use server";

import { revalidatePath } from "next/cache";
import { randomBytes, createHash } from "crypto";
import {
  FtmPhase,
  MoaEtudesDecision,
  ProjectRole,
  ReviewContext,
  ReviewDecision,
  DeclineScope,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getAuthUser } from "@/lib/auth/user";
import { requireProjectMember } from "@/server/membership";
import { can } from "@/lib/permissions/resolve";
import { Capability } from "@prisma/client";
import { inngest } from "@/inngest/client";
import { uploadFtmDocument, deleteFtmDocument as deleteStorageFile } from "@/lib/storage";
import { z } from "zod";
import { validateFileMagicNumber } from "@/lib/validations/magic";

async function audit(userId: string | undefined, action: string, entity: string, entityId?: string, payload?: object) {
  await prisma.auditLog.create({
    data: {
      userId,
      action,
      entity,
      entityId,
      payload: payload as object | undefined,
    },
  });
}

import { CreateFtmPayloadSchema, FtmFileSchema } from "@/lib/validations/actions";

export async function createFtmAction(formData: FormData) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const payloadStr = formData.get("payload") as string;
  if (!payloadStr) throw new Error("Payload manquant.");
  const payload = JSON.parse(payloadStr);

  const parseResult = CreateFtmPayloadSchema.safeParse(payload);
  if (!parseResult.success) throw new Error(parseResult.error.errors[0].message);

  const { projectId, title, modificationSource, requestedMoeResponseDate, fromDemandId, lots, documentsMeta } = parseResult.data;

  const pm = await requireProjectMember(user.id, projectId);
  const ok = await can(pm.id, Capability.CREATE_FTM);
  if (!ok) throw new Error("Droit insuffisant pour créer un FTM.");

  // ── Bug #1 & #6: Demand idempotency + status guards ──
  let demandRecord: { id: string; description: string; requestedMoeResponseDate: Date | null } | null = null;
  if (fromDemandId) {
    const existingFtmFromDemand = await prisma.ftmRecord.findFirst({
      where: { fromDemandId },
      select: { id: true, number: true },
    });
    if (existingFtmFromDemand) {
      throw new Error(`Cette demande a déjà été transformée en FTM N°${existingFtmFromDemand.number}.`);
    }

    const demand = await prisma.ftmDemand.findUnique({
      where: { id: fromDemandId },
      select: { id: true, status: true, description: true, requestedMoeResponseDate: true },
    });
    if (!demand) throw new Error("Demande introuvable.");
    if (demand.status !== "PENDING_MOE") {
      throw new Error("Cette demande ne peut pas être transformée en FTM (statut invalide).");
    }
    demandRecord = demand;
  }

  const initiatorRole = pm.role;
  if (initiatorRole === ProjectRole.ENTREPRISE) {
    if (!lots.some((l) => l.organizationId === pm.organizationId)) {
      throw new Error("Ajoutez un lot correspondant à votre entreprise.");
    }
  }

  const files = formData.getAll("files") as File[];
  const uploadedFiles: { name: string; url: string; organizationId: string | null }[] = [];

  // Zod file validation & upload
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.size > 0) {
      FtmFileSchema.parse(file);
      const headerBuffer = Buffer.from(await file.slice(0, 4100).arrayBuffer());
      if (headerBuffer.length === 0) throw new Error("Fichier vide.");
      if (!validateFileMagicNumber(headerBuffer, file.type, file.name)) {
        throw new Error("Type de fichier non autorisé (Spoofing détecté).");
      }
    }
  }

  const ftm = await prisma.$transaction(async (tx) => {
    const agg = await tx.ftmRecord.aggregate({
      where: { projectId: projectId },
      _max: { number: true },
    });
    const nextNumber = (agg._max.number || 0) + 1;

    // ── Bug #2: Copy demand description into etudesDescription ──
    const initialEtudesDescription = demandRecord?.description ?? null;
    const initialResponseDate = requestedMoeResponseDate
      ? new Date(requestedMoeResponseDate)
      : demandRecord?.requestedMoeResponseDate ?? null;

    const record = await tx.ftmRecord.create({
      data: {
        projectId: projectId,
        number: nextNumber,
        title: title,
        modificationSource: modificationSource,
        initiatorProjectMemberId: pm.id,
        phase: "ETUDES",
        etudesDescription: initialEtudesDescription,
        requestedMoeResponseDate: initialResponseDate,
        fromDemandId: fromDemandId ?? null,
      },
    });

    if (fromDemandId) {
      await tx.ftmDemand.update({
        where: { id: fromDemandId },
        data: { status: "APPROVED" },
      });

      // ── Bug #7: Re-link demand documents to the new FTM ──
      await tx.ftmDocument.updateMany({
        where: { ftmDemandId: fromDemandId },
        data: { ftmId: record.id },
      });
    }

    const uniqueOrgs = Array.from(new Set(lots.map(l => l.organizationId)));
    for (const orgId of uniqueOrgs) {
      const lotData = lots.find(l => l.organizationId === orgId);
      await tx.ftmConcernedOrganization.create({
        data: {
          ftmId: record.id,
          organizationId: orgId,
          dateLimiteDevis: lotData?.expectedResponseDate ? new Date(lotData.expectedResponseDate) : null,
        },
      });
    }

    for (const lot of lots) {
      await tx.ftmLot.create({
        data: {
          ftmId: record.id,
          organizationId: lot.organizationId,
          lotLabel: lot.lotLabel ?? null,
          descriptionTravaux: lot.descriptionTravaux,
        },
      });
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 0) {
        const result = await uploadFtmDocument(record.id, file, file.name, file.type);
        const meta = documentsMeta.find(m => m.fileKey === file.name);
        await tx.ftmDocument.create({
          data: {
            ftmId: record.id,
            organizationId: meta?.organizationId || null,
            name: file.name,
            url: result.path,
            uploadedById: user.id,
          },
        });
      }
    }

    return record;
  });

  await audit(user.id, "FTM_CREATE", "FtmRecord", ftm.id, { title: title });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/ftms`);
  return ftm;
}


export async function saveEtudesAction(input: {
  projectId: string;
  ftmId: string;
  etudesDescription: string;
  companyUpdates: { organizationId: string; descriptionTravaux: string; expectedResponseDate: Date | null }[];
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, input.projectId);
  if (pm.role !== ProjectRole.MOE && pm.role !== ProjectRole.MOA) throw new Error("Réservé MOE/MOA.");
  const ok = await can(pm.id, Capability.EDIT_ETUDES);
  if (!ok) throw new Error("Droit insuffisant.");

  const existingFtm = await prisma.ftmRecord.findUnique({
    where: { id: input.ftmId },
    select: { etudesDescription: true, moaEtudesDecision: true, phase: true, title: true, number: true }
  });
  if (existingFtm?.phase === "CANCELLED" || existingFtm?.phase === "ACCEPTED") {
    throw new Error("Le FTM est verrouillé, action impossible.");
  }
  if (existingFtm?.etudesDescription && existingFtm.moaEtudesDecision !== "DECLINED") {
    throw new Error("Les études ont déjà été sauvegardées et ne peuvent plus être modifiées.");
  }

  // Detect first-time save: description was empty before this call
  const isFirstSubmission = !existingFtm?.etudesDescription && !!input.etudesDescription;

  await prisma.$transaction(async (tx) => {
    // 1. Update Global Etudes Description
    await tx.ftmRecord.update({
      where: { id: input.ftmId, projectId: input.projectId },
      data: { etudesDescription: input.etudesDescription },
    });

    // 2. Loop through individual company updates
    for (const update of input.companyUpdates) {
      // Update FtmLot
      await tx.ftmLot.updateMany({
        where: { ftmId: input.ftmId, organizationId: update.organizationId },
        data: { descriptionTravaux: update.descriptionTravaux },
      });

      // Update FtmConcernedOrganization (deadline)
      await tx.ftmConcernedOrganization.updateMany({
        where: { ftmId: input.ftmId, organizationId: update.organizationId },
        data: { dateLimiteDevis: update.expectedResponseDate },
      });
    }
  });

  // Notify MOA on first études submission only
  if (isFirstSubmission && existingFtm?.title && existingFtm?.number) {
    await inngest.send({
      name: "ftm/etudes.submitted",
      data: {
        projectId: input.projectId,
        ftmId: input.ftmId,
        ftmTitle: existingFtm.title,
        ftmNumber: existingFtm.number,
      },
    });
  }

  await audit(user.id, "FTM_ETUDES_SAVE", "FtmRecord", input.ftmId);
  revalidatePath(`/projects/${input.projectId}/ftms/${input.ftmId}`);
  return { ok: true };
}

export async function addCompanyToFtmAction(input: {
  projectId: string;
  ftmId: string;
  organizationId: string;
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, input.projectId);
  if (pm.role !== ProjectRole.MOE && pm.role !== ProjectRole.MOA) throw new Error("Réservé MOE/MOA.");
  const ok = await can(pm.id, Capability.EDIT_ETUDES);
  if (!ok) throw new Error("Droit insuffisant.");

  const existingFtm = await prisma.ftmRecord.findUnique({
    where: { id: input.ftmId },
    select: { etudesDescription: true, moaEtudesDecision: true, phase: true }
  });
  if (existingFtm?.phase === "CANCELLED" || existingFtm?.phase === "ACCEPTED") {
    throw new Error("Le FTM est verrouillé, action impossible.");
  }
  if (existingFtm?.etudesDescription && existingFtm.moaEtudesDecision !== "DECLINED") {
    throw new Error("Les études ont déjà été sauvegardées et ne peuvent plus être modifiées.");
  }

  const exists = await prisma.ftmConcernedOrganization.findFirst({
    where: { ftmId: input.ftmId, organizationId: input.organizationId },
  });
  if (exists) throw new Error("Cette entreprise est déjà associée à ce FTM.");

  await prisma.$transaction(async (tx) => {
    await tx.ftmConcernedOrganization.create({
      data: {
        ftmId: input.ftmId,
        organizationId: input.organizationId,
        dateLimiteDevis: null,
      },
    });

    await tx.ftmLot.create({
      data: {
        ftmId: input.ftmId,
        organizationId: input.organizationId,
        descriptionTravaux: "",
      },
    });
  });

  await audit(user.id, "FTM_ADD_COMPANY", "FtmRecord", input.ftmId, { organizationId: input.organizationId });
  revalidatePath(`/projects/${input.projectId}/ftms/${input.ftmId}`);
  return { ok: true };
}

export async function inviteEtudesParticipantAction(input: {
  projectId: string;
  ftmId: string;
  email: string;
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, input.projectId);
  const ok = await can(pm.id, Capability.INVITE_ETUDES_PARTICIPANT);
  if (!ok) throw new Error("Droit insuffisant.");

  const ftm = await prisma.ftmRecord.findFirst({
    where: { id: input.ftmId, projectId: input.projectId }
  });
  if (!ftm) throw new Error("FTM introuvable dans ce projet.");

  const raw = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(raw).digest("hex");
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);

  const existingUser = await prisma.user.findUnique({
    where: { email: input.email.toLowerCase() },
  });

  await prisma.ftmParticipantInvitation.create({
    data: {
      ftmId: input.ftmId,
      email: input.email.toLowerCase(),
      userId: existingUser?.id,
      tokenHash,
      expiresAt,
    },
  });

  await audit(user.id, "FTM_INVITE_ETUDES", "FtmParticipantInvitation", input.ftmId, {
    email: input.email,
  });

  // Fire Inngest event — durable delivery with automatic retry
  await inngest.send({
    name: "ftm/invitation.created",
    data: {
      toEmail: input.email,
      token: raw,
      projectId: input.projectId,
      ftmId: input.ftmId,
      ftmTitle: ftm.title,
      ftmNumber: ftm.number,
    },
  });

  revalidatePath(`/projects/${input.projectId}/ftms/${input.ftmId}`);
  return { token: raw, expiresAt };
}

export async function assignProjectMemberToEtudesAction(input: {
  projectId: string;
  ftmId: string;
  projectMemberId: string;
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, input.projectId);
  const ok = await can(pm.id, Capability.INVITE_ETUDES_PARTICIPANT);
  if (!ok) throw new Error("Droit insuffisant.");

  // Validate target member exists and is MOE or MOA
  const targetMember = await prisma.projectMember.findFirst({
    where: { id: input.projectMemberId, projectId: input.projectId },
    include: { user: true },
  });
  if (!targetMember) throw new Error("Membre introuvable.");
  if (targetMember.role !== ProjectRole.MOE && targetMember.role !== ProjectRole.MOA) {
    throw new Error("Seuls les membres MOE ou MOA peuvent être assignés aux études.");
  }

  const ftm = await prisma.ftmRecord.findFirst({
    where: { id: input.ftmId, projectId: input.projectId }
  });
  if (!ftm) throw new Error("FTM introuvable dans ce projet.");

  // Prevent duplicates
  const existing = await prisma.ftmParticipantInvitation.findFirst({
    where: { ftmId: input.ftmId, email: targetMember.user.email },
  });
  if (existing) throw new Error("Ce membre est déjà participant aux études.");

  // Create a pre-consumed invitation (no token needed — already authenticated)
  await prisma.ftmParticipantInvitation.create({
    data: {
      ftmId: input.ftmId,
      email: targetMember.user.email,
      userId: targetMember.userId,
      tokenHash: "member-assignment",
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // no expiry concern
      role: "BUREAU_ETUDES",
    },
  });

  await audit(user.id, "FTM_ASSIGN_ETUDES_MEMBER", "FtmParticipantInvitation", input.ftmId, {
    assignedMemberId: input.projectMemberId,
    email: targetMember.user.email,
  });

  revalidatePath(`/projects/${input.projectId}/ftms/${input.ftmId}`);
  return { ok: true };
}

export async function moaDecideEtudesAction(input: {
  projectId: string;
  ftmId: string;
  decision: "APPROVED" | "DECLINED";
  comment?: string;
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, input.projectId);
  if (pm.role !== ProjectRole.MOA) throw new Error("Réservé MOA.");
  const ok = await can(pm.id, Capability.VALIDATE_ETUDES_MOA);
  if (!ok) throw new Error("Droit insuffisant.");

  const ftm = await prisma.ftmRecord.findFirst({
    where: { id: input.ftmId, projectId: input.projectId, phase: FtmPhase.ETUDES },
  });
  if (!ftm) throw new Error("FTM introuvable ou phase incorrecte.");
  if (ftm.phase === "CANCELLED" || ftm.phase === "ACCEPTED") {
    throw new Error("Le FTM est verrouillé, action impossible.");
  }

  const decision =
    input.decision === "APPROVED" ? MoaEtudesDecision.APPROVED : MoaEtudesDecision.DECLINED;
  const phase = input.decision === "APPROVED" ? FtmPhase.ETUDES : FtmPhase.CANCELLED;

  await prisma.ftmRecord.update({
    where: { id: input.ftmId },
    data: {
      moaEtudesDecision: decision,
      moaEtudesDecidedById: pm.id,
      moaEtudesDecidedAt: new Date(),
      moaEtudesComment: input.comment ?? null,
      phase,
    },
  });

  // Notify MOE of the MOA decision
  await inngest.send({
    name: "ftm/etudes.decided",
    data: {
      projectId: input.projectId,
      ftmId: input.ftmId,
      ftmTitle: ftm.title,
      ftmNumber: ftm.number,
      decision: input.decision,
      comment: input.comment ?? null,
    },
  });

  await audit(user.id, "FTM_MOA_ETUDES", "FtmRecord", input.ftmId, input);
  revalidatePath(`/projects/${input.projectId}/ftms/${input.ftmId}`);
  return { ok: true };
}

export async function openQuotingAction(input: {
  projectId: string;
  ftmId: string;
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, input.projectId);
  if (pm.role !== ProjectRole.MOE && pm.role !== ProjectRole.MOA) throw new Error("Réservé MOE/MOA.");
  const ok =
    (await can(pm.id, Capability.SET_DEADLINES_AFTER_ETUDES)) ||
    (await can(pm.id, Capability.VALIDATE_ETUDES_MOA));
  if (!ok) throw new Error("Droit insuffisant.");

  const ftm = await prisma.ftmRecord.findFirst({
    where: {
      id: input.ftmId,
      projectId: input.projectId,
      phase: FtmPhase.ETUDES,
      moaEtudesDecision: MoaEtudesDecision.APPROVED,
    },
  });
  if (!ftm) throw new Error("Les études doivent être approuvées par le MOA.");

  await prisma.ftmRecord.update({
    where: { id: input.ftmId },
    data: { phase: FtmPhase.QUOTING },
  });

  // Notify all concerned companies
  await inngest.send({
    name: "ftm/quoting.opened",
    data: {
      projectId: input.projectId,
      ftmId: input.ftmId,
      ftmTitle: ftm.title,
      ftmNumber: ftm.number,
    },
  });

  await audit(user.id, "FTM_OPEN_QUOTING", "FtmRecord", input.ftmId);
  revalidatePath(`/projects/${input.projectId}/ftms/${input.ftmId}`);
  return { ok: true };
}

export async function postFtmChatAction(input: {
  projectId: string;
  ftmId: string;
  body: string;
  targetOrganizationId: string | null;
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, input.projectId);
  const ok = await can(pm.id, Capability.POST_FTM_CHAT);
  if (!ok) throw new Error("Droit insuffisant.");

  let finalTargetOrgId = input.targetOrganizationId;
  if (pm.role === ProjectRole.ENTREPRISE) {
    // Les entreprises écrivent toujours dans leur propre fil
    finalTargetOrgId = pm.organizationId;
  }

  const ftm = await prisma.ftmRecord.findFirst({
    where: { id: input.ftmId, projectId: input.projectId }
  });
  if (!ftm) throw new Error("FTM introuvable dans ce projet.");

  await prisma.ftmChatMessage.create({
    data: {
      ftmId: input.ftmId,
      authorProjectMemberId: pm.id,
      targetOrganizationId: finalTargetOrgId,
      body: input.body,
    },
  });
  revalidatePath(`/projects/${input.projectId}/ftms/${input.ftmId}`);
  return { ok: true };
}

import { SubmitQuoteSchema } from "@/lib/validations/actions";

export async function submitQuoteAction(formData: FormData) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const parseResult = SubmitQuoteSchema.safeParse({
    projectId: formData.get("projectId"),
    ftmId: formData.get("ftmId"),
    ftmLotId: formData.get("ftmLotId"),
    organizationId: formData.get("organizationId"),
    amountHtCents: formData.get("amountHtCents"),
    quoteNumber: formData.get("quoteNumber"),
    file: formData.get("file") as File | null,
  });

  if (!parseResult.success) {
    throw new Error(parseResult.error.errors[0].message);
  }

  const { projectId, ftmId, ftmLotId, organizationId, amountHtCents, quoteNumber, file } = parseResult.data;

  const pm = await requireProjectMember(user.id, projectId);
  if (pm.organizationId !== organizationId) throw new Error("Organisation incorrecte.");
  const ok = await can(pm.id, Capability.SUBMIT_QUOTE);
  if (!ok) throw new Error("Droit insuffisant.");

  const ftm = await prisma.ftmRecord.findFirst({
    where: { id: ftmId, projectId: projectId, phase: { in: [FtmPhase.QUOTING, FtmPhase.ANALYSIS] } },
  });
  if (!ftm) throw new Error("Soumission impossible à cette phase.");

  const lot = await prisma.ftmLot.findFirst({
    where: {
      id: ftmLotId,
      ftmId: ftmId,
      organizationId: organizationId,
    },
  });
  if (!lot) throw new Error("Lot / entreprise incohérents.");

  const last = await prisma.ftmQuoteSubmission.findFirst({
    where: { ftmLotId: ftmLotId, organizationId: organizationId },
    orderBy: { indice: "desc" },
  });
  const indice = (last?.indice ?? 0) + 1;

  let documentUrl: string | null = null;
  let documentName: string | null = null;

  if (file && file.size > 0) {
    const headerBuffer = Buffer.from(await file.slice(0, 4100).arrayBuffer());
    if (headerBuffer.length === 0) throw new Error("Fichier vide.");

    // Anti-spoofing logic
    if (!validateFileMagicNumber(headerBuffer, file.type, file.name)) {
      throw new Error("Type de fichier non autorisé (Spoofing détecté).");
    }

    // Secure isolated bucket handled intrinsically
    const result = await uploadFtmDocument(ftmId, file, file.name, file.type);
    documentUrl = result.path;
    documentName = file.name;
  }

  const submission = await prisma.$transaction(async (tx) => {
    const sub = await tx.ftmQuoteSubmission.create({
      data: {
        ftmId: ftmId,
        ftmLotId: ftmLotId,
        organizationId: organizationId,
        indice,
        amountHtCents: amountHtCents,
        quoteNumber,
        documentUrl,
        documentName,
      },
    });
    await tx.ftmRecord.update({
      where: { id: ftmId },
      data: { phase: FtmPhase.ANALYSIS },
    });
    return sub;
  });

  // Resolve FTM title + number for the notification
  const ftmRecord = await prisma.ftmRecord.findUnique({
    where: { id: ftmId },
    select: { title: true, number: true },
  });

  const companyOrg = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });

  await inngest.send({
    name: "ftm/quote.submitted",
    data: {
      projectId,
      ftmId,
      ftmTitle: ftmRecord?.title ?? "",
      ftmNumber: ftmRecord?.number ?? 0,
      companyName: companyOrg?.name ?? organizationId,
      amountHtCents: amountHtCents.toString(),
      submittedAt: submission.submittedAt.toISOString(),
    },
  });

  await audit(user.id, "FTM_QUOTE_SUBMIT", "FtmQuoteSubmission", submission.id);
  revalidatePath(`/projects/${projectId}/ftms/${ftmId}`);
  return { ok: true };
}

export async function moeAnalyzeQuoteAction(input: {
  projectId: string;
  ftmId: string;
  quoteSubmissionId: string;
  decision: "ACCEPT" | "RESEND_CORRECTION" | "DECLINE";
  comment: string;
  declineScope?: "WHOLE_FTM" | "THIS_COMPANY_ONLY";
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, input.projectId);
  if (pm.role !== ProjectRole.MOE) throw new Error("Réservé MOE.");
  const ok = await can(pm.id, Capability.ANALYZE_QUOTE_MOE);
  if (!ok) throw new Error("Droit insuffisant.");

  const ftm = await prisma.ftmRecord.findFirst({
    where: { id: input.ftmId, projectId: input.projectId }
  });
  if (!ftm) throw new Error("FTM introuvable dans ce projet.");
  if (ftm.phase === "CANCELLED" || ftm.phase === "ACCEPTED" || ftm.phase === "MOA_FINAL") {
    throw new Error("Action impossible dans cette phase.");
  }

  const sub = await prisma.ftmQuoteSubmission.findFirst({
    where: { id: input.quoteSubmissionId, ftmId: input.ftmId },
  });
  if (!sub) throw new Error("Devis introuvable.");

  const decision =
    input.decision === "ACCEPT"
      ? ReviewDecision.ACCEPT
      : input.decision === "RESEND_CORRECTION"
        ? ReviewDecision.RESEND_CORRECTION
        : ReviewDecision.DECLINE;

  await prisma.$transaction(async (tx) => {
    await tx.ftmReview.create({
      data: {
        quoteSubmissionId: sub.id,
        context: ReviewContext.MOE_ANALYSIS,
        reviewerProjectMemberId: pm.id,
        decision,
        comment: input.comment,
        declineScope:
          decision === ReviewDecision.DECLINE && input.declineScope
            ? input.declineScope === "WHOLE_FTM"
              ? DeclineScope.WHOLE_FTM
              : DeclineScope.THIS_COMPANY_ONLY
            : null,
      },
    });

    if (decision === ReviewDecision.DECLINE) {
      if (input.declineScope === "WHOLE_FTM") {
        await tx.ftmRecord.update({
          where: { id: input.ftmId },
          data: { phase: FtmPhase.CANCELLED },
        });
        return;
      } else {
        await tx.ftmConcernedOrganization.deleteMany({
          where: { ftmId: input.ftmId, organizationId: sub.organizationId },
        });
      }
    }

    const remainingOrgs = await tx.ftmConcernedOrganization.findMany({ where: { ftmId: input.ftmId } });
    if (remainingOrgs.length === 0 && decision !== ReviewDecision.DECLINE) {
      await tx.ftmRecord.update({ where: { id: input.ftmId }, data: { phase: FtmPhase.CANCELLED } });
      return;
    }

    let allAccepted = true;
    for (const org of remainingOrgs) {
      const latestForOrg = await tx.ftmQuoteSubmission.findFirst({
        where: { ftmId: input.ftmId, organizationId: org.organizationId },
        orderBy: { indice: "desc" }
      });
      if (!latestForOrg) {
        allAccepted = false;
        break;
      }
      const latestReview = await tx.ftmReview.findFirst({
        where: { quoteSubmissionId: latestForOrg.id, context: ReviewContext.MOE_ANALYSIS },
        orderBy: { decidedAt: "desc" }
      });
      if (latestReview?.decision !== ReviewDecision.ACCEPT) {
        allAccepted = false;
        break;
      }
    }

    if (allAccepted) {
      await tx.ftmRecord.update({
        where: { id: input.ftmId },
        data: { phase: FtmPhase.MOA_FINAL },
      });
    } else {
      const currentFtm = await tx.ftmRecord.findUnique({ where: { id: input.ftmId } });
      if (currentFtm?.phase !== FtmPhase.CANCELLED) {
        await tx.ftmRecord.update({
          where: { id: input.ftmId },
          data: { phase: FtmPhase.QUOTING },
        });
      }
    }
  });

  // Notify the submitting company of the MOE decision
  await inngest.send({
    name: "ftm/quote.reviewed",
    data: {
      projectId: input.projectId,
      ftmId: input.ftmId,
      ftmTitle: ftm.title,
      ftmNumber: ftm.number,
      organizationId: sub.organizationId,
      decision: input.decision,
      comment: input.comment ?? null,
    },
  });

  // If all accepted → the phase just moved to MOA_FINAL — no separate event for that
  // ftm/accepted fires only when MOA also accepts in moaFinalQuoteAction

  await audit(user.id, "FTM_MOE_ANALYSIS", "FtmReview", input.quoteSubmissionId, input);
  revalidatePath(`/projects/${input.projectId}/ftms/${input.ftmId}`);
  return { ok: true };
}

export async function moaFinalQuoteAction(input: {
  projectId: string;
  ftmId: string;
  quoteSubmissionId: string;
  decision: "ACCEPT" | "RESEND_CORRECTION" | "DECLINE";
  comment: string;
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, input.projectId);
  if (pm.role !== ProjectRole.MOA) throw new Error("Réservé MOA.");
  const ok = await can(pm.id, Capability.FINAL_VALIDATE_QUOTE_MOA);
  if (!ok) throw new Error("Droit insuffisant.");

  const ftm = await prisma.ftmRecord.findFirst({
    where: { id: input.ftmId, projectId: input.projectId }
  });
  if (!ftm) throw new Error("FTM introuvable dans ce projet.");
  if (ftm.phase === "CANCELLED" || ftm.phase === "ACCEPTED") {
    throw new Error("Action impossible dans cette phase.");
  }

  const sub = await prisma.ftmQuoteSubmission.findFirst({
    where: { id: input.quoteSubmissionId, ftmId: input.ftmId },
  });
  if (!sub) throw new Error("Devis introuvable.");

  const decision =
    input.decision === "ACCEPT"
      ? ReviewDecision.ACCEPT
      : input.decision === "RESEND_CORRECTION"
        ? ReviewDecision.RESEND_CORRECTION
        : ReviewDecision.DECLINE;

  await prisma.$transaction(async (tx) => {
    await tx.ftmReview.create({
      data: {
        quoteSubmissionId: sub.id,
        context: ReviewContext.MOA_FINAL_QUOTE,
        reviewerProjectMemberId: pm.id,
        decision,
        comment: input.comment,
      },
    });

    if (decision === ReviewDecision.DECLINE) {
      await tx.ftmRecord.update({
        where: { id: input.ftmId },
        data: { phase: FtmPhase.CANCELLED },
      });
      return;
    }

    const remainingOrgs = await tx.ftmConcernedOrganization.findMany({ where: { ftmId: input.ftmId } });
    let allAccepted = true;
    for (const org of remainingOrgs) {
      const latestForOrg = await tx.ftmQuoteSubmission.findFirst({
        where: { ftmId: input.ftmId, organizationId: org.organizationId },
        orderBy: { indice: "desc" }
      });
      if (!latestForOrg) {
        allAccepted = false;
        break;
      }
      const latestReview = await tx.ftmReview.findFirst({
        where: { quoteSubmissionId: latestForOrg.id, context: ReviewContext.MOA_FINAL_QUOTE },
        orderBy: { decidedAt: "desc" }
      });
      if (latestReview?.decision !== ReviewDecision.ACCEPT) {
        allAccepted = false;
        break;
      }
    }

    if (allAccepted) {
      await tx.ftmRecord.update({
        where: { id: input.ftmId },
        data: { phase: FtmPhase.ACCEPTED },
      });
    } else if (decision === ReviewDecision.RESEND_CORRECTION) {
      await tx.ftmRecord.update({
        where: { id: input.ftmId },
        data: { phase: FtmPhase.QUOTING },
      });
    }
  });

  // Re-read phase to determine which events to fire
  const updatedFtm = await prisma.ftmRecord.findUnique({
    where: { id: input.ftmId },
    select: { phase: true, title: true, number: true },
  });

  await inngest.send({
    name: "ftm/quote.moa-final",
    data: {
      projectId: input.projectId,
      ftmId: input.ftmId,
      ftmTitle: ftm.title,
      ftmNumber: ftm.number,
      organizationId: sub.organizationId,
      decision: input.decision,
      comment: input.comment ?? null,
    },
  });

  // Fire accepted event if the FTM just closed
  if (updatedFtm?.phase === FtmPhase.ACCEPTED) {
    await inngest.send({
      name: "ftm/accepted",
      data: {
        projectId: input.projectId,
        ftmId: input.ftmId,
        ftmTitle: ftm.title,
        ftmNumber: ftm.number,
      },
    });
  }

  await audit(user.id, "FTM_MOA_FINAL", "FtmReview", input.quoteSubmissionId, input);
  revalidatePath(`/projects/${input.projectId}/ftms/${input.ftmId}`);
  return { ok: true };
}

export async function setDesignatedMoaValidatorAction(input: {
  projectId: string;
  ftmId: string;
  designatedMoaValidatorId: string | null;
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");
  const pm = await requireProjectMember(user.id, input.projectId);
  const ok = await can(pm.id, Capability.ADMIN_PROJECT_PERMISSIONS);
  if (!ok) throw new Error("Droit insuffisant (administration projet).");

  await prisma.ftmRecord.update({
    where: { id: input.ftmId, projectId: input.projectId },
    data: { designatedMoaValidatorId: input.designatedMoaValidatorId },
  });
  revalidatePath(`/projects/${input.projectId}/ftms/${input.ftmId}`);
  return { ok: true };
}

export async function updateReminderSettingsAction(
  concernedOrgId: string,
  projectId: string,
  ftmId: string,
  reminderFrequencyDays: number | null,
) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const pm = await requireProjectMember(user.id, projectId);
  if (pm.role !== ProjectRole.MOE && pm.role !== ProjectRole.MOA) {
    throw new Error("Seul le MOE ou le MOA peut configurer les rappels.");
  }

  const ftm = await prisma.ftmRecord.findFirst({
    where: { id: ftmId, projectId }
  });
  if (!ftm) throw new Error("FTM introuvable dans ce projet.");

  const concernedOrg = await prisma.ftmConcernedOrganization.findFirst({
    where: { id: concernedOrgId, ftmId }
  });
  if (!concernedOrg) throw new Error("Organisation introuvable pour ce FTM.");

  await prisma.ftmConcernedOrganization.update({
    where: { id: concernedOrgId },
    data: { reminderFrequencyDays },
  });

  revalidatePath(`/projects/${projectId}/ftms/${ftmId}`);
  return { ok: true };
}

export async function uploadFtmDocumentAction(formData: FormData) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const projectId = formData.get("projectId") as string;
  const ftmId = formData.get("ftmId") as string;
  const organizationId = (formData.get("organizationId") as string) || null;
  const file = formData.get("file") as File | null;

  if (!projectId || !ftmId) throw new Error("Paramètres manquants.");
  if (!file || file.size === 0) throw new Error("Aucun fichier sélectionné.");

  const pm = await requireProjectMember(user.id, projectId);
  if (pm.role !== ProjectRole.MOE && pm.role !== ProjectRole.MOA) {
    throw new Error("Seuls le MOE et le MOA peuvent uploader des documents.");
  }
  const hasPermission = await can(pm.id, Capability.EDIT_ETUDES);
  if (!hasPermission) throw new Error("Permission insuffisante.");

  const ftm = await prisma.ftmRecord.findFirst({
    where: { id: ftmId, projectId },
  });
  if (!ftm) throw new Error("FTM introuvable.");
  if (ftm.phase !== FtmPhase.ETUDES) {
    throw new Error("L'upload de documents n'est possible que pendant la phase Études.");
  }

  const headerBuffer = Buffer.from(await file.slice(0, 4100).arrayBuffer());
  if (headerBuffer.length === 0) throw new Error("Fichier vide.");

  if (!validateFileMagicNumber(headerBuffer, file.type, file.name)) {
    throw new Error("Type de fichier non autorisé (Spoofing détecté).");
  }

  // Direct hand-off of the `File` object (which works natively with Supabase JS stream uploads) prevents Node.js OOM
  const { path } = await uploadFtmDocument(ftmId, file, file.name, file.type);

  await prisma.ftmDocument.create({
    data: {
      ftmId,
      organizationId,
      name: file.name,
      url: path,
      uploadedById: user.id,
    },
  });

  await audit(user.id, "FTM_DOCUMENT_UPLOAD", "FtmDocument", ftmId, { fileName: file.name });
  revalidatePath(`/projects/${projectId}/ftms/${ftmId}`);
  return { ok: true };
}

export async function deleteFtmDocumentAction(input: {
  projectId: string;
  ftmId: string;
  documentId: string;
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const pm = await requireProjectMember(user.id, input.projectId);
  if (pm.role !== ProjectRole.MOE && pm.role !== ProjectRole.MOA) {
    throw new Error("Seuls le MOE et le MOA peuvent supprimer des documents.");
  }
  const hasPermission = await can(pm.id, Capability.EDIT_ETUDES);
  if (!hasPermission) throw new Error("Permission insuffisante.");

  const ftm = await prisma.ftmRecord.findFirst({
    where: { id: input.ftmId, projectId: input.projectId },
  });
  if (!ftm) throw new Error("FTM introuvable.");
  if (ftm.phase !== FtmPhase.ETUDES) {
    throw new Error("La suppression de documents n'est possible que pendant la phase Études.");
  }

  const doc = await prisma.ftmDocument.findFirst({
    where: { id: input.documentId, ftmId: input.ftmId },
  });
  if (!doc) throw new Error("Document introuvable.");

  // Delete from storage first, then DB
  try {
    await deleteStorageFile(doc.url);
  } catch {
    // If storage deletion fails (file already gone), continue with DB cleanup
  }

  await prisma.ftmDocument.delete({ where: { id: input.documentId } });

  await audit(user.id, "FTM_DOCUMENT_DELETE", "FtmDocument", input.ftmId, { documentId: input.documentId, fileName: doc.name });
  revalidatePath(`/projects/${input.projectId}/ftms/${input.ftmId}`);
  return { ok: true };
}

export async function cancelFtmAction(input: {
  projectId: string;
  ftmId: string;
  reason: string;
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non autorisé.");
  const pm = await requireProjectMember(user.id, input.projectId);

  if (pm.role !== ProjectRole.MOE && pm.role !== ProjectRole.MOA) {
    throw new Error("Seul le MOE ou MOA peut annuler un FTM.");
  }

  const ftm = await prisma.ftmRecord.findFirst({
    where: { id: input.ftmId, projectId: input.projectId },
    include: {
      concernedOrgs: true
    }
  });
  if (!ftm) throw new Error("FTM introuvable.");

  if (ftm.phase === FtmPhase.CANCELLED || ftm.phase === FtmPhase.ACCEPTED) {
    throw new Error("Action impossible sur un FTM terminé ou annulé.");
  }

  await prisma.ftmRecord.update({
    where: { id: input.ftmId },
    data: {
      phase: FtmPhase.CANCELLED,
      preCancellationPhase: ftm.phase,
      cancellationReason: input.reason,
      cancelledById: pm.id,
      cancelledAt: new Date(),
    },
  });

  await prisma.ftmChatMessage.create({
    data: {
      body: `**FTM Annulé**\nMotif : ${input.reason}`,
      ftmId: input.ftmId,
      authorProjectMemberId: pm.id,
    },
  });

  await audit(user.id, "FTM_CANCEL", "FtmRecord", input.ftmId, { reason: input.reason });

  // Notify all concerned companies via Inngest (durable, retried)
  await inngest.send({
    name: "ftm/cancelled",
    data: {
      projectId: input.projectId,
      ftmId: input.ftmId,
      ftmTitle: ftm.title,
      ftmNumber: ftm.number,
      reason: input.reason,
    },
  });

  revalidatePath(`/projects/${input.projectId}/ftms/${input.ftmId}`);
  revalidatePath(`/projects/${input.projectId}/ftms`);
  return { ok: true };
}

export async function reopenFtmAction(input: {
  projectId: string;
  ftmId: string;
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non autorisé.");
  const pm = await requireProjectMember(user.id, input.projectId);

  if (pm.role !== ProjectRole.MOE && pm.role !== ProjectRole.MOA) {
    throw new Error("Seul le MOE ou MOA peut rouvrir un FTM.");
  }

  const ftm = await prisma.ftmRecord.findFirst({
    where: { id: input.ftmId, projectId: input.projectId },
  });
  if (!ftm) throw new Error("FTM introuvable.");

  if (ftm.phase !== FtmPhase.CANCELLED) {
    throw new Error("Le FTM n'est pas annulé.");
  }

  await prisma.ftmRecord.update({
    where: { id: input.ftmId },
    data: {
      phase: ftm.preCancellationPhase ?? FtmPhase.ETUDES,
      preCancellationPhase: null,
      cancellationReason: null,
      cancelledById: null,
      cancelledAt: null,
    },
  });

  await prisma.ftmChatMessage.create({
    data: {
      body: `**FTM Rouvert**\nLe FTM a été réactivé dans sa phase précédente par le MOE/MOA.`,
      ftmId: input.ftmId,
      authorProjectMemberId: pm.id,
    },
  });

  await audit(user.id, "FTM_REOPEN", "FtmRecord", input.ftmId, {});

  revalidatePath(`/projects/${input.projectId}/ftms/${input.ftmId}`);
  revalidatePath(`/projects/${input.projectId}/ftms`);
  return { ok: true };
}

import { CreateFtmDemandPayloadSchema, UpdateFtmDemandDraftPayloadSchema } from "@/lib/validations/actions";

export async function createFtmDemandAction(formData: FormData) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const payloadStr = formData.get("payload") as string;
  if (!payloadStr) throw new Error("Payload manquant.");
  const payload = JSON.parse(payloadStr);

  const parseResult = CreateFtmDemandPayloadSchema.safeParse(payload);
  if (!parseResult.success) throw new Error(parseResult.error.errors[0].message);

  const { projectId, title, isDraft, description, requestedMoeResponseDate, documentsMeta } = parseResult.data;

  const pm = await requireProjectMember(user.id, projectId);
  if (pm.role !== ProjectRole.ENTREPRISE) throw new Error("Seule une entreprise peut créer une demande.");

  const files = formData.getAll("files") as File[];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.size > 0) {
      FtmFileSchema.parse(file);
      const headerBuffer = Buffer.from(await file.slice(0, 4100).arrayBuffer());
      if (headerBuffer.length === 0) throw new Error("Fichier vide.");
      if (!validateFileMagicNumber(headerBuffer, file.type, file.name)) {
        throw new Error("Type de fichier non autorisé (Spoofing détecté).");
      }
    }
  }

  const demand = await prisma.$transaction(async (tx) => {
    const record = await tx.ftmDemand.create({
      data: {
        projectId,
        initiatorProjectMemberId: pm.id,
        title,
        description,
        requestedMoeResponseDate: requestedMoeResponseDate ? new Date(requestedMoeResponseDate) : null,
        status: isDraft ? "DRAFT" : "PENDING_MOE",
      },
    });

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 0) {
        const result = await uploadFtmDocument(record.id, file, file.name, file.type);
        await tx.ftmDocument.create({
          data: {
            ftmDemandId: record.id,
            name: file.name,
            url: result.path,
            uploadedById: user.id,
          },
        });
      }
    }

    return record;
  });

  await audit(user.id, "FTM_DEMAND_CREATED", "FtmDemand", demand.id, { isDraft });

  // Notify MOE only when the demand is submitted (not while it's still a draft)
  if (!isDraft) {
    const initiatorOrg = await prisma.organization.findFirst({
      where: { projectMembers: { some: { id: pm.id } } },
      select: { name: true },
    });
    await inngest.send({
      name: "ftm/demand.submitted",
      data: {
        projectId,
        demandId: demand.id,
        demandTitle: title,
        companyName: initiatorOrg?.name ?? "Entreprise",
        requestedDate: requestedMoeResponseDate ?? null,
      },
    });
  }

  revalidatePath(`/projects/${projectId}/demands`);
  return demand;
}

export async function updateFtmDemandDraftAction(formData: FormData) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const payloadStr = formData.get("payload") as string;
  if (!payloadStr) throw new Error("Payload manquant.");
  const payload = JSON.parse(payloadStr);

  const parseResult = UpdateFtmDemandDraftPayloadSchema.safeParse(payload);
  if (!parseResult.success) throw new Error(parseResult.error.errors[0].message);

  const { demandId, projectId, title, isDraft, description, requestedMoeResponseDate, documentsMeta } = parseResult.data;

  const pm = await requireProjectMember(user.id, projectId);

  const existing = await prisma.ftmDemand.findUnique({ where: { id: demandId } });
  if (!existing) throw new Error("Demande introuvable.");
  if (existing.initiatorProjectMemberId !== pm.id) throw new Error("Accès refusé.");
  if (existing.status !== "DRAFT") throw new Error("La demande n'est plus un brouillon.");

  const files = formData.getAll("files") as File[];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (file.size > 0) {
      FtmFileSchema.parse(file);
      const headerBuffer = Buffer.from(await file.slice(0, 4100).arrayBuffer());
      if (headerBuffer.length === 0) throw new Error("Fichier vide.");
      if (!validateFileMagicNumber(headerBuffer, file.type, file.name)) {
        throw new Error("Type de fichier non autorisé (Spoofing détecté).");
      }
    }
  }

  const demand = await prisma.$transaction(async (tx) => {
    const record = await tx.ftmDemand.update({
      where: { id: demandId },
      data: {
        title,
        description,
        requestedMoeResponseDate: requestedMoeResponseDate ? new Date(requestedMoeResponseDate) : null,
        status: isDraft ? "DRAFT" : "PENDING_MOE",
      },
    });

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 0) {
        const result = await uploadFtmDocument(record.id, file, file.name, file.type);
        await tx.ftmDocument.create({
          data: {
            ftmDemandId: record.id,
            name: file.name,
            url: result.path,
            uploadedById: user.id,
          },
        });
      }
    }

    return record;
  });

  await audit(user.id, "FTM_DEMAND_DRAFT_UPDATED", "FtmDemand", demand.id, { isDraft });

  revalidatePath(`/projects/${projectId}/demands`);
  return demand;
}

export async function rejectFtmDemandAction(projectId: string, demandId: string) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const pm = await requireProjectMember(user.id, projectId);
  if (pm.role !== ProjectRole.MOE && pm.role !== ProjectRole.MOA) {
    throw new Error("Droit insuffisant.");
  }

  const existing = await prisma.ftmDemand.findUnique({ where: { id: demandId } });
  if (!existing) throw new Error("Demande introuvable");
  if (existing.status !== "PENDING_MOE") throw new Error("Statut invalide pour le refus.");

  await prisma.ftmDemand.update({
    where: { id: demandId },
    data: {
      status: "REJECTED",
      rejectedByMemberId: pm.id,
      rejectedAt: new Date(),
    },
  });

  await audit(user.id, "FTM_DEMAND_REJECTED", "FtmDemand", demandId, {});

  await inngest.send({
    name: "ftm/demand.rejected",
    data: {
      projectId,
      demandId,
      demandTitle: existing.title,
      initiatorProjectMemberId: existing.initiatorProjectMemberId,
    },
  });

  revalidatePath(`/projects/${projectId}/demands`);
  return { ok: true };
}

export async function deleteDemandDocumentAction(input: {
  projectId: string;
  demandId: string;
  documentId: string;
}) {
  const user = await getAuthUser();
  if (!user?.id) throw new Error("Non authentifié.");

  const pm = await requireProjectMember(user.id, input.projectId);

  const demand = await prisma.ftmDemand.findUnique({
    where: { id: input.demandId },
  });
  if (!demand) throw new Error("Demande introuvable.");

  if (pm.role === ProjectRole.ENTREPRISE && demand.initiatorProjectMemberId !== pm.id) {
    throw new Error("Accès refusé.");
  }
  if (pm.role === ProjectRole.ENTREPRISE && demand.status !== "DRAFT") {
    throw new Error("Impossible de supprimer des fichiers une fois la demande soumise.");
  }

  const doc = await prisma.ftmDocument.findFirst({
    where: { id: input.documentId, ftmDemandId: input.demandId },
  });
  if (!doc) throw new Error("Document introuvable.");

  try {
    await deleteStorageFile(doc.url);
  } catch {
  }

  await prisma.ftmDocument.delete({ where: { id: input.documentId } });

  await audit(user.id, "FTM_DEMAND_DOCUMENT_DELETE", "FtmDocument", input.demandId, { documentId: input.documentId, fileName: doc.name });
  revalidatePath(`/projects/${input.projectId}/ftms/new`);
  return { ok: true };
}

