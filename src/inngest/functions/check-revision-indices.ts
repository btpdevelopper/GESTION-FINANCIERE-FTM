import { inngest } from "@/inngest/client";
import { prisma } from "@/lib/prisma";
import { fetchInseeIndex } from "@/lib/revision/insee-fetcher";
import { computeRegularizationDelta } from "@/lib/revision/calculations";

/**
 * Daily cron that checks INSEE for definitive index values.
 *
 * For every SituationIndexLog still marked isProvisional:
 *  - If INSEE now returns a value AND it differs from what was used → create PendingRegularization
 *  - If INSEE confirms the same value → simply mark the log as no longer provisional
 *  - If INSEE still returns nothing → skip (check again tomorrow)
 */
export const checkRevisionIndices = inngest.createFunction(
  { id: "check-revision-indices-daily", retries: 2, triggers: [{ cron: "0 6 * * *" }] },
  async ({ step, logger }) => {
    const provisionalLogs = await step.run("fetch-provisional-logs", () =>
      prisma.situationIndexLog.findMany({
        where: { isProvisional: true },
        include: {
          component: {
            include: { config: true },
          },
          situation: {
            select: {
              id: true,
              projectId: true,
              organizationId: true,
              periodBaseNetHtCents: true,
            },
          },
        },
      })
    );

    let regularizationsCreated = 0;
    let logsConfirmed = 0;

    for (const log of provisionalLogs) {
      const { component, situation } = log;
      const { idbank, label, weight, baseValue, config } = component;

      const obs = await step.run(
        `insee-fetch-${log.id}`,
        () => fetchInseeIndex(idbank, log.period)
      );

      if (!obs) {
        logger.info(`INSEE: no definitive data yet for ${idbank} / ${log.period}`);
        continue;
      }

      const definitiveValue = obs.value;
      const provisionalValue = Number(log.indexValue);

      if (Math.abs(definitiveValue - provisionalValue) < 0.0001) {
        // Index confirmed — no catch-up needed, just mark definitive
        await step.run(`confirm-log-${log.id}`, () =>
          prisma.situationIndexLog.update({
            where: { id: log.id },
            data: { isProvisional: false },
          })
        );
        logsConfirmed++;
        continue;
      }

      // Check no regularization already queued for this (situation × component)
      const existing = await step.run(`check-existing-reg-${log.id}`, () =>
        prisma.pendingRegularization.findFirst({
          where: {
            sourceSituationId: log.situationId,
            componentId: log.componentId,
            status: "PENDING",
          },
          select: { id: true },
        })
      );
      if (existing) {
        logger.info(`Regularization already queued for situation ${log.situationId} / component ${log.componentId}`);
        continue;
      }

      const p0Cents = situation.periodBaseNetHtCents ?? BigInt(0);
      const b = Number(config.variablePart);
      const w = Number(weight);
      const base = Number(baseValue);

      const delta = computeRegularizationDelta(
        p0Cents, b, w, base, definitiveValue, provisionalValue
      );

      await step.run(`create-regularization-${log.id}`, () =>
        prisma.$transaction([
          prisma.pendingRegularization.create({
            data: {
              projectId: situation.projectId,
              organizationId: situation.organizationId,
              sourceSituationId: situation.id,
              componentId: log.componentId,
              period: log.period,
              definitiveIndexValue: definitiveValue,
              provisionalIndexValue: provisionalValue,
              deltaAmountHtCents: delta,
              status: "PENDING",
            },
          }),
          prisma.situationIndexLog.update({
            where: { id: log.id },
            data: {
              isProvisional: false,
              indexValue: definitiveValue,
            },
          }),
        ])
      );

      logger.info(
        `Regularization created for ${label} / ${log.period}: ` +
        `provisional=${provisionalValue} definitive=${definitiveValue} delta=${delta}€`
      );
      regularizationsCreated++;
    }

    return {
      provisionalLogsChecked: provisionalLogs.length,
      logsConfirmed,
      regularizationsCreated,
    };
  }
);
