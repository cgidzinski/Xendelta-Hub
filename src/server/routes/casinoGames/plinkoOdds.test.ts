import { describe, it, expect } from "vitest";
import { ROWS, SLOT_COUNT, MULTIPLIERS, SLOT_WEIGHT, TOTAL_WEIGHT, binomialCoeff, slotProbability, plinkoRtp } from "./plinkoOdds";

describe("binomialCoeff", () => {
  it("matches Pascal's triangle for row 12", () => {
    expect(SLOT_WEIGHT).toEqual([1, 12, 66, 220, 495, 792, 924, 792, 495, 220, 66, 12, 1]);
  });

  it("is symmetric (C(n,k) === C(n,n-k))", () => {
    for (let k = 0; k <= ROWS; k++) {
      expect(binomialCoeff(ROWS, k)).toBeCloseTo(binomialCoeff(ROWS, ROWS - k));
    }
  });
});

describe("slot probabilities", () => {
  it("sum to 1 across all slots", () => {
    const total = Array.from({ length: SLOT_COUNT }, (_, slot) => slotProbability(slot)).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1);
  });

  it("every path is equally likely (weights sum to 2^rows)", () => {
    expect(SLOT_WEIGHT.reduce((a, b) => a + b, 0)).toBe(TOTAL_WEIGHT);
    expect(TOTAL_WEIGHT).toBe(4096);
  });

  it("the center slot is the most probable", () => {
    const center = Math.floor(ROWS / 2);
    const centerP = slotProbability(center);
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      if (slot !== center) {
        expect(slotProbability(slot)).toBeLessThanOrEqual(centerP);
      }
    }
  });
});

describe("MULTIPLIERS", () => {
  it("is symmetric around the center", () => {
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      expect(MULTIPLIERS[slot]).toBeCloseTo(MULTIPLIERS[SLOT_COUNT - 1 - slot]);
    }
  });

  it("pays the least at the crowded center and the most at the rare edges", () => {
    const center = Math.floor(ROWS / 2);
    expect(MULTIPLIERS[0]).toBeGreaterThan(MULTIPLIERS[center]);
    expect(MULTIPLIERS[SLOT_COUNT - 1]).toBeGreaterThan(MULTIPLIERS[center]);
  });
});

describe("plinkoRtp", () => {
  it("lands exactly on the documented 95% target", () => {
    // See plinko.ts's file header for the derivation this multiplier table is solved from.
    expect(plinkoRtp()).toBeCloseTo(0.95, 10);
  });
});
