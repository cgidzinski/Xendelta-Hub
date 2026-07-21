import { describe, it, expect } from "vitest";
import {
    GRID_SIZE,
    CELL_COUNT,
    PICK_COUNT,
    SYMBOL_GROUPS,
    MATCH_MULTIPLIERS,
    generateGrid,
    matchCountForSymbols,
    matchShapeCounts,
    memoryRtp,
} from "./memory";

describe("SYMBOL_GROUPS", () => {
    it("sums to exactly CELL_COUNT (25) with no leftover/locked cell needed", () => {
        expect(GRID_SIZE * GRID_SIZE).toBe(CELL_COUNT);
        const total = SYMBOL_GROUPS.reduce((sum, g) => sum + g.count, 0);
        expect(total).toBe(CELL_COUNT);
    });

    it("has exactly the documented composition - 2 triples, 6 doubles, 7 singles", () => {
        const byCount = new Map<number, number>();
        for (const g of SYMBOL_GROUPS) byCount.set(g.count, (byCount.get(g.count) ?? 0) + 1);
        expect(byCount.get(3)).toBe(2);
        expect(byCount.get(2)).toBe(6);
        expect(byCount.get(1)).toBe(7);
    });
});

describe("generateGrid", () => {
    it("shuffles the fixed deck composition across all 25 positions every round", () => {
        for (let i = 0; i < 200; i++) {
            const grid = generateGrid();
            expect(grid).toHaveLength(CELL_COUNT);
            const counts = new Map<string, number>();
            for (const symbol of grid) counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
            for (const g of SYMBOL_GROUPS) {
                expect(counts.get(g.symbol)).toBe(g.count);
            }
        }
    });
});

describe("matchCountForSymbols", () => {
    it("scores by pattern shape, not raw pair count", () => {
        expect(matchCountForSymbols(["A", "B", "C", "D"])).toBe(0); // all different
        expect(matchCountForSymbols(["A", "A", "B", "C"])).toBe(1); // one pair
        expect(matchCountForSymbols(["A", "A", "B", "B"])).toBe(2); // two separate pairs
        expect(matchCountForSymbols(["A", "A", "A", "B"])).toBe(3); // a full triple
    });
});

describe("matchShapeCounts", () => {
    it("exactly enumerates every C(25,4) = 12650 possible 4-pick", () => {
        const counts = matchShapeCounts();
        const total = Object.values(counts).reduce((sum, c) => sum + c, 0);
        expect(total).toBe(12650);
    });

    // Cross-checked by hand via generating-function combinatorics over the fixed composition
    // (2 groups of 3, 6 groups of 2, 7 groups of 1) - a regression guard against an edit to
    // SYMBOL_GROUPS or the enumeration silently drifting the real odds.
    it("matches the hand-derived exact counts for the documented composition", () => {
        const counts = matchShapeCounts();
        expect(counts[0]).toBe(9762);
        expect(counts[1]).toBe(2784);
        expect(counts[2]).toBe(60);
        expect(counts[3]).toBe(44);
    });

    it("counts are monotonically rarer for a bigger match, matching the payout ladder", () => {
        const counts = matchShapeCounts();
        expect(counts[0]).toBeGreaterThan(counts[1]);
        expect(counts[1]).toBeGreaterThan(counts[2]);
        expect(counts[2]).toBeGreaterThan(counts[3]);
    });
});

describe("memoryRtp", () => {
    it("matches the weighted average of MATCH_MULTIPLIERS against the exact shape probabilities", () => {
        const counts = matchShapeCounts();
        const total = Object.values(counts).reduce((sum, c) => sum + c, 0);
        const expected = Object.entries(counts).reduce((sum, [k, c]) => sum + MATCH_MULTIPLIERS[Number(k)] * (c / total), 0);
        expect(memoryRtp()).toBeCloseTo(expected);
    });

    it("lands in the same ~85-95% RTP band as this app's other games", () => {
        expect(memoryRtp()).toBeGreaterThan(0.85);
        expect(memoryRtp()).toBeLessThan(0.95);
    });
});

// Monte Carlo sanity check that a real generateGrid() + a uniformly random 4-pick converges
// to the exact matchShapeCounts() distribution - a regression guard that generateGrid and
// matchCountForSymbols (the actual functions /start and /reveal call) agree with the
// independently-derived exact combinatorics above, not just that the combinatorics are
// internally consistent with themselves.
describe("simulated random play converges to the exact distribution", () => {
    it("converges match-count frequencies within tolerance of the exact probabilities", () => {
        const ROUNDS = 50_000;
        const TOLERANCE = 0.02;
        const counts = matchShapeCounts();
        const total = Object.values(counts).reduce((sum, c) => sum + c, 0);

        const observed: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
        for (let i = 0; i < ROUNDS; i++) {
            const grid = generateGrid();
            const positions = Array.from({ length: CELL_COUNT }, (_, i) => i);
            const picks: number[] = [];
            for (let p = 0; p < PICK_COUNT; p++) {
                const idx = Math.floor(Math.random() * positions.length);
                picks.push(positions.splice(idx, 1)[0]);
            }
            const symbols = picks.map((pos) => grid[pos]);
            observed[matchCountForSymbols(symbols)]++;
        }

        for (const k of [0, 1, 2, 3]) {
            const expectedProb = counts[k] / total;
            const observedProb = observed[k] / ROUNDS;
            expect(observedProb).toBeGreaterThan(expectedProb - TOLERANCE);
            expect(observedProb).toBeLessThan(expectedProb + TOLERANCE);
        }
    });
});
