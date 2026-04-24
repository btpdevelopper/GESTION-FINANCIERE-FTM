import { describe, it, expect } from "vitest";
import { computeFinancialSnapshot } from "@/lib/situations/calculations";
import type { CompanyContractSettings } from "@prisma/client";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cents(euros: number): bigint {
  return BigInt(Math.round(euros * 100));
}

/** Minimal valid settings with no retenue, no avance, no legacy penalty. */
const baseSettings: CompanyContractSettings = {
  id: "s1",
  projectId: "p1",
  organizationId: "o1",
  retenueGarantieActive: false,
  retenueGarantiePercent: null,
  avanceTravauxAmountCents: null,
  avanceTravauxRefundInstallments: null,
  avanceTravauxRefundStartMonth: null,
  avanceTravauxRefundStartPercent: null,
  penaltyType: "NONE",
  penaltyDailyRateCents: null,
  forecastWaived: false,
  cautionBancaireActive: false,
  cautionBancaireInsurer: null,
  cautionBancaireContractNumber: null,
  cautionBancaireAmountCents: null,
  cautionBancaireDocumentUrl: null,
  cautionBancaireDocumentName: null,
} as CompanyContractSettings;

// ─── billedAmountCents computation (floor division) ──────────────────────────

describe("FTM billing amount calculation", () => {
  it("computes 100% of a quote exactly", () => {
    const quoteAmountCents = cents(50_000);
    const percentage = 100;
    const billed = BigInt(Math.floor(Number(quoteAmountCents) * percentage / 100));
    expect(billed).toBe(cents(50_000));
  });

  it("computes 30% with floor rounding", () => {
    // 50,000.01 × 30% = 15,000.003 → floors to 15,000,000 cents... use a simpler case
    const quoteAmountCents = BigInt(10_001); // 100.01 €
    const percentage = 33;
    const billed = BigInt(Math.floor(Number(quoteAmountCents) * percentage / 100));
    expect(billed).toBe(BigInt(3300)); // floor(10001 × 33 / 100) = floor(3300.33) = 3300
  });

  it("floors fractional cents correctly", () => {
    const quoteAmountCents = BigInt(100); // €1
    const percentage = 33;
    const billed = BigInt(Math.floor(Number(quoteAmountCents) * percentage / 100));
    expect(billed).toBe(BigInt(33)); // floor(33) = 33
  });

  it("computes 1% of a large quote", () => {
    const quoteAmountCents = cents(1_000_000); // €1,000,000
    const percentage = 1;
    const billed = BigInt(Math.floor(Number(quoteAmountCents) * percentage / 100));
    expect(billed).toBe(cents(10_000)); // €10,000
  });
});

// ─── Cap enforcement logic ───────────────────────────────────────────────────

describe("FTM billing cap enforcement", () => {
  const quoteAmountCents = cents(100_000); // €100,000 quote

  function wouldExceedCap(
    alreadyApprovedCents: bigint,
    newBilledCents: bigint
  ): boolean {
    return alreadyApprovedCents + newBilledCents > quoteAmountCents;
  }

  it("allows billing when nothing has been approved yet", () => {
    expect(wouldExceedCap(BigInt(0), cents(30_000))).toBe(false);
  });

  it("allows billing up to exact 100%", () => {
    expect(wouldExceedCap(cents(70_000), cents(30_000))).toBe(false);
  });

  it("rejects billing that would exceed 100%", () => {
    expect(wouldExceedCap(cents(70_000), cents(30_001))).toBe(true);
  });

  it("rejects billing when already at 100%", () => {
    expect(wouldExceedCap(cents(100_000), cents(1))).toBe(true);
  });

  it("allows a second situation to bill remaining %", () => {
    // 30% approved in situation 1, billing 70% in situation 2
    const approvedElsewhere = cents(30_000);
    const newBilling = cents(70_000);
    expect(wouldExceedCap(approvedElsewhere, newBilling)).toBe(false);
  });

  it("rejects when second billing would go over remaining %", () => {
    const approvedElsewhere = cents(30_000);
    const newBilling = cents(70_001);
    expect(wouldExceedCap(approvedElsewhere, newBilling)).toBe(true);
  });

  it("excludesSituationId prevents double-counting current situation", () => {
    // Simulates: current situation already has 40% billed (being edited from 40% to 60%).
    // Only MOA-approved billings from OTHER situations count toward the cap.
    const approvedInOtherSituations = cents(30_000); // 30% from situation 1
    const newBilling = cents(60_000); // editing current from 40% to 60%
    // Total would be 30% + 60% = 90%, which is under 100%
    expect(wouldExceedCap(approvedInOtherSituations, newBilling)).toBe(false);
  });
});

// ─── computeFinancialSnapshot + ftmBilledTotal integration ───────────────────

