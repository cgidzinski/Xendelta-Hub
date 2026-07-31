import { describe, it, expect } from "vitest";
import { BONUS_POCKET_BALLS, SIDE_TULIP_BALLS, ATTACKER_OPEN_SHOTS, ATTACKER_BALLS, CONTRIBUTION_RATE, JACKPOT_SEED, CASH_OUT_RATE, jackpotBalls, cashOutAmount } from "./pachinkoPayouts";

describe("jackpotBalls", () => {
    it("converts the pool's cheddar value to balls at the price per ball", () => {
        expect(jackpotBalls(1000, 100)).toBe(10);
    });

    it("never returns a negative ball count", () => {
        expect(jackpotBalls(0, 100)).toBeGreaterThanOrEqual(0);
    });
});

describe("cashOutAmount", () => {
    it("converts balls to cheddar at CASH_OUT_RATE * pricePerBall", () => {
        expect(cashOutAmount(10, 100)).toBe(10 * 100 * CASH_OUT_RATE);
    });

    it("is zero for zero balls", () => {
        expect(cashOutAmount(0, 100)).toBe(0);
    });
});

describe("payout constants", () => {
    it("are sane starting values - every ball award is positive, rates are valid fractions", () => {
        expect(BONUS_POCKET_BALLS).toBeGreaterThan(0);
        expect(SIDE_TULIP_BALLS).toBeGreaterThan(0);
        expect(ATTACKER_BALLS).toBeGreaterThan(0);
        expect(ATTACKER_OPEN_SHOTS).toBeGreaterThan(0);
        expect(CONTRIBUTION_RATE).toBeGreaterThan(0);
        expect(CONTRIBUTION_RATE).toBeLessThanOrEqual(1);
        expect(JACKPOT_SEED).toBeGreaterThanOrEqual(0);
        expect(CASH_OUT_RATE).toBeGreaterThan(0);
    });

    it("the rare attacker pays more than the frequent bonus/tulip pockets", () => {
        // Bonus and tulip are no longer strictly ordered against each other - a Monte Carlo
        // sweep (see pachinkoPayoutTuning.ts) found the tulip has a physics/nail-field sweet
        // spot at a specific launch power where it's caught far more often than the "easy"
        // bonus pocket is anywhere on the board, so it was cut hardest of any pocket rather
        // than assumed to deserve a higher payout than bonus by default.
        expect(BONUS_POCKET_BALLS).toBeLessThan(ATTACKER_BALLS);
        expect(SIDE_TULIP_BALLS).toBeLessThan(ATTACKER_BALLS);
    });
});
