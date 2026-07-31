import { describe, it, expect } from "vitest";
import { spinReel, reelMatchTier, reelRngForSeed } from "./pachinkoReels";
import { ATTACKER_OPEN_MS, REEL_TWO_MATCH_BALLS, REEL_THREE_MATCH_BALLS } from "./pachinkoRules";
import { mulberry32 } from "./prng";

describe("reelMatchTier", () => {
    it("classifies three, two and none", () => {
        expect(reelMatchTier(["ITEM_A", "ITEM_A", "ITEM_A"])).toBe("three");
        expect(reelMatchTier(["ITEM_A", "ITEM_A", "ITEM_B"])).toBe("two");
        expect(reelMatchTier(["ITEM_A", "ITEM_B", "ITEM_A"])).toBe("two"); // outer pair counts
        expect(reelMatchTier(["ITEM_A", "ITEM_B", "ITEM_C"])).toBe("none");
    });
});

describe("spinReel", () => {
    // This is the property that let the reel move out of the server: the client can derive a
    // chucker's result - and therefore whether the attacker just opened - the instant the shot
    // resolves, instead of being blind to it until a batch response came back. That blindness was
    // what made every ball fired in the gap simulate against a board the server disagreed with.
    it("the same seed always produces the same spin", () => {
        for (const seed of [0, 1, 12345, 0xffffffff]) {
            const runs = [0, 1, 2].map(() => spinReel(reelRngForSeed(seed)));
            expect(runs[1]).toEqual(runs[0]);
            expect(runs[2]).toEqual(runs[0]);
        }
    });

    it("different seeds produce different spins", () => {
        const distinct = new Set(Array.from({ length: 50 }, (_, i) => JSON.stringify(spinReel(reelRngForSeed(i)).symbols)));
        expect(distinct.size).toBeGreaterThan(1);
    });

    it("handles the full 32-bit unsigned seed range without a degenerate stream", () => {
        // reelRngForSeed XORs before seeding, so confirm the extremes still behave.
        for (const seed of [0, 0xffffffff]) {
            const { symbols } = spinReel(reelRngForSeed(seed));
            expect(symbols).toHaveLength(3);
            for (const s of symbols) {
                expect(typeof s).toBe("string");
                expect(s.length).toBeGreaterThan(0);
            }
        }
    });

    it("pays and opens the attacker strictly by match tier - only a three-of-a-kind opens it", () => {
        // Sample enough seeds to see every tier, and check the payout/window invariants on each.
        let sawThree = false;
        let sawTwo = false;
        let sawNone = false;
        for (let seed = 0; seed < 500; seed++) {
            const spin = spinReel(reelRngForSeed(seed));
            expect(spin.matchTier).toBe(reelMatchTier(spin.symbols));
            if (spin.matchTier === "three") {
                sawThree = true;
                expect(spin.ballsAwarded).toBe(REEL_THREE_MATCH_BALLS);
                expect(spin.attackerOpenMs).toBe(ATTACKER_OPEN_MS);
            } else if (spin.matchTier === "two") {
                sawTwo = true;
                expect(spin.ballsAwarded).toBe(REEL_TWO_MATCH_BALLS);
                expect(spin.attackerOpenMs).toBe(0);
            } else {
                sawNone = true;
                expect(spin.ballsAwarded).toBe(0);
                expect(spin.attackerOpenMs).toBe(0);
            }
        }
        expect(sawThree && sawTwo && sawNone).toBe(true);
    });

    it("respects the weighted symbol distribution - ITEM_A (weight 40) shows up far more than JACKPOT_ITEM (weight 4)", () => {
        const counts: Record<string, number> = {};
        const rng = mulberry32(99);
        for (let i = 0; i < 20000; i++) {
            for (const symbol of spinReel(rng).symbols) {
                counts[symbol] = (counts[symbol] ?? 0) + 1;
            }
        }
        expect(counts.ITEM_A).toBeGreaterThan(counts.ITEM_B);
        expect(counts.ITEM_B).toBeGreaterThan(counts.ITEM_C);
        expect(counts.ITEM_C).toBeGreaterThan(counts.ITEM_D);
        expect(counts.ITEM_D).toBeGreaterThan(counts.JACKPOT_ITEM);
        // Weight 40 of 100 -> ~40% of all draws; allow a generous band for sampling noise.
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        expect(counts.ITEM_A / total).toBeGreaterThan(0.35);
        expect(counts.ITEM_A / total).toBeLessThan(0.45);
    });
});