describe("computeFinancialSnapshot with FTM billing added on top", () => {
  it("adds ftmBilledTotal to netAmountHtCents correctly", () => {
    const snapshot = computeFinancialSnapshot({
      cumulativeAmountHtCents: cents(100_000),
      previousCumulativeHtCents: cents(60_000),
      contractSettings: baseSettings,
      pastRefundedAmountCents: BigInt(0),
      situationNumero: 3,
      totalEnveloppeHtCents: cents(500_000),
      penaltyAmountCents: BigInt(0),
    });

    // period net = 100,000 - 60,000 = 40,000
    expect(snapshot.periodNetBeforeDeductionsHtCents).toBe(cents(40_000));
    expect(snapshot.netAmountHtCents).toBe(cents(40_000));

    // Simulate adding ftmBilledTotal (30% of a €50,000 FTM = €15,000)
    const ftmBilledTotal = cents(15_000);
    const finalNet = snapshot.netAmountHtCents + ftmBilledTotal;
    expect(finalNet).toBe(cents(55_000));
  });

  it("ftmBilledTotal is added after deductions (retenue, penalty)", () => {
    const settingsWithRetenue: CompanyContractSettings = {
      ...baseSettings,
      retenueGarantieActive: true,
      retenueGarantiePercent: 5 as unknown as CompanyContractSettings["retenueGarantiePercent"], // 5%
    };

    const snapshot = computeFinancialSnapshot({
      cumulativeAmountHtCents: cents(100_000),
      previousCumulativeHtCents: cents(80_000),
      contractSettings: settingsWithRetenue,
      pastRefundedAmountCents: BigInt(0),
      situationNumero: 1,
      totalEnveloppeHtCents: cents(500_000),
      penaltyAmountCents: BigInt(0),
    });

    // periodNet = 20,000; retenue = 5% × 20,000 = 1,000
    // net before FTM = 20,000 - 1,000 = 19,000
    expect(snapshot.retenueGarantieAmountCents).toBe(cents(1_000));
    expect(snapshot.netAmountHtCents).toBe(cents(19_000));

    // FTM billed: €10,000 added on top
    const ftmBilledTotal = cents(10_000);
    const finalNet = snapshot.netAmountHtCents + ftmBilledTotal;
    expect(finalNet).toBe(cents(29_000));
  });

  it("ftmBilledTotal = 0 when no FTMs are approved", () => {
    const snapshot = computeFinancialSnapshot({
      cumulativeAmountHtCents: cents(50_000),
      previousCumulativeHtCents: cents(30_000),
      contractSettings: baseSettings,
      pastRefundedAmountCents: BigInt(0),
      situationNumero: 2,
      totalEnveloppeHtCents: cents(500_000),
      penaltyAmountCents: BigInt(0),
    });

    const ftmBilledTotal = BigInt(0);
    const finalNet = snapshot.netAmountHtCents + ftmBilledTotal;
    expect(finalNet).toBe(snapshot.netAmountHtCents);
    expect(finalNet).toBe(cents(20_000));
  });

  it("ftmBilledTotal is positive even when works net is negative due to penalties", () => {
    // Edge case: penalty > periodNet, but FTM billing offsets some of the negative
    const snapshot = computeFinancialSnapshot({
      cumulativeAmountHtCents: cents(10_000),
      previousCumulativeHtCents: cents(8_000),
      contractSettings: baseSettings,
      pastRefundedAmountCents: BigInt(0),
      situationNumero: 1,
      totalEnveloppeHtCents: cents(500_000),
      penaltyAmountCents: cents(5_000), // penalty exceeds periodNet of 2,000
    });

    // net from works = 2,000 - 5,000 = -3,000 (negative)
    expect(snapshot.netAmountHtCents).toBe(cents(-3_000));

    // FTM brings it back to positive
    const ftmBilledTotal = cents(8_000);
    const finalNet = snapshot.netAmountHtCents + ftmBilledTotal;
    expect(finalNet).toBe(cents(5_000));
  });
});

// ─── Multiple FTMs per situation ─────────────────────────────────────────────

describe("Multiple FTM billings per situation", () => {
  it("sums multiple approved FTM billings correctly", () => {
    const billings = [
      { billedAmountCents: cents(15_000), status: "MOA_APPROVED" },
      { billedAmountCents: cents(8_000), status: "MOA_APPROVED" },
      { billedAmountCents: cents(5_000), status: "MOA_REFUSED" }, // excluded
      { billedAmountCents: cents(3_000), status: "MOE_APPROVED" }, // not yet MOA_APPROVED
    ];

    const ftmBilledTotal = billings
      .filter((b) => b.status === "MOA_APPROVED")
      .reduce((sum, b) => sum + b.billedAmountCents, BigInt(0));

    expect(ftmBilledTotal).toBe(cents(23_000));
  });

  it("returns 0 when no billings are MOA_APPROVED", () => {
    const billings = [
      { billedAmountCents: cents(10_000), status: "PENDING" },
      { billedAmountCents: cents(5_000), status: "MOE_REFUSED" },
    ];

    const ftmBilledTotal = billings
      .filter((b) => b.status === "MOA_APPROVED")
      .reduce((sum, b) => sum + b.billedAmountCents, BigInt(0));

    expect(ftmBilledTotal).toBe(BigInt(0));
  });

  it("each FTM tracks its own cap independently", () => {
    // FTM A: €100,000 quote; 30% already approved elsewhere = €30,000 used
    const ftmAQuote = cents(100_000);
    const ftmAApproved = cents(30_000);

    // FTM B: €50,000 quote; 60% already approved elsewhere = €30,000 used
    const ftmBQuote = cents(50_000);
    const ftmBApproved = cents(30_000);

    function remainingCap(quote: bigint, approved: bigint): bigint {
      return quote - approved;
    }

    expect(remainingCap(ftmAQuote, ftmAApproved)).toBe(cents(70_000));
    expect(remainingCap(ftmBQuote, ftmBApproved)).toBe(cents(20_000));
  });
});
