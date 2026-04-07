import { FtmPhase } from "@prisma/client";

/** Documented transitions for the FTM state machine (see architecture plan). */
export function nextPhaseAfterMoeCreationApprove(
  current: FtmPhase,
): FtmPhase | null {
  if (current === FtmPhase.CREATION) return FtmPhase.ETUDES;
  return null;
}

export function isTerminalPhase(phase: FtmPhase): boolean {
  return phase === FtmPhase.CANCELLED || phase === FtmPhase.ACCEPTED;
}
