import { describe, it, expect } from "vitest";
import {
  computePenaltyFrozenAmount,
  sumActivePenalties,
  isPenaltyContestable,
  canCancelPenalty,
  canMaintainPenalty,
} from "@/lib/penalties/calculations";

// ─── computePenaltyFrozenAmount ───────────────────────────────────────────────

describe("computePenaltyFrozenAmount", () => {
  const marche = BigInt(100_000_00); // €100,000 HT in cents
  const ftms   = BigInt(20_000_00);  // €20,000 approved FTMs

  describe("FIXED type", () => {
    it("returns inputValue directly", () => {
      expect(computePenaltyFrozenAmount("FIXED", BigInt(500_00), marche, ftms))
        .toBe(BigInt(500_00));
    });

    it("returns 0 for inputValue = 0", () => {
      expect(computePenaltyFrozenAmount("FIXED", BigInt(0), marche, ftms))
        .toBe(BigInt(0));
    });

    it("handles large fixed amounts", () => {
      expect(computePenaltyFrozenAmount("FIXED", BigInt(1_000_000_00), marche, ftms))
        .toBe(BigInt(1_000_000_00));
    });
  });

  describe("PCT_BASE_MARCHE type", () => {
    it("computes 5% of base marché (500 basis points)", () => {
      // 5% of 100,000 € = 5,000 €
      const result = computePenaltyFrozenAmount("PCT_BASE_MARCHE", BigInt(500), marche, ftms);
      expect(result).toBe(BigInt(5_000_00));
    });

    it("computes 10% of base marché (1000 basis points)", () => {
      // 10% of 100,000 € = 10,000 €
      const result = computePenaltyFrozenAmount("PCT_BASE_MARCHE", BigInt(1000), marche, ftms);
      expect(result).toBe(BigInt(10_000_00));
    });

    it("ignores FTMs — uses only base marché", () => {
      const withFtm    = computePenaltyFrozenAmount("PCT_BASE_MARCHE", BigInt(500), marche, ftms);
      const withoutFtm = computePenaltyFrozenAmount("PCT_BASE_MARCHE", BigInt(500), marche, BigInt(0));
      expect(withFtm).toBe(withoutFtm);
    });

    it("computes 0.5% of base marché (50 basis points)", () => {
      // 0.5% of 100,000 € = 500 €
      const result = computePenaltyFrozenAmount("PCT_BASE_MARCHE", BigInt(50), marche, ftms);
      expect(result).toBe(BigInt(500_00));
    });

    it("returns 0 when base marché is 0", () => {
      const result = computePenaltyFrozenAmount("PCT_BASE_MARCHE", BigInt(500), BigInt(0), ftms);
      expect(result).toBe(BigInt(0));
    });
  });

  describe("PCT_ACTUAL_MARCHE type", () => {
    it("computes 5% of actual marché (base + FTMs)", () => {
      // actual = 100,000 + 20,000 = 120,000 € → 5% = 6,000 €
      const result = computePenaltyFrozenAmount("PCT_ACTUAL_MARCHE", BigInt(500), marche, ftms);
      expect(result).toBe(BigInt(6_000_00));
    });

    it("equals PCT_BASE_MARCHE when FTMs = 0", () => {
      const actual = computePenaltyFrozenAmount("PCT_ACTUAL_MARCHE", BigInt(500), marche, BigInt(0));
      const base   = computePenaltyFrozenAmount("PCT_BASE_MARCHE",   BigInt(500), marche, BigInt(0));
      expect(actual).toBe(base);
    });

    it("computes 10% of actual marché (1000 basis points)", () => {
      // 10% of 120,000 € = 12,000 €
      const result = computePenaltyFrozenAmount("PCT_ACTUAL_MARCHE", BigInt(1000), marche, ftms);
      expect(result).toBe(BigInt(12_000_00));
    });

    it("returns 0 when both base and FTMs are 0", () => {
      const result = computePenaltyFrozenAmount("PCT_ACTUAL_MARCHE", BigInt(500), BigInt(0), BigInt(0));
      expect(result).toBe(BigInt(0));
    });

    it("amounts differ from PCT_BASE_MARCHE when FTMs > 0", () => {
      const actual = computePenaltyFrozenAmount("PCT_ACTUAL_MARCHE", BigInt(500), marche, ftms);
      const base   = computePenaltyFrozenAmount("PCT_BASE_MARCHE",   BigInt(500), marche, ftms);
      expect(actual).toBeGreaterThan(base);
    });
  });
});

