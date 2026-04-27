import type { CompanyContractSettings } from "@prisma/client";

export type FinancialSnapshotInput = {
  cumulativeBaseHtCents: bigint;
  cumulativeRevisionHtCents: bigint;
  previousCumulativeBaseHtCents: bigint;
  previousCumulativeRevisionHtCents: bigint;
  contractSettings: CompanyContractSettings;
  pastRefundedAmountCents: bigint;
  situationNumero: number;
  totalEnveloppeHtCents: bigint;
  penaltyAmountCents: bigint;
};

export type MoeAdjustment = {
  moeAdjustedBaseHtCents?: bigint | null;
  moeAdjustedRevisionHtCents?: bigint | null;
};

export type FinancialSnapshot = {
  acceptedCumulativeHtCents: bigint;
  previousCumulativeHtCents: bigint;
  periodNetBeforeDeductionsHtCents: bigint;
  retenueGarantieAmountCents: bigint;
  avanceTravauxRemboursementCents: bigint;
  netAmountHtCents: bigint;
};

export function computeFinancialSnapshot(
  input: FinancialSnapshotInput,
  moeAdjustment?: MoeAdjustment
): FinancialSnapshot {
  const {
    cumulativeBaseHtCents,
    cumulativeRevisionHtCents,
    previousCumulativeBaseHtCents,
    previousCumulativeRevisionHtCents,
    contractSettings,
    pastRefundedAmountCents,
    situationNumero,
    totalEnveloppeHtCents,
    penaltyAmountCents,
  } = input;

  const zero = BigInt(0);
  const ten_thousand = BigInt(10000);

  const acceptedBase = moeAdjustment?.moeAdjustedBaseHtCents ?? cumulativeBaseHtCents;
  const acceptedRevision = moeAdjustment?.moeAdjustedRevisionHtCents ?? cumulativeRevisionHtCents;
  const acceptedCumulative = acceptedBase + acceptedRevision;
  const previousCumulative = previousCumulativeBaseHtCents + previousCumulativeRevisionHtCents;
  const periodNet = acceptedCumulative - previousCumulative;

  // Retenue de garantie applies to the full period net (base + révision).
  let retenueGarantie = zero;
  if (contractSettings.retenueGarantieActive && contractSettings.retenueGarantiePercent) {
    const percent = BigInt(Math.round(Number(contractSettings.retenueGarantiePercent) * 100));
    retenueGarantie = (periodNet * percent) / ten_thousand;
  }

  // Avance travaux refund — French BTP rule: progress is measured on the base
  // contract advancement only. Révisions de prix never inflate the trigger.
  let avanceRefund = zero;
  const avanceAmount = contractSettings.avanceTravauxAmountCents ?? zero;
  if (avanceAmount > zero && contractSettings.avanceTravauxRefundInstallments) {
    const progressPercent =
      totalEnveloppeHtCents > zero
        ? Number((acceptedBase * ten_thousand) / totalEnveloppeHtCents) / 100
        : 0;

    const refundTriggered = isRefundTriggered(contractSettings, situationNumero, progressPercent);

    if (refundTriggered) {
      const perInstalment = avanceAmount / BigInt(contractSettings.avanceTravauxRefundInstallments);
      const remaining = avanceAmount - pastRefundedAmountCents;
      avanceRefund = remaining > zero ? (perInstalment < remaining ? perInstalment : remaining) : zero;
    }
  }

  const net = periodNet - retenueGarantie - avanceRefund - penaltyAmountCents;

  return {
    acceptedCumulativeHtCents: acceptedCumulative,
    previousCumulativeHtCents: previousCumulative,
    periodNetBeforeDeductionsHtCents: periodNet,
    retenueGarantieAmountCents: retenueGarantie,
    avanceTravauxRemboursementCents: avanceRefund,
    netAmountHtCents: net,
  };
}

function isRefundTriggered(
  settings: CompanyContractSettings,
  situationNumero: number,
  progressPercent: number
): boolean {
  if (settings.avanceTravauxRefundStartMonth !== null && settings.avanceTravauxRefundStartMonth !== undefined) {
    return situationNumero >= settings.avanceTravauxRefundStartMonth;
  }
  if (
    settings.avanceTravauxRefundStartPercent !== null &&
    settings.avanceTravauxRefundStartPercent !== undefined
  ) {
    return progressPercent >= Number(settings.avanceTravauxRefundStartPercent);
  }
  return false;
}

export function computePenaltyAmount(
  penaltyType: string | null | undefined,
  penaltyDailyRateCents: bigint | null | undefined,
  penaltyDelayDays: number | null | undefined,
  freePenaltyAmountCents: bigint | null | undefined
): bigint {
  const zero = BigInt(0);
  if (penaltyType === "DAILY_RATE" && penaltyDailyRateCents && penaltyDelayDays) {
    return penaltyDailyRateCents * BigInt(penaltyDelayDays);
  }
  if (penaltyType === "FREE_AMOUNT" && freePenaltyAmountCents) {
    return freePenaltyAmountCents;
  }
  return zero;
}
