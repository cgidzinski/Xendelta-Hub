import { describe, it, expect } from "vitest";
import { SIDE_TULIP_MULTIPLIER, CONTRIBUTION_RATE, JACKPOT_SEED, sideTulipPayout } from "./pachinkoPayouts";

describe("sideTulipPayout", () => {
    it("pays a fixed multiple of the price per ball", () => {
        expect(sideTulipPayout(100)).toBe(100 * SIDE_TULIP_MULTIPLIER);
    });
});

describe("payout constants", () => {
    it("are sane starting values", () => {
        expect(SIDE_TULIP_MULTIPLIER).toBeGreaterThan(0);
        expect(CONTRIBUTION_RATE).toBeGreaterThan(0);
        expect(CONTRIBUTION_RATE).toBeLessThanOrEqual(1);
        expect(JACKPOT_SEED).toBeGreaterThanOrEqual(0);
    });
});
