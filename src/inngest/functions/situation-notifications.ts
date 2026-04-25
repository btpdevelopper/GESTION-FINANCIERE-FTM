import { inngest } from "@/inngest/client";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { ProjectRole } from "@prisma/client";
import * as React from "react";
import { SituationNotificationEmail } from "@/emails/situation-notification";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function situationUrl(projectId: string, orgId: string, situationId: string) {
  return `${APP_URL}/projects/${projectId}/situations/${orgId}/${situationId}`;
}

// ── Email helpers ─────────────────────────────────────────────────────────────

async function getMoeEmails(projectId: string): Promise<string[]> {
  const members = await prisma.projectMember.findMany({
    where: { projectId, role: ProjectRole.MOE },
    include: { user: true },
  });
  return members.map((m) => m.user.email).filter(Boolean) as string[];
}

async function getMoaEmails(projectId: string): Promise<string[]> {
  const members = await prisma.projectMember.findMany({
    where: { projectId, role: ProjectRole.MOA },
    include: { user: true },
  });
  return members.map((m) => m.user.email).filter(Boolean) as string[];
}

async function getOrgEmails(projectId: string, organizationId: string): Promise<string[]> {
  const members = await prisma.projectMember.findMany({
    where: { projectId, organizationId, role: ProjectRole.ENTREPRISE },
    include: { user: true },
  });
  return members.map((m) => m.user.email).filter(Boolean) as string[];
}

function makeEmail(props: {
  title: string;
  intro: string;
  details?: { label: string; value: string }[];
  ctaLabel: string;
  ctaUrl: string;
}) {
  return React.createElement(SituationNotificationEmail, {
    title: props.title,
    preview: props.title,
    intro: props.intro,
    details: props.details,
    ctaLabel: props.ctaLabel,
    ctaUrl: props.ctaUrl,
  });
}

