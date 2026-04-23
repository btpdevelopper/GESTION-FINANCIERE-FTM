import type { PenaltyAmountType } from "@prisma/client";

/**
 * Computes the frozen penalty amount (in cents) at submission time.
 *
 * FIXED:             inputValue is already in cents.
 * PCT_BASE_MARCHE:   inputValue is basis points (×100), base = base marché total.
 * PCT_ACTUAL_MARCHE: inputValue is basis points (×100), base = base marché + approved FTMs.
 *
 * The result is frozen at submission and never recomputed even if marché totals change later.
 */
export function computePenaltyFrozenAmount(
  amountType: PenaltyAmountType,
  inputValue: bigint,
  marcheTotalCents: bigint,
  approvedFtmTotalCents: bigint,
  activePenaltiesTotalCents: bigint = BigInt(0),
): bigint {
  const zero = BigInt(0);
  if (inputValue <= zero) return zero;

  if (amountType === "FIXED") {
    return inputValue;
  }

  const base =
    amountType === "PCT_ACTUAL_MARCHE"
      ? marcheTotalCents + approvedFtmTotalCents - activePenaltiesTotalCents
      : marcheTotalCents; // PCT_BASE_MARCHE is unaffected by penalties

  if (base <= zero) return zero;

  // inputValue is in basis points (1 basis point = 0.01%)
  // frozenAmount = base × inputValue / 10_000
  return (base * inputValue) / BigInt(10_000);
}

/**
 * Returns the sum of frozen amounts for a list of active (MOA_APPROVED or MAINTAINED) penalties.
 * Only call with records already filtered to those statuses.
 */
export function sumActivePenalties(
  penalties: { frozenAmountCents: bigint | null }[],
): bigint {
  return penalties.reduce(
    (sum, p) => sum + (p.frozenAmountCents ?? BigInt(0)),
    BigInt(0),
  );
}

/**
 * Returns true when a penalty status allows contesting (company-facing action).
 */
export function isPenaltyContestable(status: string): boolean {
  return status === "MOA_APPROVED";
}

/**
 * Returns true when a penalty can be cancelled by a given actor.
 * MOE: only DRAFT.
 * MOA: any non-terminal status.
 */
export function canCancelPenalty(
  status: string,
  actorRole: "MOE" | "MOA",
): boolean {
  const terminal = new Set(["MOA_APPROVED", "MOA_REFUSED", "CANCELLED", "MAINTAINED"]);
  if (terminal.has(status)) return actorRole === "MOA" && status !== "MOA_REFUSED" && status !== "CANCELLED" && status !== "MAINTAINED";
  if (actorRole === "MOE") return status === "DRAFT";
  return true; // MOA can cancel SUBMITTED, DRAFT, CONTESTED
}

/**
 * Returns true when a penalty can be maintained (dismiss contest) by MOE or MOA.
 */
export function canMaintainPenalty(status: string): boolean {
  return status === "CONTESTED";
}
