import { inngest } from "@/inngest/client";
import { prisma } from "@/lib/prisma";

const RETENTION_DAYS = 30;

/**
 * Daily cron at 03:00 UTC. Deletes LoginAttempt rows older than 30 days so the
 * rate-limit table stays bounded. Counters look at sliding windows of minutes
 * to hours, so 30 days of history is more than enough for analytics + audit.
 */
export const purgeLoginAttempts = inngest.createFunction(
  { id: "purge-login-attempts-daily", retries: 1, triggers: [{ cron: "0 3 * * *" }] },
  async ({ step }) => {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const result = await step.run("delete-old-login-attempts", () =>
      prisma.loginAttempt.deleteMany({ where: { createdAt: { lt: cutoff } } })
    );
    return { deleted: result.count, cutoff: cutoff.toISOString() };
  }
);
