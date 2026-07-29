import { describe, it, expect } from "vitest";
import { RANCH_RARITY_TIERS, rollHatch, rarityDistribution, raceWinProbability, generateOpponent, levelForXp, effectiveRaceTotal } from "./casinoRanch";

// Monte Carlo sanity check that the real rollHatch() (not a reimplementation) actually
// realizes the distribution implied by RANCH_RARITY_TIERS' weights - a regression guard
// against a future change to rollHatch's arithmetic silently decoupling the real draw from
// the weight table it's supposed to be a plain draw from (same pattern as
// kittyScratch.test.ts's generateRound Monte Carlo check).
describe("rollHatch: real Monte Carlo matches the theoretical weight table", () => {
    it("converges observed tier frequencies within tolerance of rarityDistribution()", () => {
        const ROUNDS = 200_000;
        const TOLERANCE = 0.01;

        const counts: Record<string, number> = {};
        for (let i = 0; i < ROUNDS; i++) {
            const { tier } = rollHatch();
            counts[tier.key] = (counts[tier.key] ?? 0) + 1;
        }

        for (const { key, probability } of rarityDistribution()) {
            const observed = (counts[key] ?? 0) / ROUNDS;
            expect(observed).toBeGreaterThan(probability - TOLERANCE);
            expect(observed).toBeLessThan(probability + TOLERANCE);
        }
    }, 60_000);

    it("never rolls a stat outside the hatched tier's declared statRange", () => {
        const ROUNDS = 20_000;
        for (let i = 0; i < ROUNDS; i++) {
            const { tier, stats } = rollHatch();
            const [lo, hi] = tier.statRange;
            expect(stats.speed).toBeGreaterThanOrEqual(lo);
            expect(stats.speed).toBeLessThanOrEqual(hi);
            expect(stats.stamina).toBeGreaterThanOrEqual(lo);
            expect(stats.stamina).toBeLessThanOrEqual(hi);
            expect(stats.power).toBeGreaterThanOrEqual(lo);
            expect(stats.power).toBeLessThanOrEqual(hi);
        }
    }, 30_000);
});

describe("rarityDistribution", () => {
    it("sums to 1 across every tier", () => {
        const total = rarityDistribution().reduce((sum, t) => sum + t.probability, 0);
        expect(total).toBeCloseTo(1, 10);
    });

    it("covers every tier in RANCH_RARITY_TIERS", () => {
        const keys = rarityDistribution().map((t) => t.key);
        expect(keys.sort()).toEqual(RANCH_RARITY_TIERS.map((t) => t.key).sort());
    });
});

describe("raceWinProbability", () => {
    it("returns ~0.5 for equal totals", () => {
        expect(raceWinProbability(100, 100)).toBeCloseTo(0.5, 5);
    });

    it("clamps to the max ceiling when the player heavily outmatches the opponent", () => {
        expect(raceWinProbability(10_000, 1)).toBeLessThanOrEqual(0.9);
        expect(raceWinProbability(10_000, 1)).toBeGreaterThan(0.85);
    });

    it("clamps to the min floor when the opponent heavily outmatches the player", () => {
        expect(raceWinProbability(1, 10_000)).toBeGreaterThanOrEqual(0.1);
        expect(raceWinProbability(1, 10_000)).toBeLessThan(0.15);
    });

    it("is monotonic in playerTotal for a fixed opponentTotal", () => {
        const low = raceWinProbability(50, 100);
        const high = raceWinProbability(150, 100);
        expect(high).toBeGreaterThan(low);
    });
});

describe("generateOpponent", () => {
    it("scales around the player's total within the declared range", () => {
        const ROUNDS = 5_000;
        const playerTotal = 200;
        for (let i = 0; i < ROUNDS; i++) {
            const opponentTotal = generateOpponent(playerTotal);
            expect(opponentTotal).toBeGreaterThanOrEqual(Math.round(playerTotal * 0.8) - 1);
            expect(opponentTotal).toBeLessThanOrEqual(Math.round(playerTotal * 1.2) + 1);
        }
    });
});

describe("levelForXp", () => {
    it("starts at level 1 with zero xp", () => {
        expect(levelForXp(0)).toBe(1);
    });

    it("advances one level per 100 xp", () => {
        expect(levelForXp(99)).toBe(1);
        expect(levelForXp(100)).toBe(2);
        expect(levelForXp(250)).toBe(3);
        expect(levelForXp(999)).toBe(10);
    });
});

describe("effectiveRaceTotal", () => {
    const stats = { speed: 100, stamina: 50, power: 10 };
    const sprint = { key: "sprint", label: "Sprint", weights: { speed: 2, stamina: 0.5, power: 0.5 } };
    const brawl = { key: "brawl", label: "Brawl", weights: { speed: 0.5, stamina: 0.5, power: 2 } };

    it("weights stats according to the category", () => {
        expect(effectiveRaceTotal(stats, sprint)).toBeCloseTo(100 * 2 + 50 * 0.5 + 10 * 0.5, 5);
        expect(effectiveRaceTotal(stats, brawl)).toBeCloseTo(100 * 0.5 + 50 * 0.5 + 10 * 2, 5);
    });

    it("favors a speed-heavy creature more in Sprint than in Brawl", () => {
        expect(effectiveRaceTotal(stats, sprint)).toBeGreaterThan(effectiveRaceTotal(stats, brawl));
    });
});

// Monte Carlo RTP sanity check for a race entry - realized average payout per cheddar
// wagered should land in the same ~85-95% band the repo's other games target (see
// kittyScratch.test.ts's kittyScratchRtp check), given the fixed RACE_WIN_MULTIPLIER of 1.8
// and win probability centered near 0.5 by generateOpponent's symmetric scaling.
describe("race RTP", () => {
    it("lands in the same ~85-95% RTP band as this app's other games", () => {
        const ROUNDS = 100_000;
        const ENTRY_FEE = 500;
        const WIN_MULTIPLIER = 1.8;
        const playerTotal = 200;

        let totalPayout = 0;
        for (let i = 0; i < ROUNDS; i++) {
            const opponentTotal = generateOpponent(playerTotal);
            const winProb = raceWinProbability(playerTotal, opponentTotal);
            if (Math.random() < winProb) {
                totalPayout += ENTRY_FEE * WIN_MULTIPLIER;
            }
        }
        const realizedRtp = totalPayout / ROUNDS / ENTRY_FEE;

        expect(realizedRtp).toBeGreaterThan(0.85);
        expect(realizedRtp).toBeLessThan(0.95);
    }, 60_000);
});
