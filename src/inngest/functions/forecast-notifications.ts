import { inngest } from "@/inngest/client";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { ProjectRole } from "@prisma/client";
import * as React from "react";
import { ForecastNotificationEmail } from "@/emails/forecast-notification";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function forecastUrl(projectId: string, orgId: string) {
  return `${APP_URL}/projects/${projectId}/forecasts/${orgId}`;
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
  return React.createElement(ForecastNotificationEmail, {
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
// 1. Forecast Submitted → notify MOE
// ─────────────────────────────────────────────────────────────────────────────
export const onForecastSubmitted = inngest.createFunction(
  { id: "forecast-submitted-notification", retries: 3, triggers: [{ event: "forecast/submitted" }] },
  async ({ event, step }) => {
    const { projectId, organizationId, organizationName, indice } = event.data;

    const recipients = await step.run("resolve-moe-emails", () => getMoeEmails(projectId));
    if (recipients.length === 0) return { sent: 0 };

    const url = forecastUrl(projectId, organizationId);
    const element = makeEmail({
      title: `Prévisionnel soumis — Action requise`,
      intro: `L'entreprise ${organizationName} a soumis son prévisionnel (indice ${indice}). Il est en attente de votre analyse.`,
      details: [
        { label: "Entreprise", value: organizationName },
        { label: "Indice", value: String(indice) },
      ],
      ctaLabel: "Analyser le prévisionnel",
      ctaUrl: url,
    });

    return sendToMany(recipients, `Prévisionnel soumis par ${organizationName} — Action requise`, element);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. MOE Reviewed → notify MOA (APPROVED) or ENTREPRISE (CORRECTION / REFUSED)
// ─────────────────────────────────────────────────────────────────────────────
export const onForecastMoeReviewed = inngest.createFunction(
  { id: "forecast-moe-reviewed-notification", retries: 3, triggers: [{ event: "forecast/moe-reviewed" }] },
  async ({ event, step }) => {
    const { projectId, organizationId, decision, comment } = event.data;
    const url = forecastUrl(projectId, organizationId);

    if (decision === "APPROVED") {
      const recipients = await step.run("resolve-moa-emails", () => getMoaEmails(projectId));
      if (recipients.length === 0) return { sent: 0 };

      const element = makeEmail({
        title: "Prévisionnel approuvé par le MOE — Validation MOA requise",
        intro: "Le MOE a analysé et approuvé le prévisionnel. Il est maintenant en attente de votre validation finale.",
        details: comment ? [{ label: "Commentaire MOE", value: comment }] : undefined,
        ctaLabel: "Valider le prévisionnel",
        ctaUrl: url,
      });

      return sendToMany(recipients, "Prévisionnel en attente de validation MOA", element);
    }

    // CORRECTION_NEEDED or REFUSED → notify ENTREPRISE
    const recipients = await step.run("resolve-org-emails", () =>
      getOrgEmails(projectId, organizationId)
    );
    if (recipients.length === 0) return { sent: 0 };

    const isCorrection = decision === "CORRECTION_NEEDED";
    const element = makeEmail({
      title: isCorrection
        ? "Prévisionnel — Correction demandée"
        : "Prévisionnel refusé par le MOE",
      intro: isCorrection
        ? "Le MOE a analysé votre prévisionnel et demande des corrections. Veuillez prendre connaissance du commentaire et soumettre à nouveau."
        : "Le MOE a analysé votre prévisionnel et l'a refusé.",
      details: comment ? [{ label: "Commentaire MOE", value: comment }] : undefined,
      ctaLabel: "Voir le prévisionnel",
      ctaUrl: url,
    });

    const subject = isCorrection
      ? "Votre prévisionnel — correction requise"
      : "Votre prévisionnel refusé par le MOE";

    return sendToMany(recipients, subject, element);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. MOA Validated → notify ENTREPRISE + MOE (APPROVED / CORRECTION), ENTREPRISE only (REFUSED)
// ─────────────────────────────────────────────────────────────────────────────
export const onForecastMoaValidated = inngest.createFunction(
  { id: "forecast-moa-validated-notification", retries: 3, triggers: [{ event: "forecast/moa-validated" }] },
  async ({ event, step }) => {
    const { projectId, organizationId, decision, comment } = event.data;
    const url = forecastUrl(projectId, organizationId);

    if (decision === "APPROVED") {
      const [orgEmails, moeEmails] = await step.run("resolve-emails", () =>
        Promise.all([getOrgEmails(projectId, organizationId), getMoeEmails(projectId)])
      );
      const recipients = [...new Set([...orgEmails, ...moeEmails])];
      if (recipients.length === 0) return { sent: 0 };

      const element = makeEmail({
        title: "Prévisionnel validé définitivement",
        intro: "Le MOA a validé le prévisionnel. Le plan prévisionnel est désormais officiel.",
        details: comment ? [{ label: "Commentaire MOA", value: comment }] : undefined,
        ctaLabel: "Voir le prévisionnel",
        ctaUrl: url,
      });

      return sendToMany(recipients, "Prévisionnel validé par le MOA", element);
    }

    if (decision === "CORRECTION_NEEDED") {
      const [orgEmails, moeEmails] = await step.run("resolve-emails", () =>
        Promise.all([getOrgEmails(projectId, organizationId), getMoeEmails(projectId)])
      );
      const recipients = [...new Set([...orgEmails, ...moeEmails])];
      if (recipients.length === 0) return { sent: 0 };

      const element = makeEmail({
        title: "Prévisionnel — Correction demandée par le MOA",
        intro: "Le MOA a demandé des corrections sur le prévisionnel. L'entreprise doit apporter les modifications demandées et le re-soumettre.",
        details: comment ? [{ label: "Commentaire MOA", value: comment }] : undefined,
        ctaLabel: "Voir le prévisionnel",
        ctaUrl: url,
      });

      return sendToMany(recipients, "Prévisionnel — correction demandée par le MOA", element);
    }

    // REFUSED → ENTREPRISE only
    const recipients = await step.run("resolve-org-emails", () =>
      getOrgEmails(projectId, organizationId)
    );
    if (recipients.length === 0) return { sent: 0 };

    const element = makeEmail({
      title: "Prévisionnel refusé par le MOA",
      intro: "Le MOA a refusé votre prévisionnel.",
      details: comment ? [{ label: "Commentaire MOA", value: comment }] : undefined,
      ctaLabel: "Voir le prévisionnel",
      ctaUrl: url,
    });

    return sendToMany(recipients, "Votre prévisionnel refusé par le MOA", element);
  }
);
