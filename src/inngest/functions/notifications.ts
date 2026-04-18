import { inngest } from "@/inngest/client";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { ProjectRole, FtmPhase } from "@prisma/client";
import * as React from "react";

// ── Email templates ───────────────────────────────────────────────────────────
import { InvitationEmail } from "@/emails/invitation";
import { EtudesSubmittedEmail } from "@/emails/etudes-submitted";
import { EtudesDecisionEmail } from "@/emails/etudes-decision";
import { QuotingOpenedEmail } from "@/emails/quoting-opened";
import { QuoteReceivedEmail } from "@/emails/quote-received";
import { QuoteReviewEmail } from "@/emails/quote-review";
import { FtmAcceptedEmail } from "@/emails/ftm-accepted";
import { FtmCancelledEmail } from "@/emails/ftm-cancelled";
import { DemandSubmittedEmail } from "@/emails/demand-submitted";
import { DemandRejectedEmail } from "@/emails/demand-rejected";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function ftmUrl(projectId: string, ftmId: string) {
  return `${APP_URL}/projects/${projectId}/ftms/${ftmId}`;
}

function formatAmount(cents: string): string {
  return (Number(BigInt(cents)) / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

// ── Helper: resolve member emails by project + role ───────────────────────────
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

async function getConcernedCompanyEmails(projectId: string, ftmId: string): Promise<string[]> {
  const orgs = await prisma.ftmConcernedOrganization.findMany({
    where: { ftmId },
    include: {
      organization: {
        include: {
          projectMembers: {
            where: { projectId, role: ProjectRole.ENTREPRISE },
            include: { user: true },
          },
        },
      },
    },
  });
  return orgs
    .flatMap((o) => o.organization.projectMembers)
    .map((pm) => pm.user.email)
    .filter(Boolean) as string[];
}

async function getOrgEmails(projectId: string, organizationId: string): Promise<string[]> {
  const members = await prisma.projectMember.findMany({
    where: { projectId, organizationId, role: ProjectRole.ENTREPRISE },
    include: { user: true },
  });
  return members.map((m) => m.user.email).filter(Boolean) as string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Guest Invitation (études magic link)
// ─────────────────────────────────────────────────────────────────────────────
export const sendInvitationNotification = inngest.createFunction(
  { id: "send-invitation-notification", retries: 3, triggers: [{ event: "ftm/invitation.created" }] },
  async ({ event }) => {
    const { toEmail, token, projectId, ftmId, ftmTitle, ftmNumber } = event.data;
    const magicLink = `${APP_URL}/invite/${token}?projectId=${projectId}&ftmId=${ftmId}`;

    return sendEmail({
      to: toEmail,
      subject: `Invitation aux études — FTM N°${ftmNumber}`,
      react: React.createElement(InvitationEmail, { ftmTitle, ftmNumber, magicLink }),
    });
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. MOE submitted études → notify MOA validator
// ─────────────────────────────────────────────────────────────────────────────
export const sendEtudesSubmittedNotification = inngest.createFunction(
  { id: "send-etudes-submitted-notification", retries: 3, triggers: [{ event: "ftm/etudes.submitted" }] },
  async ({ event, step }) => {
    const { projectId, ftmId, ftmTitle, ftmNumber } = event.data;

    const recipients = await step.run("resolve-moa-emails", () =>
      getMoaEmails(projectId)
    );

    if (recipients.length === 0) return { sent: 0 };

    const results = await Promise.allSettled(
      recipients.map((email) =>
        sendEmail({
          to: email,
          subject: `Action requise — Études FTM N°${ftmNumber} à valider`,
          react: React.createElement(EtudesSubmittedEmail, {
            ftmTitle,
            ftmNumber,
            ftmUrl: ftmUrl(projectId, ftmId),
          }),
        })
      )
    );

    return { sent: results.filter((r) => r.status === "fulfilled").length };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. MOA decided on études → notify MOE
// ─────────────────────────────────────────────────────────────────────────────
export const sendEtudesDecidedNotification = inngest.createFunction(
  { id: "send-etudes-decided-notification", retries: 3, triggers: [{ event: "ftm/etudes.decided" }] },
  async ({ event, step }) => {
    const { projectId, ftmId, ftmTitle, ftmNumber, decision, comment } = event.data;

    const recipients = await step.run("resolve-moe-emails", () =>
      getMoeEmails(projectId)
    );

    if (recipients.length === 0) return { sent: 0 };

    const label = decision === "APPROVED" ? "approuvées" : "refusées";
    const results = await Promise.allSettled(
      recipients.map((email) =>
        sendEmail({
          to: email,
          subject: `Études ${label} par le MOA — FTM N°${ftmNumber}`,
          react: React.createElement(EtudesDecisionEmail, {
            ftmTitle,
            ftmNumber,
            decision,
            comment,
            ftmUrl: ftmUrl(projectId, ftmId),
          }),
        })
      )
    );

    return { sent: results.filter((r) => r.status === "fulfilled").length };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. Quoting phase opened → notify all concerned companies
// ─────────────────────────────────────────────────────────────────────────────
export const sendQuotingOpenedNotification = inngest.createFunction(
  { id: "send-quoting-opened-notification", retries: 3, triggers: [{ event: "ftm/quoting.opened" }] },
  async ({ event, step }) => {
    const { projectId, ftmId, ftmTitle, ftmNumber } = event.data;

    const recipients = await step.run("resolve-company-emails", () =>
      getConcernedCompanyEmails(projectId, ftmId)
    );

    if (recipients.length === 0) return { sent: 0 };

    // Fetch per-company deadlines for the email
    const concernedOrgs = await step.run("resolve-deadlines", () =>
      prisma.ftmConcernedOrganization.findMany({ where: { ftmId } })
    );

    // For simplicity we pick the earliest deadline; each company sees their own
    // deadline in the UI — here we send a generic notification
    const results = await Promise.allSettled(
      recipients.map((email) =>
        sendEmail({
          to: email,
          subject: `Phase de chiffrage ouverte — FTM N°${ftmNumber}`,
          react: React.createElement(QuotingOpenedEmail, {
            ftmTitle,
            ftmNumber,
            deadlineDate: null, // Company-specific deadlines are visible in the app
            ftmUrl: ftmUrl(projectId, ftmId),
          }),
        })
      )
    );

    return { sent: results.filter((r) => r.status === "fulfilled").length };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. Company submitted a quote → notify all MOE members
// ─────────────────────────────────────────────────────────────────────────────
export const sendQuoteSubmittedNotification = inngest.createFunction(
  { id: "send-quote-submitted-notification", retries: 3, triggers: [{ event: "ftm/quote.submitted" }] },
  async ({ event, step }) => {
    const { projectId, ftmId, ftmTitle, ftmNumber, companyName, amountHtCents, submittedAt } = event.data;

    const recipients = await step.run("resolve-moe-emails", () =>
      getMoeEmails(projectId)
    );

    if (recipients.length === 0) return { sent: 0 };

    const results = await Promise.allSettled(
      recipients.map((email) =>
        sendEmail({
          to: email,
          subject: `Nouveau devis de ${companyName} — FTM N°${ftmNumber}`,
          react: React.createElement(QuoteReceivedEmail, {
            ftmTitle,
            ftmNumber,
            companyName,
            amountHt: formatAmount(amountHtCents),
            submittedAt: formatDate(submittedAt),
            ftmUrl: ftmUrl(projectId, ftmId),
          }),
        })
      )
    );

    return { sent: results.filter((r) => r.status === "fulfilled").length };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 6. MOE reviewed a quote → notify the submitting company
// ─────────────────────────────────────────────────────────────────────────────
export const sendQuoteReviewedNotification = inngest.createFunction(
  { id: "send-quote-reviewed-notification", retries: 3, triggers: [{ event: "ftm/quote.reviewed" }] },
  async ({ event, step }) => {
    const { projectId, ftmId, ftmTitle, ftmNumber, organizationId, decision, comment } = event.data;

    const recipients = await step.run("resolve-company-emails", () =>
      getOrgEmails(projectId, organizationId)
    );

    if (recipients.length === 0) return { sent: 0 };

    const decisionLabel = { ACCEPT: "accepté", RESEND_CORRECTION: "renvoyé pour correction", DECLINE: "refusé" }[decision];
    const results = await Promise.allSettled(
      recipients.map((email) =>
        sendEmail({
          to: email,
          subject: `Votre devis a été ${decisionLabel} — FTM N°${ftmNumber}`,
          react: React.createElement(QuoteReviewEmail, {
            ftmTitle,
            ftmNumber,
            decision,
            comment,
            ftmUrl: ftmUrl(projectId, ftmId),
            isMoaFinal: false,
          }),
        })
      )
    );

    return { sent: results.filter((r) => r.status === "fulfilled").length };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 7. MOA final decision → notify MOE + submitting company
// ─────────────────────────────────────────────────────────────────────────────
export const sendMoaFinalNotification = inngest.createFunction(
  { id: "send-moa-final-notification", retries: 3, triggers: [{ event: "ftm/quote.moa-final" }] },
  async ({ event, step }) => {
    const { projectId, ftmId, ftmTitle, ftmNumber, organizationId, decision, comment } = event.data;

    const [moeEmails, companyEmails] = await step.run("resolve-recipients", () =>
      Promise.all([getMoeEmails(projectId), getOrgEmails(projectId, organizationId)])
    );

    const recipients = [...new Set([...moeEmails, ...companyEmails])];
    if (recipients.length === 0) return { sent: 0 };

    const results = await Promise.allSettled(
      recipients.map((email) =>
        sendEmail({
          to: email,
          subject: `Décision finale MOA — FTM N°${ftmNumber}`,
          react: React.createElement(QuoteReviewEmail, {
            ftmTitle,
            ftmNumber,
            decision,
            comment,
            ftmUrl: ftmUrl(projectId, ftmId),
            isMoaFinal: true,
          }),
        })
      )
    );

    return { sent: results.filter((r) => r.status === "fulfilled").length };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 8. FTM cancelled → notify all concerned companies
// ─────────────────────────────────────────────────────────────────────────────
export const sendFtmCancelledNotification = inngest.createFunction(
  { id: "send-ftm-cancelled-notification", retries: 3, triggers: [{ event: "ftm/cancelled" }] },
  async ({ event, step }) => {
    const { projectId, ftmId, ftmTitle, ftmNumber, reason } = event.data;

    const recipients = await step.run("resolve-company-emails", () =>
      getConcernedCompanyEmails(projectId, ftmId)
    );

    if (recipients.length === 0) return { sent: 0 };

    const results = await Promise.allSettled(
      recipients.map((email) =>
        sendEmail({
          to: email,
          subject: `FTM N°${ftmNumber} annulé`,
          react: React.createElement(FtmCancelledEmail, {
            ftmTitle,
            ftmNumber,
            reason,
            ftmUrl: ftmUrl(projectId, ftmId),
          }),
        })
      )
    );

    return { sent: results.filter((r) => r.status === "fulfilled").length };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 9. FTM fully accepted → notify MOE + MOA + all concerned companies
// ─────────────────────────────────────────────────────────────────────────────
export const sendFtmAcceptedNotification = inngest.createFunction(
  { id: "send-ftm-accepted-notification", retries: 3, triggers: [{ event: "ftm/accepted" }] },
  async ({ event, step }) => {
    const { projectId, ftmId, ftmTitle, ftmNumber } = event.data;

    const [moeEmails, moaEmails, companyEmails] = await step.run(
      "resolve-all-recipients",
      () =>
        Promise.all([
          getMoeEmails(projectId),
          getMoaEmails(projectId),
          getConcernedCompanyEmails(projectId, ftmId),
        ])
    );

    const recipients = [...new Set([...moeEmails, ...moaEmails, ...companyEmails])];
    if (recipients.length === 0) return { sent: 0 };

    const results = await Promise.allSettled(
      recipients.map((email) =>
        sendEmail({
          to: email,
          subject: `FTM N°${ftmNumber} accepté et clôturé`,
          react: React.createElement(FtmAcceptedEmail, {
            ftmTitle,
            ftmNumber,
            ftmUrl: ftmUrl(projectId, ftmId),
          }),
        })
      )
    );

    return { sent: results.filter((r) => r.status === "fulfilled").length };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 10. Company demand submitted → notify all MOE members
// ─────────────────────────────────────────────────────────────────────────────
export const sendDemandSubmittedNotification = inngest.createFunction(
  { id: "send-demand-submitted-notification", retries: 3, triggers: [{ event: "ftm/demand.submitted" }] },
  async ({ event, step }) => {
    const { projectId, demandTitle, companyName, requestedDate } = event.data;

    const recipients = await step.run("resolve-moe-emails", () =>
      getMoeEmails(projectId)
    );

    if (recipients.length === 0) return { sent: 0 };

    const demandUrl = `${APP_URL}/projects/${projectId}/demands`;
    const results = await Promise.allSettled(
      recipients.map((email) =>
        sendEmail({
          to: email,
          subject: `Nouvelle demande FTM de ${companyName}`,
          react: React.createElement(DemandSubmittedEmail, {
            demandTitle,
            companyName,
            requestedDate: requestedDate ? formatDate(requestedDate) : null,
            demandUrl,
          }),
        })
      )
    );

    return { sent: results.filter((r) => r.status === "fulfilled").length };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 11. MOE rejected a demand → notify the demanding company
// ─────────────────────────────────────────────────────────────────────────────
export const sendDemandRejectedNotification = inngest.createFunction(
  { id: "send-demand-rejected-notification", retries: 3, triggers: [{ event: "ftm/demand.rejected" }] },
  async ({ event, step }) => {
    const { projectId, demandTitle, initiatorProjectMemberId } = event.data;

    const recipients = await step.run("resolve-company-emails", async () => {
      const initiator = await prisma.projectMember.findUnique({
        where: { id: initiatorProjectMemberId },
        select: { organizationId: true },
      });
      if (!initiator?.organizationId) return [];
      return getOrgEmails(projectId, initiator.organizationId);
    });

    if (recipients.length === 0) return { sent: 0 };

    const projectUrl = `${APP_URL}/projects/${projectId}/demands`;
    const results = await Promise.allSettled(
      recipients.map((email) =>
        sendEmail({
          to: email,
          subject: `Votre demande FTM a été refusée`,
          react: React.createElement(DemandRejectedEmail, {
            demandTitle,
            projectUrl,
          }),
        })
      )
    );

    return { sent: results.filter((r) => r.status === "fulfilled").length };
  }
);
