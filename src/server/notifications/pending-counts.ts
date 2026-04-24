import { prisma } from "@/lib/prisma";
import { DgdStatus, ForecastStatus, FtmPhase, MoaEtudesDecision, PenaltyStatus, ProjectRole, SituationStatus } from "@prisma/client";

export interface PendingCounts {
  ftm: number;
  situations: number;
  forecasts: number;
  penalties: number;
  dgd: number;
  total: number;
}

export async function getProjectPendingCounts(
  projectId: string,
  pm: { role: ProjectRole; organizationId: string },
): Promise<PendingCounts> {
  if (pm.role === ProjectRole.MOA) {
    const [ftmCount, demandCount, situationCount, forecastCount, penaltyCount, dgdCount] = await Promise.all([
      prisma.ftmRecord.count({
        where: {
          projectId,
          OR: [
            { phase: FtmPhase.ETUDES, moaEtudesDecision: MoaEtudesDecision.PENDING },
            { phase: FtmPhase.MOA_FINAL },
          ],
        },
      }),
      prisma.ftmDemand.count({ where: { projectId, status: "PENDING_MOE" } }),
      prisma.situationTravaux.count({ where: { projectId, status: SituationStatus.MOE_APPROVED } }),
      prisma.forecast.count({ where: { projectId, status: ForecastStatus.MOE_APPROVED } }),
      // MOA sees: penalties awaiting approval + contested penalties
      prisma.penalty.count({
        where: {
          projectId,
          status: { in: [PenaltyStatus.SUBMITTED, PenaltyStatus.CONTESTED] },
        },
      }),
      // MOA sees: DGDs awaiting validation
      prisma.dgdRecord.count({ where: { projectId, status: DgdStatus.PENDING_MOA } }),
    ]);
    return {
      ftm: ftmCount + demandCount,
      situations: situationCount,
      forecasts: forecastCount,
      penalties: penaltyCount,
      dgd: dgdCount,
      total: ftmCount + demandCount + situationCount + forecastCount + penaltyCount + dgdCount,
    };
  }

  if (pm.role === ProjectRole.MOE) {
    const [ftmCount, demandCount, situationCount, forecastCount, penaltyCount, dgdCount] = await Promise.all([
      prisma.ftmRecord.count({ where: { projectId, phase: FtmPhase.ANALYSIS } }),
      prisma.ftmDemand.count({ where: { projectId, status: "PENDING_MOE" } }),
      prisma.situationTravaux.count({ where: { projectId, status: SituationStatus.SUBMITTED } }),
      prisma.forecast.count({ where: { projectId, status: ForecastStatus.SUBMITTED } }),
      // MOE sees: contested penalties (needs action)
      prisma.penalty.count({
        where: { projectId, status: PenaltyStatus.CONTESTED },
      }),
      // MOE sees: DGDs awaiting analysis
      prisma.dgdRecord.count({ where: { projectId, status: DgdStatus.PENDING_MOE } }),
    ]);
    return {
      ftm: ftmCount + demandCount,
      situations: situationCount,
      forecasts: forecastCount,
      penalties: penaltyCount,
      dgd: dgdCount,
      total: ftmCount + demandCount + situationCount + forecastCount + penaltyCount + dgdCount,
    };
  }

  if (pm.role === ProjectRole.ENTREPRISE) {
    const [ftmCount, situationCount, forecastCount, penaltyCount, dgdCount] = await Promise.all([
      prisma.ftmRecord.count({
        where: {
          projectId,
          phase: FtmPhase.QUOTING,
          concernedOrgs: { some: { organizationId: pm.organizationId } },
        },
      }),
      prisma.situationTravaux.count({
        where: { projectId, organizationId: pm.organizationId, status: SituationStatus.MOE_CORRECTION },
      }),
      prisma.forecast.count({
        where: { projectId, organizationId: pm.organizationId, status: ForecastStatus.MOE_CORRECTION },
      }),
      // ENTREPRISE sees: newly approved penalties (not yet seen/contested)
      prisma.penalty.count({
        where: {
          projectId,
          organizationId: pm.organizationId,
          status: PenaltyStatus.MOA_APPROVED,
        },
      }),
      // ENTREPRISE sees: DGD approved (they can contest within deadline)
      prisma.dgdRecord.count({
        where: {
          projectId,
          organizationId: pm.organizationId,
          status: DgdStatus.APPROVED,
          disputeDeadline: { gte: new Date() },
        },
      }),
    ]);
    return {
      ftm: ftmCount,
      situations: situationCount,
      forecasts: forecastCount,
      penalties: penaltyCount,
      dgd: dgdCount,
      total: ftmCount + situationCount + forecastCount + penaltyCount + dgdCount,
    };
  }

  return { ftm: 0, situations: 0, forecasts: 0, penalties: 0, dgd: 0, total: 0 };
}
