import { describe, it, expect } from "vitest";
import { ROW_PRIZE_WEIGHTS, MULTIPLIER_WEIGHTS, kittyScratchRtp, generateRound } from "./kittyScratch";

describe("kittyScratchRtp", () => {
    it("lands in the same ~85-95% RTP band as this app's other games", () => {
        expect(kittyScratchRtp()).toBeGreaterThan(0.85);
        expect(kittyScratchRtp()).toBeLessThan(0.95);
    });
});

// Monte Carlo sanity check that the real generateRound() (not a reimplementation) actually
// realizes the RTP implied by ROW_PRIZE_WEIGHTS/MULTIPLIER_WEIGHTS - a regression guard against
// any future change to generateRound's arithmetic silently decoupling the real payout from the
// weight tables it's supposed to be a plain draw from (see crossword.test.ts for a case where
// exactly this kind of drift happened for real).
describe("generateRound: real Monte Carlo matches the theoretical weight tables", () => {
    it("converges realized RTP within tolerance of kittyScratchRtp()", () => {
        const ROUNDS = 200_000;
        const PRICE = 5000;
        const TOLERANCE = 0.03;

        let totalPayout = 0;
        for (let i = 0; i < ROUNDS; i++) {
            totalPayout += generateRound().totalPayout;
        }
        const realizedRtp = totalPayout / ROUNDS / PRICE;

        expect(realizedRtp).toBeGreaterThan(kittyScratchRtp() - TOLERANCE);
        expect(realizedRtp).toBeLessThan(kittyScratchRtp() + TOLERANCE);
    }, 60_000);

    it("never draws a row amount or multiplier outside the declared weight tables", () => {
        const ROUNDS = 20_000;
        const validRowAmounts = new Set(ROW_PRIZE_WEIGHTS.map((w) => w.value));
        const validMultipliers = new Set(MULTIPLIER_WEIGHTS.map((w) => w.value));

        for (let i = 0; i < ROUNDS; i++) {
            const result = generateRound();
            for (const row of result.rows) {
                expect(validRowAmounts.has(row.amount)).toBe(true);
                expect(row.won).toBe(row.amount > 0);
            }
            expect(validMultipliers.has(result.multiplier)).toBe(true);
            expect(result.basePayout).toBe(result.rows.reduce((sum, r) => sum + r.amount, 0));
            expect(result.totalPayout).toBe(result.basePayout * result.multiplier);
        }
    }, 30_000);
});
