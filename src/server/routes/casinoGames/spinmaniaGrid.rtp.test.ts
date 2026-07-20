import { describe, it, expect } from "vitest";
import { resolveSpin } from "./spinmaniaGrid";
import { SPINMANIA_CONFIG } from "./spinmania";

// Monte Carlo RTP check, not a closed-form proof - a 5x3 all-ways-pay grid with cascades has
// no tractable hand-derived probability the way slots.ts's 3-independent-reels math does (see
// that file's MACHINES comments for contrast). This simulates the real production config
// through the real production functions (never a re-implementation, to avoid the harness and
// production silently drifting apart) and asserts the *base* game RTP (excluding the
// jackpot's own pool-funded payout, tracked separately via jackpotContributionRate) lands
// within a tolerance band. It doubles as a regression guard: an accidental edit to
// symbolWeights/paytable/cascadeMultipliers that meaningfully shifts the house edge fails this
// test long before it reaches production.
//
// Uses a fast seeded PRNG (mulberry32), not crypto.randomInt, so a few million spins run in
// well under a second - production always uses the default crypto-backed draw (see
// spinmaniaGrid.ts's drawSymbol), this harness only swaps the RNG, never the game logic.
function mulberry32(seed: number): () => number {
    let a = seed;
    return function () {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

describe("spinmania RTP simulation", () => {
    // Millions of simulated spins per seed take longer than vitest's default 5s test
    // timeout - this is a deliberately slow, thorough regression check, not a unit test.
    it("converges the base-game RTP within tolerance of target, across independent seeds", () => {
        const SPINS = 2_000_000;
        const TOLERANCE = 0.03; // +/- 3 percentage points

        for (const seed of [1, 2, 3]) {
            const random = mulberry32(seed);
            let totalPayout = 0;
            let jackpotHits = 0;
            for (let i = 0; i < SPINS; i++) {
                const result = resolveSpin(SPINMANIA_CONFIG, random);
                if (result.jackpot) {
                    jackpotHits++;
                } else {
                    totalPayout += result.totalPayout;
                }
            }
            const baseRtp = totalPayout / SPINS;
            const blendedRtp = baseRtp + SPINMANIA_CONFIG.jackpotContributionRate;

            expect(blendedRtp).toBeGreaterThan(SPINMANIA_CONFIG.targetRtp - TOLERANCE);
            expect(blendedRtp).toBeLessThan(SPINMANIA_CONFIG.targetRtp + TOLERANCE);
            // Sanity bound so a future edit can't silently turn this into a money-printing
            // machine or a game that never pays - both would still technically satisfy a
            // narrow blendedRtp check if base and jackpot contributions offset each other.
            expect(baseRtp).toBeGreaterThan(0.3);
            expect(baseRtp).toBeLessThan(1.2);

            // Jackpot should stay meaningfully rare (same order of magnitude as the other
            // slot machines' progressive jackpots, see slots.ts's MACHINES comments) - not a
            // strict target, just a guard against a scatter count/weight typo making it common.
            if (jackpotHits > 0) {
                const jackpotOdds = SPINS / jackpotHits;
                expect(jackpotOdds).toBeGreaterThan(5_000);
            }
        }
    }, 120_000);
});