async function sendToMany(emails: string[], subject: string, element: React.ReactElement) {
  const results = await Promise.allSettled(
    emails.map((email) => sendEmail({ to: email, subject, react: element }))
  );
  return { sent: results.filter((r) => r.status === "fulfilled").length };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Situation Submitted → notify MOE
// ─────────────────────────────────────────────────────────────────────────────
export const onSituationSubmitted = inngest.createFunction(
  { id: "situation-submitted-notification", retries: 3, triggers: [{ event: "situation/submitted" }] },
  async ({ event, step }) => {
    const { projectId, situationId, organizationId, organizationName, periodLabel, numero } = event.data;

    const recipients = await step.run("resolve-moe-emails", () => getMoeEmails(projectId));
    if (recipients.length === 0) return { sent: 0 };

    const url = situationUrl(projectId, organizationId, situationId);
    const element = makeEmail({
      title: `Situation N°${numero} soumise — Action requise`,
      intro: `L'entreprise ${organizationName} a soumis sa situation de travaux N°${numero} pour la période ${periodLabel}. Elle est en attente de votre analyse.`,
      details: [
        { label: "Entreprise", value: organizationName },
        { label: "Période", value: periodLabel },
        { label: "N° Situation", value: String(numero) },
      ],
      ctaLabel: "Analyser la situation",
      ctaUrl: url,
    });

    return sendToMany(recipients, `Situation N°${numero} soumise par ${organizationName} — Action requise`, element);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. MOE Reviewed → notify MOA (APPROVED) or ENTREPRISE (CORRECTION / REFUSED)
// ─────────────────────────────────────────────────────────────────────────────
export const onSituationMoeReviewed = inngest.createFunction(
  { id: "situation-moe-reviewed-notification", retries: 3, triggers: [{ event: "situation/moe-reviewed" }] },
  async ({ event, step }) => {
    const { projectId, situationId, organizationId, numero, decision, comment } = event.data;
    const url = situationUrl(projectId, organizationId, situationId);

    if (decision === "APPROVED") {
      const recipients = await step.run("resolve-moa-emails", () => getMoaEmails(projectId));
      if (recipients.length === 0) return { sent: 0 };

      const element = makeEmail({
        title: `Situation N°${numero} approuvée par le MOE — Validation MOA requise`,
        intro: `Le MOE a analysé et approuvé la situation de travaux N°${numero}. Elle est maintenant en attente de votre validation finale.`,
        details: comment ? [{ label: "Commentaire MOE", value: comment }] : undefined,
        ctaLabel: "Valider la situation",
        ctaUrl: url,
      });

      return sendToMany(recipients, `Situation N°${numero} en attente de validation MOA`, element);
    }

    // CORRECTION_NEEDED or REFUSED → notify ENTREPRISE
    const recipients = await step.run("resolve-org-emails", () =>
      getOrgEmails(projectId, organizationId)
    );
    if (recipients.length === 0) return { sent: 0 };

    const isCorrection = decision === "CORRECTION_NEEDED";
    const element = makeEmail({
      title: isCorrection
        ? `Situation N°${numero} — Correction demandée`
        : `Situation N°${numero} refusée par le MOE`,
      intro: isCorrection
        ? `Le MOE a analysé votre situation de travaux N°${numero} et demande des corrections. Veuillez prendre connaissance du commentaire et soumettre à nouveau.`
        : `Le MOE a analysé votre situation de travaux N°${numero} et l'a refusée.`,
      details: comment ? [{ label: "Commentaire MOE", value: comment }] : undefined,
      ctaLabel: "Voir la situation",
      ctaUrl: url,
    });

    const subject = isCorrection
      ? `Situation N°${numero} — correction requise`
      : `Situation N°${numero} refusée par le MOE`;

    return sendToMany(recipients, subject, element);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. MOA Validated → notify ENTREPRISE + MOE (APPROVED / CORRECTION), ENTREPRISE only (REFUSED)
// ─────────────────────────────────────────────────────────────────────────────
export const onSituationMoaValidated = inngest.createFunction(
  { id: "situation-moa-validated-notification", retries: 3, triggers: [{ event: "situation/moa-validated" }] },
  async ({ event, step }) => {
    const { projectId, situationId, organizationId, numero, decision, comment } = event.data;
    const url = situationUrl(projectId, organizationId, situationId);

    if (decision === "APPROVED") {
      const [orgEmails, moeEmails] = await step.run("resolve-emails", () =>
        Promise.all([getOrgEmails(projectId, organizationId), getMoeEmails(projectId)])
      );
      const recipients = [...new Set([...orgEmails, ...moeEmails])];
      if (recipients.length === 0) return { sent: 0 };

      const element = makeEmail({
        title: `Situation N°${numero} validée définitivement`,
        intro: `Le MOA a validé la situation de travaux N°${numero}. Le décompte financier est définitivement établi.`,
        details: comment ? [{ label: "Commentaire MOA", value: comment }] : undefined,
        ctaLabel: "Voir la situation",
        ctaUrl: url,
      });

      return sendToMany(recipients, `Situation N°${numero} validée par le MOA`, element);
    }

    if (decision === "CORRECTION_NEEDED") {
      const [orgEmails, moeEmails] = await step.run("resolve-emails", () =>
        Promise.all([getOrgEmails(projectId, organizationId), getMoeEmails(projectId)])
      );
      const recipients = [...new Set([...orgEmails, ...moeEmails])];
      if (recipients.length === 0) return { sent: 0 };

      const element = makeEmail({
        title: `Situation N°${numero} — Correction demandée par le MOA`,
        intro: `Le MOA a demandé des corrections sur la situation de travaux N°${numero}. L'entreprise doit apporter les modifications demandées et la re-soumettre.`,
        details: comment ? [{ label: "Commentaire MOA", value: comment }] : undefined,
        ctaLabel: "Voir la situation",
        ctaUrl: url,
      });

      return sendToMany(recipients, `Situation N°${numero} — correction demandée par le MOA`, element);
    }

    // REFUSED → ENTREPRISE only
    const recipients = await step.run("resolve-org-emails", () =>
      getOrgEmails(projectId, organizationId)
    );
    if (recipients.length === 0) return { sent: 0 };

    const element = makeEmail({
      title: `Situation N°${numero} refusée par le MOA`,
      intro: `Le MOA a refusé la situation de travaux N°${numero}.`,
      details: comment ? [{ label: "Commentaire MOA", value: comment }] : undefined,
      ctaLabel: "Voir la situation",
      ctaUrl: url,
    });

    return sendToMany(recipients, `Situation N°${numero} refusée par le MOA`, element);
  }
);
