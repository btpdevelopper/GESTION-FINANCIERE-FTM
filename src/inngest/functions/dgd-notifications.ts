import { inngest } from "@/inngest/client";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { ProjectRole } from "@prisma/client";
import * as React from "react";
import { DgdNotificationEmail } from "@/emails/dgd-notification";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function dgdUrl(projectId: string, orgId: string) {
  return `${APP_URL}/projects/${projectId}/dgd/${orgId}`;
}

function formatAmount(cents: string): string {
  return (Number(BigInt(cents)) / 100).toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
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
  return React.createElement(DgdNotificationEmail, {
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
// 1. DGD Submitted → notify all MOE members
// ─────────────────────────────────────────────────────────────────────────────
export const onDgdSubmitted = inngest.createFunction(
  { id: "dgd-submitted-notification", retries: 3, triggers: [{ event: "dgd/submitted" }] },
  async ({ event, step }) => {
    const { projectId, organizationId, organizationName, soldeDgdHtCents } = event.data;

    const recipients = await step.run("resolve-moe-emails", () => getMoeEmails(projectId));
    if (recipients.length === 0) return { sent: 0 };

    const element = makeEmail({
      title: "DGD soumis — Action requise",
      intro: `L'entreprise ${organizationName} a soumis son Décompte Général Définitif. Il est en attente de votre analyse.`,
      details: [
        { label: "Entreprise", value: organizationName },
        { label: "Solde DGD", value: formatAmount(soldeDgdHtCents) },
      ],
      ctaLabel: "Analyser le DGD",
      ctaUrl: dgdUrl(projectId, organizationId),
    });

    return sendToMany(recipients, `DGD soumis par ${organizationName} — Action requise`, element);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 2. MOE Reviewed → notify MOA (ACCEPT/MODIFY) or ENTREPRISE (REJECT)
// ─────────────────────────────────────────────────────────────────────────────
export const onDgdMoeReviewed = inngest.createFunction(
  { id: "dgd-moe-reviewed-notification", retries: 3, triggers: [{ event: "dgd/moe-reviewed" }] },
  async ({ event, step }) => {
    const { projectId, organizationId, decision, comment } = event.data;
    const url = dgdUrl(projectId, organizationId);

    if (decision === "REJECT") {
      const recipients = await step.run("resolve-org-emails", () =>
        getOrgEmails(projectId, organizationId)
      );
      if (recipients.length === 0) return { sent: 0 };

      const element = makeEmail({
        title: "Votre DGD a été renvoyé par le MOE",
        intro: "Le MOE a analysé votre Décompte Général Définitif et l'a renvoyé pour correction. Veuillez prendre connaissance du commentaire et soumettre à nouveau.",
        details: [{ label: "Commentaire MOE", value: comment }],
        ctaLabel: "Voir le DGD",
        ctaUrl: url,
      });

      return sendToMany(recipients, "Votre DGD a été renvoyé — correction requise", element);
    }

    const recipients = await step.run("resolve-moa-emails", () => getMoaEmails(projectId));
    if (recipients.length === 0) return { sent: 0 };

    const label = decision === "MODIFY" ? "analysé et ajusté" : "accepté";
    const element = makeEmail({
      title: "DGD analysé par le MOE — Validation MOA requise",
      intro: `Le MOE a ${label} le Décompte Général Définitif. Il est maintenant en attente de votre validation finale.`,
      details: comment ? [{ label: "Commentaire MOE", value: comment }] : undefined,
      ctaLabel: "Valider le DGD",
      ctaUrl: url,
    });

    return sendToMany(recipients, "DGD en attente de validation MOA", element);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 3. DGD Approved → notify ENTREPRISE (dispute window open)
// ─────────────────────────────────────────────────────────────────────────────
export const onDgdApproved = inngest.createFunction(
  { id: "dgd-approved-notification", retries: 3, triggers: [{ event: "dgd/approved" }] },
  async ({ event, step }) => {
    const { projectId, organizationId, disputeDeadline } = event.data;

    const recipients = await step.run("resolve-org-emails", () =>
      getOrgEmails(projectId, organizationId)
    );
    if (recipients.length === 0) return { sent: 0 };

    const deadline = new Date(disputeDeadline).toLocaleDateString("fr-FR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

    const element = makeEmail({
      title: "Votre DGD a été approuvé",
      intro: "Le MOA a approuvé votre Décompte Général Définitif. Ce décompte est désormais officiel. Vous disposez d'un délai de 30 jours pour le contester si vous le souhaitez.",
      details: [{ label: "Date limite de contestation", value: deadline }],
      ctaLabel: "Voir le DGD",
      ctaUrl: dgdUrl(projectId, organizationId),
    });

    return sendToMany(recipients, "Votre DGD a été approuvé", element);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 4. MOA Rejected → notify MOE for re-analysis
// ─────────────────────────────────────────────────────────────────────────────
export const onDgdMoaRejected = inngest.createFunction(
  { id: "dgd-moa-rejected-notification", retries: 3, triggers: [{ event: "dgd/moa-rejected" }] },
  async ({ event, step }) => {
    const { projectId, organizationId, comment } = event.data;

    const recipients = await step.run("resolve-moe-emails", () => getMoeEmails(projectId));
    if (recipients.length === 0) return { sent: 0 };

    const element = makeEmail({
      title: "DGD renvoyé par le MOA — Re-analyse requise",
      intro: "Le MOA a rejeté le Décompte Général Définitif et le renvoie pour une nouvelle analyse. Veuillez l'examiner à nouveau.",
      details: comment ? [{ label: "Commentaire MOA", value: comment }] : undefined,
      ctaLabel: "Re-analyser le DGD",
      ctaUrl: dgdUrl(projectId, organizationId),
    });

    return sendToMany(recipients, "DGD renvoyé par le MOA — re-analyse requise", element);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 5. DGD Disputed → notify MOE + MOA
// ─────────────────────────────────────────────────────────────────────────────
export const onDgdDisputed = inngest.createFunction(
  { id: "dgd-disputed-notification", retries: 3, triggers: [{ event: "dgd/disputed" }] },
  async ({ event, step }) => {
    const { projectId, organizationId, justification } = event.data;

    const [moeEmails, moaEmails] = await step.run("resolve-emails", () =>
      Promise.all([getMoeEmails(projectId), getMoaEmails(projectId)])
    );
    const recipients = [...new Set([...moeEmails, ...moaEmails])];
    if (recipients.length === 0) return { sent: 0 };

    const element = makeEmail({
      title: "DGD contesté — Mémoire en réclamation reçu",
      intro: "L'entreprise a contesté le Décompte Général Définitif dans le délai réglementaire de 30 jours. Un mémoire en réclamation a été soumis.",
      details: [{ label: "Justification", value: justification.slice(0, 300) }],
      ctaLabel: "Voir le DGD",
      ctaUrl: dgdUrl(projectId, organizationId),
    });

    return sendToMany(recipients, "DGD contesté par l'entreprise", element);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 6. Resolved Amicably → notify all parties
// ─────────────────────────────────────────────────────────────────────────────
export const onDgdResolvedAmicably = inngest.createFunction(
  { id: "dgd-resolved-amicably-notification", retries: 3, triggers: [{ event: "dgd/resolved-amicably" }] },
  async ({ event, step }) => {
    const { projectId, organizationId, adjustedSoldeHtCents } = event.data;

    const [moeEmails, moaEmails, orgEmails] = await step.run("resolve-emails", () =>
      Promise.all([
        getMoeEmails(projectId),
        getMoaEmails(projectId),
        getOrgEmails(projectId, organizationId),
      ])
    );
    const recipients = [...new Set([...moeEmails, ...moaEmails, ...orgEmails])];
    if (recipients.length === 0) return { sent: 0 };

    const element = makeEmail({
      title: "DGD résolu à l'amiable",
      intro: "La réclamation a été résolue à l'amiable. Un protocole d'accord transactionnel a été établi et le solde définitif a été ajusté.",
      details: [{ label: "Solde définitif ajusté", value: formatAmount(adjustedSoldeHtCents) }],
      ctaLabel: "Voir le DGD",
      ctaUrl: dgdUrl(projectId, organizationId),
    });

    return sendToMany(recipients, "DGD résolu à l'amiable", element);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 7. In Litigation → notify ENTREPRISE + MOE
// ─────────────────────────────────────────────────────────────────────────────
export const onDgdInLitigation = inngest.createFunction(
  { id: "dgd-in-litigation-notification", retries: 3, triggers: [{ event: "dgd/in-litigation" }] },
  async ({ event, step }) => {
    const { projectId, organizationId, comment } = event.data;

    const [moeEmails, orgEmails] = await step.run("resolve-emails", () =>
      Promise.all([getMoeEmails(projectId), getOrgEmails(projectId, organizationId)])
    );
    const recipients = [...new Set([...moeEmails, ...orgEmails])];
    if (recipients.length === 0) return { sent: 0 };

    const element = makeEmail({
      title: "DGD — Passage en contentieux",
      intro: "La négociation amiable n'ayant pas abouti, le MOA a déclaré le litige en contentieux judiciaire.",
      details: [{ label: "Motif", value: comment }],
      ctaLabel: "Voir le DGD",
      ctaUrl: dgdUrl(projectId, organizationId),
    });

    return sendToMany(recipients, "DGD passé en contentieux judiciaire", element);
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// 8. Resolved by Court → notify all parties
// ─────────────────────────────────────────────────────────────────────────────
export const onDgdResolvedByCourt = inngest.createFunction(
  { id: "dgd-resolved-by-court-notification", retries: 3, triggers: [{ event: "dgd/resolved-by-court" }] },
  async ({ event, step }) => {
    const { projectId, organizationId, courtSoldeHtCents } = event.data;

    const [moeEmails, moaEmails, orgEmails] = await step.run("resolve-emails", () =>
      Promise.all([
        getMoeEmails(projectId),
        getMoaEmails(projectId),
        getOrgEmails(projectId, organizationId),
      ])
    );
    const recipients = [...new Set([...moeEmails, ...moaEmails, ...orgEmails])];
    if (recipients.length === 0) return { sent: 0 };

    const element = makeEmail({
      title: "DGD — Décision de justice enregistrée",
      intro: "Le contentieux a été clôturé par une décision judiciaire. Le solde définitif du Décompte Général Définitif est maintenant établi conformément au jugement.",
      details: [{ label: "Solde fixé par le tribunal", value: formatAmount(courtSoldeHtCents) }],
      ctaLabel: "Voir le DGD",
      ctaUrl: dgdUrl(projectId, organizationId),
    });

    return sendToMany(recipients, "DGD — Décision de justice rendue", element);
  }
);
