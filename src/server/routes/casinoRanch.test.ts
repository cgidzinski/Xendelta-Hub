import { describe, it, expect } from "vitest";
import {
    RANCH_RARITY_TIERS,
    RACE_COURSES,
    rollHatch,
    rarityDistribution,
    rollFeedGains,
    rollRival,
    pickCourse,
    effectiveRaceTotal,
    simulateRace,
    estimateWinProbabilities,
    multiplierForProbability,
    RanchStats,
    Racer,
} from "./casinoRanch";

const STAT_KEYS: (keyof RanchStats)[] = ["speed", "stamina", "power", "intelligence", "luck"];

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

    it("never rolls a stat outside the hatched tier's declared statRange, for all 5 stats", () => {
        const ROUNDS = 20_000;
        for (let i = 0; i < ROUNDS; i++) {
            const { tier, stats } = rollHatch();
            const [lo, hi] = tier.statRange;
            for (const key of STAT_KEYS) {
                expect(stats[key]).toBeGreaterThanOrEqual(lo);
                expect(stats[key]).toBeLessThanOrEqual(hi);
            }
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

describe("rollFeedGains", () => {
    it("rolls all 5 stats within FEED_GAIN_RANGE ([1, 4])", () => {
        const ROUNDS = 20_000;
        for (let i = 0; i < ROUNDS; i++) {
            const gains = rollFeedGains();
            for (const key of STAT_KEYS) {
                expect(gains[key]).toBeGreaterThanOrEqual(1);
                expect(gains[key]).toBeLessThanOrEqual(4);
            }
        }
    }, 30_000);
});

describe("rollRival", () => {
    it("rolls stats within the given tier's declared statRange", () => {
        const ROUNDS = 20_000;
        for (const tier of RANCH_RARITY_TIERS) {
            for (let i = 0; i < ROUNDS / RANCH_RARITY_TIERS.length; i++) {
                const { stats } = rollRival(tier.key);
                const [lo, hi] = tier.statRange;
                for (const key of STAT_KEYS) {
                    expect(stats[key]).toBeGreaterThanOrEqual(lo);
                    expect(stats[key]).toBeLessThanOrEqual(hi);
                }
            }
        }
    }, 30_000);

    it("falls back to the first tier for an unknown tier key", () => {
        const { stats } = rollRival("not-a-real-tier");
        const [lo, hi] = RANCH_RARITY_TIERS[0].statRange;
        for (const key of STAT_KEYS) {
            expect(stats[key]).toBeGreaterThanOrEqual(lo);
            expect(stats[key]).toBeLessThanOrEqual(hi);
        }
    });
});

describe("pickCourse", () => {
    it("picks roughly uniformly across every course over many trials", () => {
        const ROUNDS = 60_000;
        const counts: Record<string, number> = {};
        for (let i = 0; i < ROUNDS; i++) {
            const course = pickCourse();
            counts[course.key] = (counts[course.key] ?? 0) + 1;
        }
        const expected = 1 / RACE_COURSES.length;
        for (const course of RACE_COURSES) {
            const observed = (counts[course.key] ?? 0) / ROUNDS;
            expect(observed).toBeGreaterThan(expected - 0.02);
            expect(observed).toBeLessThan(expected + 0.02);
        }
    }, 30_000);
});

describe("effectiveRaceTotal", () => {
    const stats: RanchStats = { speed: 100, stamina: 50, power: 10, intelligence: 20, luck: 5 };
    const sprint = RACE_COURSES.find((c) => c.key === "sprint")!;
    const brawl = RACE_COURSES.find((c) => c.key === "brawl")!;

    it("weights all 5 stats according to the course", () => {
        const expectedSprint = STAT_KEYS.reduce((sum, k) => sum + stats[k] * sprint.weights[k], 0);
        const expectedBrawl = STAT_KEYS.reduce((sum, k) => sum + stats[k] * brawl.weights[k], 0);
        expect(effectiveRaceTotal(stats, sprint)).toBeCloseTo(expectedSprint, 5);
        expect(effectiveRaceTotal(stats, brawl)).toBeCloseTo(expectedBrawl, 5);
    });

    it("favors a speed-heavy creature more on Sprint than on Brawl", () => {
        expect(effectiveRaceTotal(stats, sprint)).toBeGreaterThan(effectiveRaceTotal(stats, brawl));
    });
});

function makeRacer(id: string, stats: RanchStats): Racer {
    return { id, isPlayer: id === "player", species: "Test", name: "Test", level: 1, stats };
}

const EVEN_STATS: RanchStats = { speed: 50, stamina: 50, power: 50, intelligence: 50, luck: 50 };
const ALL_ROUNDER = RACE_COURSES.find((c) => c.key === "all-rounder")!;

describe("simulateRace", () => {
    it("returns exactly one entry per racer, with places forming a permutation of 1..N", () => {
        const racers = [makeRacer("player", EVEN_STATS), makeRacer("rival-1", EVEN_STATS), makeRacer("rival-2", EVEN_STATS), makeRacer("rival-3", EVEN_STATS)];
        const order = simulateRace(racers, ALL_ROUNDER);
        expect(order).toHaveLength(4);
        expect(order.map((o) => o.place).sort((a, b) => a - b)).toEqual([1, 2, 3, 4]);
        expect(new Set(order.map((o) => o.racerId)).size).toBe(4);
    });
});

describe("estimateWinProbabilities", () => {
    it("sums to 1 across all racers", () => {
        const racers = [makeRacer("player", EVEN_STATS), makeRacer("rival-1", EVEN_STATS), makeRacer("rival-2", EVEN_STATS), makeRacer("rival-3", EVEN_STATS)];
        const probs = estimateWinProbabilities(racers, ALL_ROUNDER);
        const total = Object.values(probs).reduce((sum, p) => sum + p, 0);
        expect(total).toBeCloseTo(1, 5);
    });

    it("is roughly equal for 4 identical racers", () => {
        const racers = [makeRacer("player", EVEN_STATS), makeRacer("rival-1", EVEN_STATS), makeRacer("rival-2", EVEN_STATS), makeRacer("rival-3", EVEN_STATS)];
        const probs = estimateWinProbabilities(racers, ALL_ROUNDER, 8000);
        for (const p of Object.values(probs)) {
            expect(p).toBeGreaterThan(0.15);
            expect(p).toBeLessThan(0.35);
        }
    });

    it("heavily favors a dominant racer", () => {
        const dominant: RanchStats = { speed: 500, stamina: 500, power: 500, intelligence: 500, luck: 500 };
        const weak: RanchStats = { speed: 10, stamina: 10, power: 10, intelligence: 10, luck: 10 };
        const racers = [makeRacer("player", dominant), makeRacer("rival-1", weak), makeRacer("rival-2", weak), makeRacer("rival-3", weak)];
        const probs = estimateWinProbabilities(racers, ALL_ROUNDER);
        expect(probs["player"]).toBeGreaterThan(0.9);
    });
});

describe("multiplierForProbability", () => {
    it("is monotonically decreasing in probability", () => {
        expect(multiplierForProbability(0.2)).toBeGreaterThan(multiplierForProbability(0.3));
        expect(multiplierForProbability(0.3)).toBeGreaterThan(multiplierForProbability(0.5));
        expect(multiplierForProbability(0.5)).toBeGreaterThan(multiplierForProbability(0.7));
    });

    it("matches targetRtp / p in the unclamped middle band", () => {
        expect(multiplierForProbability(0.3)).toBeCloseTo(0.9 / 0.3, 5);
        expect(multiplierForProbability(0.5)).toBeCloseTo(0.9 / 0.5, 5);
    });

    it("clamps at the extremes", () => {
        expect(multiplierForProbability(0.99)).toBeGreaterThanOrEqual(1.05);
        expect(multiplierForProbability(0.001)).toBeLessThanOrEqual(8);
    });
});

// Monte Carlo RTP sanity check across random race fields and random bet targets - wider
// tolerance than the old flat-multiplier race system's 85-95% band, since the
// favorite/longshot clamp intentionally skews realized RTP away from the exact target.
describe("race betting RTP", () => {
    it("lands in a wide sanity band across random fields and random bet targets", () => {
        const ROUNDS = 20_000;
        const STAKE = 100;

        let totalPayout = 0;
        for (let i = 0; i < ROUNDS; i++) {
            const tier = RANCH_RARITY_TIERS[Math.floor(Math.random() * RANCH_RARITY_TIERS.length)];
            const course = pickCourse();
            const racers = ["player", "rival-1", "rival-2", "rival-3"].map((id) => makeRacer(id, rollRival(tier.key).stats));
            const probs = estimateWinProbabilities(racers, course, 500);
            const betRacerId = racers[Math.floor(Math.random() * racers.length)].id;
            const multiplier = multiplierForProbability(probs[betRacerId]);

            const order = simulateRace(racers, course);
            if (order[0].racerId === betRacerId) {
                totalPayout += STAKE * multiplier;
            }
        }
        const realizedRtp = totalPayout / ROUNDS / STAKE;

        expect(realizedRtp).toBeGreaterThan(0.7);
        expect(realizedRtp).toBeLessThan(0.95);
    }, 60_000);
});
