import { describe, it, expect } from "vitest";
import { POCKETS } from "./pachinkoLayout";
import { POCKET_WEIGHT, TOTAL_WEIGHT, FIXED_RTP, CONTRIBUTION_RATE, TARGET_RTP, pocketProbability, missProbability, fixedPocketPayout, paytable } from "./pachinkoOdds";

describe("pocket weights", () => {
  it("are index-aligned with POCKETS", () => {
    expect(POCKET_WEIGHT.length).toBe(POCKETS.length);
  });

  it("sum to TOTAL_WEIGHT", () => {
    expect(POCKET_WEIGHT.reduce((a, b) => a + b, 0)).toBe(TOTAL_WEIGHT);
  });

  it("probabilities sum to 1 across all pockets", () => {
    const total = POCKETS.reduce((sum, _pocket, i) => sum + pocketProbability(i), 0);
    expect(total).toBeCloseTo(1);
  });

  it("is mostly miss, like a real pachinko board", () => {
    expect(missProbability()).toBeGreaterThan(0.85);
  });

  it("is symmetric (jackpot/small pockets mirror around center)", () => {
    for (let i = 0; i < POCKETS.length; i++) {
      expect(POCKET_WEIGHT[i]).toBe(POCKET_WEIGHT[POCKETS.length - 1 - i]);
    }
  });
});

describe("fixedPocketPayout", () => {
  it("pays multiplier * pricePerBall for jackpot/small pockets", () => {
    const jackpotPocket = POCKETS.find((p) => p.type === "jackpot")!;
    const smallPocket = POCKETS.find((p) => p.type === "small")!;
    expect(fixedPocketPayout(jackpotPocket, 100)).toBe(2500);
    expect(fixedPocketPayout(smallPocket, 100)).toBe(150);
  });

  it("pays nothing for miss and start pockets (start is paid from the pool by the route)", () => {
    const missPocket = POCKETS.find((p) => p.type === "miss")!;
    const startPocket = POCKETS.find((p) => p.type === "start")!;
    expect(fixedPocketPayout(missPocket, 100)).toBe(0);
    expect(fixedPocketPayout(startPocket, 100)).toBe(0);
  });
});

describe("RTP", () => {
  it("FIXED_RTP matches the documented derivation", () => {
    // See pachinko.ts's file header for the full derivation.
    expect(FIXED_RTP).toBeCloseTo(0.214, 10);
  });

  it("FIXED_RTP + CONTRIBUTION_RATE lands on the documented 95% target", () => {
    expect(FIXED_RTP + CONTRIBUTION_RATE).toBeCloseTo(TARGET_RTP, 10);
  });

  it("leaves room under the target for the pool to fill (contribution rate is positive)", () => {
    expect(CONTRIBUTION_RATE).toBeGreaterThan(0);
    expect(CONTRIBUTION_RATE).toBeLessThan(TARGET_RTP);
  });
});

describe("paytable", () => {
  it("has one row per pocket, in board order", () => {
    const rows = paytable();
    expect(rows.map((r) => r.index)).toEqual(POCKETS.map((p) => p.index));
  });

  it("omits multiplier for miss and start rows", () => {
    for (const row of paytable()) {
      if (row.type === "miss" || row.type === "start") {
        expect(row.multiplier).toBeUndefined();
      } else {
        expect(row.multiplier).toBeGreaterThan(0);
      }
    }
  });
});
