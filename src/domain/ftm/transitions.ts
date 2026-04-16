import { FtmPhase } from "@prisma/client";

/** Documented transitions for the FTM state machine (see architecture plan). */

export function isTerminalPhase(phase: FtmPhase): boolean {
  return phase === FtmPhase.CANCELLED || phase === FtmPhase.ACCEPTED;
}