// ─── sumActivePenalties ───────────────────────────────────────────────────────

describe("sumActivePenalties", () => {
  it("sums frozen amounts", () => {
    const penalties = [
      { frozenAmountCents: BigInt(1_000_00) },
      { frozenAmountCents: BigInt(500_00) },
      { frozenAmountCents: BigInt(250_00) },
    ];
    expect(sumActivePenalties(penalties)).toBe(BigInt(1_750_00));
  });

  it("treats null frozenAmountCents as 0", () => {
    const penalties = [
      { frozenAmountCents: BigInt(1_000_00) },
      { frozenAmountCents: null },
    ];
    expect(sumActivePenalties(penalties)).toBe(BigInt(1_000_00));
  });

  it("returns 0 for empty array", () => {
    expect(sumActivePenalties([])).toBe(BigInt(0));
  });

  it("returns 0 when all frozenAmountCents are null", () => {
    const penalties = [{ frozenAmountCents: null }, { frozenAmountCents: null }];
    expect(sumActivePenalties(penalties)).toBe(BigInt(0));
  });
});

// ─── isPenaltyContestable ─────────────────────────────────────────────────────

describe("isPenaltyContestable", () => {
  it("returns true for MOA_APPROVED", () => {
    expect(isPenaltyContestable("MOA_APPROVED")).toBe(true);
  });

  it.each(["DRAFT", "SUBMITTED", "MOA_REFUSED", "CONTESTED", "CANCELLED", "MAINTAINED"])(
    "returns false for %s",
    (status) => {
      expect(isPenaltyContestable(status)).toBe(false);
    },
  );
});

// ─── canCancelPenalty ─────────────────────────────────────────────────────────

describe("canCancelPenalty", () => {
  describe("MOE actor", () => {
    it("can cancel DRAFT", () => {
      expect(canCancelPenalty("DRAFT", "MOE")).toBe(true);
    });

    it.each(["SUBMITTED", "MOA_APPROVED", "CONTESTED", "MOA_REFUSED", "CANCELLED", "MAINTAINED"])(
      "cannot cancel %s",
      (status) => {
        expect(canCancelPenalty(status, "MOE")).toBe(false);
      },
    );
  });

  describe("MOA actor", () => {
    it.each(["DRAFT", "SUBMITTED", "CONTESTED"])(
      "can cancel %s",
      (status) => {
        expect(canCancelPenalty(status, "MOA")).toBe(true);
      },
    );

    it.each(["MOA_REFUSED", "CANCELLED", "MAINTAINED"])(
      "cannot cancel %s",
      (status) => {
        expect(canCancelPenalty(status, "MOA")).toBe(false);
      },
    );

    it("can cancel MOA_APPROVED (MOA can cancel at any moment per spec)", () => {
      expect(canCancelPenalty("MOA_APPROVED", "MOA")).toBe(true);
    });
  });
});

// ─── canMaintainPenalty ───────────────────────────────────────────────────────

describe("canMaintainPenalty", () => {
  it("returns true for CONTESTED", () => {
    expect(canMaintainPenalty("CONTESTED")).toBe(true);
  });

  it.each(["DRAFT", "SUBMITTED", "MOA_APPROVED", "MOA_REFUSED", "CANCELLED", "MAINTAINED"])(
    "returns false for %s",
    (status) => {
      expect(canMaintainPenalty(status)).toBe(false);
    },
  );
});
