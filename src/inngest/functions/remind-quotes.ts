import { inngest } from "@/inngest/client";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { FtmPhase } from "@prisma/client";
import * as React from "react";
import { ReminderQuoteEmail } from "@/emails/reminder-quote";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

/**
 * Scheduled function that runs daily at 08:00 UTC.
 * Replaces the old /api/cron/remind-quotes REST endpoint.
 * For each FTM in QUOTING phase, if a company hasn't submitted yet and
 * auto-reminders are configured, it sends a reminder email and updates
 * lastReminderAt to prevent spam.
 */
export const remindQuotes = inngest.createFunction(
  { id: "remind-quotes-daily", retries: 2, triggers: [{ cron: "0 8 * * *" }] },
  async ({ step }) => {
    const now = new Date();

    const ftmsInQuoting = await step.run("fetch-quoting-ftms", () =>
      prisma.ftmRecord.findMany({
        where: { phase: FtmPhase.QUOTING },
        include: {
          concernedOrgs: {
            include: {
              organization: {
                include: {
                  projectMembers: {
                    where: { role: "ENTREPRISE" },
                    include: { user: true },
                  },
                },
              },
            },
          },
          quoteSubmissions: { select: { organizationId: true } },
        },
      })
    );

    let emailsSent = 0;

    for (const ftm of ftmsInQuoting) {
      for (const concerned of ftm.concernedOrgs) {
        // Skip if a quote was already submitted
        const hasSubmitted = ftm.quoteSubmissions.some(
          (s) => s.organizationId === concerned.organizationId
        );
        if (hasSubmitted) continue;

        // Skip if reminders are disabled for this org
        const freq = concerned.reminderFrequencyDays;
        if (!freq || freq <= 0) continue;

        // Check if it's time for a reminder
        const lastRemindedRaw = concerned.lastReminderAt ?? new Date(0);
        const lastReminded = lastRemindedRaw instanceof Date ? lastRemindedRaw : new Date(lastRemindedRaw);
        const nextReminderAt = new Date(
          lastReminded.getTime() + freq * 24 * 60 * 60 * 1000
        );
        if (now < nextReminderAt) continue;

        // Collect recipient emails
        const emails = concerned.organization.projectMembers
          .map((pm) => pm.user.email)
          .filter(Boolean) as string[];

        const deadlineDate = concerned.dateLimiteDevis
          ? new Date(concerned.dateLimiteDevis).toLocaleDateString("fr-FR", {
              day: "2-digit",
              month: "long",
              year: "numeric",
            })
          : null;

        const ftmUrl = `${APP_URL}/projects/${ftm.projectId}/ftms/${ftm.id}`;

        // Send to all members of the org
        await step.run(`send-reminder-${ftm.id}-${concerned.organizationId}`, async () => {
          await Promise.allSettled(
            emails.map((email) =>
              sendEmail({
                to: email,
                subject: `Rappel : Devis en attente — FTM N°${ftm.number}`,
                react: React.createElement(ReminderQuoteEmail, {
                  ftmTitle: ftm.title,
                  ftmNumber: ftm.number,
                  deadlineDate,
                  ftmUrl,
                }),
              })
            )
          );

          await prisma.ftmConcernedOrganization.update({
            where: { id: concerned.id },
            data: { lastReminderAt: now },
          });

          emailsSent += emails.length;
        });
      }
    }

    return { emailsSent };
  }
);
