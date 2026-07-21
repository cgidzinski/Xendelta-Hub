import { describe, it, expect } from "vitest";
import { TIERS, generateRound } from "./crossword";
import { prizeRtp } from "./prizeWeights";

const PRICE = 20000;

describe("TIERS", () => {
    it("is monotonically rarer for a bigger word count, matching the payout ladder", () => {
        for (let i = 1; i < TIERS.length; i++) {
            expect(TIERS[i].weight).toBeLessThan(TIERS[i - 1].weight);
            expect(TIERS[i].count).toBeGreaterThan(TIERS[i - 1].count);
            expect(TIERS[i].value).toBeGreaterThan(TIERS[i - 1].value);
        }
    });

    it("lands in the documented ~81% RTP range", () => {
        const rtp = prizeRtp(PRICE, TIERS);
        expect(rtp).toBeGreaterThan(0.78);
        expect(rtp).toBeLessThan(0.84);
    });
});

// Regression guard for a real bug found in production: generateRound() used to re-derive
// wordsFoundCount from whether the padded "your letters" bag happened to spell out each word,
// rather than trusting the tier drawn from TIERS. Because the word bank is small and
// letter-heavy, decoy padding (and even the found words' own pooled letters) very often spelled
// out extra words by coincidence - inflating the realized jackpot rate to ~1-in-179 and the
// realized RTP to ~333% instead of the advertised 1-in-823 / ~81%. These tests pin down the
// invariant that broke: wordsFoundCount/totalPayout must always be exactly the drawn tier's
// count/value, nothing else.
describe("generateRound: payout is always exactly the drawn tier, never inflated by display", () => {
    it("every round's wordsFoundCount is one of TIERS' declared counts, never anything else", () => {
        const ROUNDS = 2_000;
        const validCounts = new Set(TIERS.map((t) => t.count));
        for (let i = 0; i < ROUNDS; i++) {
            const result = generateRound();
            expect(validCounts.has(result.wordsFoundCount)).toBe(true);
            expect(result.words.filter((w) => w.found).length).toBe(result.wordsFoundCount);
        }
    }, 30_000);

    it("totalPayout always matches the TIERS value for that round's wordsFoundCount exactly", () => {
        const ROUNDS = 2_000;
        const valueByCount = new Map(TIERS.map((t) => [t.count, t.value]));
        for (let i = 0; i < ROUNDS; i++) {
            const result = generateRound();
            expect(result.totalPayout).toBe(valueByCount.get(result.wordsFoundCount));
        }
    }, 30_000);

    // Monte Carlo over more rounds to confirm the realized distribution/RTP actually converges
    // to TIERS' theoretical numbers now, not just that individual rounds are self-consistent.
    it("converges realized RTP and jackpot frequency within tolerance of the theoretical values", () => {
        const ROUNDS = 20_000;
        const TOLERANCE = 0.1;

        let totalPayout = 0;
        let jackpotHits = 0;
        for (let i = 0; i < ROUNDS; i++) {
            const result = generateRound();
            totalPayout += result.totalPayout;
            if (result.wordsFoundCount === 8) jackpotHits++;
        }

        const realizedRtp = totalPayout / ROUNDS / PRICE;
        const theoreticalRtp = prizeRtp(PRICE, TIERS);
        expect(realizedRtp).toBeGreaterThan(theoreticalRtp - TOLERANCE);
        expect(realizedRtp).toBeLessThan(theoreticalRtp + TOLERANCE);

        const totalWeight = TIERS.reduce((sum, t) => sum + t.weight, 0);
        const jackpotWeight = TIERS.find((t) => t.count === 8)!.weight;
        const theoreticalJackpotOdds = totalWeight / jackpotWeight;
        // Loose bound (not a tight tolerance) since 20k rounds only yields ~24 jackpot hits -
        // just guards against the observed odds being wildly off (e.g. the old bug's ~1-in-179).
        if (jackpotHits > 0) {
            const observedJackpotOdds = ROUNDS / jackpotHits;
            expect(observedJackpotOdds).toBeGreaterThan(theoreticalJackpotOdds * 0.4);
        }
    }, 60_000);
});
