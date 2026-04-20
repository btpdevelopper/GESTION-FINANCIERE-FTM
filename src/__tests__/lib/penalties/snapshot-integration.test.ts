import { describe, it, expect } from "vitest";
import { computeFinancialSnapshot } from "@/lib/situations/calculations";
import { computePenaltyFrozenAmount, sumActivePenalties } from "@/lib/penalties/calculations";
import type { CompanyContractSettings } from "@prisma/client";

/**
 * Minimal contract settings with only the fields computeFinancialSnapshot needs.
 * Penalty fields are unused in the new module (dedicated Penalty model handles them).
 */
function makeSettings(overrides: Partial<CompanyContractSettings> = {}): CompanyContractSettings {
  return {
    id: "test-id",
    projectId: "project-id",
    organizationId: "org-id",
    retenueGarantieActive: false,
    retenueGarantiePercent: null,
    avanceTravauxAmountCents: null,
    avanceTravauxRefundStartMonth: null,
    avanceTravauxRefundStartPercent: null,
    avanceTravauxRefundInstallments: null,
    penaltyType: "NONE",
    penaltyDailyRateCents: null,
    forecastWaived: false,
    ...overrides,
  };
}

describe("Financial snapshot with dedicated penalties", () => {
  const marche = BigInt(200_000_00); // €200,000
  const ftms   = BigInt(30_000_00);  // €30,000

  it("no deductions, no penalties: net = period amount", () => {
    const snapshot = computeFinancialSnapshot(
      {
        cumulativeAmountHtCents: BigInt(50_000_00),
        previousCumulativeHtCents: BigInt(30_000_00),
        contractSettings: makeSettings(),
        pastRefundedAmountCents: BigInt(0),
        situationNumero: 1,
        totalEnveloppeHtCents: marche,
        penaltyAmountCents: BigInt(0),
      },
    );
    expect(snapshot.periodNetBeforeDeductionsHtCents).toBe(BigInt(20_000_00));
    expect(snapshot.netAmountHtCents).toBe(BigInt(20_000_00));
  });

  it("applies a single FIXED dedicated penalty", () => {
    const penaltyAmount = computePenaltyFrozenAmount("FIXED", BigInt(2_000_00), marche, ftms);
    // penalty = €2,000

    const snapshot = computeFinancialSnapshot(
      {
        cumulativeAmountHtCents: BigInt(50_000_00),
        previousCumulativeHtCents: BigInt(30_000_00),
        contractSettings: makeSettings(),
        pastRefundedAmountCents: BigInt(0),
        situationNumero: 1,
        totalEnveloppeHtCents: marche,
        penaltyAmountCents: penaltyAmount,
      },
    );
    // period = 20,000 − 2,000 = €18,000
    expect(snapshot.periodNetBeforeDeductionsHtCents).toBe(BigInt(20_000_00));
    expect(snapshot.netAmountHtCents).toBe(BigInt(18_000_00));
  });

  it("sums multiple active dedicated penalties", () => {
    const p1 = { frozenAmountCents: computePenaltyFrozenAmount("FIXED", BigInt(1_000_00), marche, ftms) };
    const p2 = { frozenAmountCents: computePenaltyFrozenAmount("PCT_BASE_MARCHE", BigInt(50), marche, ftms) };
    // p2 = 0.5% of 200,000 = €1,000
    const total = sumActivePenalties([p1, p2]);
    expect(total).toBe(BigInt(2_000_00));

    const snapshot = computeFinancialSnapshot(
      {
        cumulativeAmountHtCents: BigInt(50_000_00),
        previousCumulativeHtCents: BigInt(30_000_00),
        contractSettings: makeSettings(),
        pastRefundedAmountCents: BigInt(0),
        situationNumero: 1,
        totalEnveloppeHtCents: marche,
        penaltyAmountCents: total,
      },
    );
    expect(snapshot.netAmountHtCents).toBe(BigInt(18_000_00));
  });

  it("PCT_ACTUAL_MARCHE penalty uses base + FTMs", () => {
    // 5% of (200,000 + 30,000) = 5% of 230,000 = €11,500
    const penaltyAmount = computePenaltyFrozenAmount("PCT_ACTUAL_MARCHE", BigInt(500), marche, ftms);
    expect(penaltyAmount).toBe(BigInt(11_500_00));

    const snapshot = computeFinancialSnapshot(
      {
        cumulativeAmountHtCents: BigInt(50_000_00),
        previousCumulativeHtCents: BigInt(30_000_00),
        contractSettings: makeSettings(),
        pastRefundedAmountCents: BigInt(0),
        situationNumero: 1,
        totalEnveloppeHtCents: marche,
        penaltyAmountCents: penaltyAmount,
      },
    );
    // period = 20,000 − 11,500 = €8,500
    expect(snapshot.netAmountHtCents).toBe(BigInt(8_500_00));
  });

  it("penalties compound with retenue de garantie", () => {
    const retenuePct = 5; // 5%
    const penaltyAmount = computePenaltyFrozenAmount("FIXED", BigInt(1_000_00), marche, ftms);
    // period = €20,000; retenue = 5% × 20,000 = €1,000; penalty = €1,000
    // net = 20,000 − 1,000 − 1,000 = €18,000

    const snapshot = computeFinancialSnapshot(
      {
        cumulativeAmountHtCents: BigInt(50_000_00),
        previousCumulativeHtCents: BigInt(30_000_00),
        contractSettings: makeSettings({
          retenueGarantieActive: true,
          retenueGarantiePercent: retenuePct as unknown as CompanyContractSettings["retenueGarantiePercent"],
        }),
        pastRefundedAmountCents: BigInt(0),
        situationNumero: 1,
        totalEnveloppeHtCents: marche,
        penaltyAmountCents: penaltyAmount,
      },
    );
    expect(snapshot.retenueGarantieAmountCents).toBe(BigInt(1_000_00));
    expect(snapshot.netAmountHtCents).toBe(BigInt(18_000_00));
  });

  it("penalty frozen at submission does not change if marché grows", () => {
    // Simulate: penalty frozen at submission when marché = 200k
    const frozenAtSubmission = computePenaltyFrozenAmount("PCT_BASE_MARCHE", BigInt(500), marche, BigInt(0));
    expect(frozenAtSubmission).toBe(BigInt(10_000_00)); // 5% of 200k

    // After new FTM approved, actual marché is now 230k — but frozen amount is unchanged
    const frozenAfterFtm = computePenaltyFrozenAmount("PCT_BASE_MARCHE", BigInt(500), marche + ftms, BigInt(0));
    // This would be a NEW calculation, but the frozen field stays at 10,000 — caller is responsible
    expect(frozenAtSubmission).not.toBe(frozenAfterFtm);
    expect(frozenAtSubmission).toBe(BigInt(10_000_00));
  });

  it("no penalty when all null or zero", () => {
    const total = sumActivePenalties([
      { frozenAmountCents: null },
      { frozenAmountCents: null },
    ]);
    expect(total).toBe(BigInt(0));

    const snapshot = computeFinancialSnapshot(
      {
        cumulativeAmountHtCents: BigInt(50_000_00),
        previousCumulativeHtCents: BigInt(30_000_00),
        contractSettings: makeSettings(),
        pastRefundedAmountCents: BigInt(0),
        situationNumero: 1,
        totalEnveloppeHtCents: marche,
        penaltyAmountCents: total,
      },
    );
    expect(snapshot.netAmountHtCents).toBe(BigInt(20_000_00));
  });
});
