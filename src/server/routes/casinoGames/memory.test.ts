import { describe, it, expect } from "vitest";
import {
    GRID_SIZE,
    CELL_COUNT,
    PICK_COUNT,
    MAX_REVEALS,
    SYMBOL_GROUPS,
    MATCH_MULTIPLIERS,
    generateGrid,
    memoryRtp,
} from "./memory";

describe("SYMBOL_GROUPS", () => {
    it("sums to exactly CELL_COUNT (25) — 7 triples + 2 doubles", () => {
        expect(GRID_SIZE * GRID_SIZE).toBe(CELL_COUNT);
        const total = SYMBOL_GROUPS.reduce((sum, g) => sum + g.count, 0);
        expect(total).toBe(CELL_COUNT);
    });

    it("has exactly the documented composition — 7 triples, 2 doubles, no singles", () => {
        const byCount = new Map<number, number>();
        for (const g of SYMBOL_GROUPS) byCount.set(g.count, (byCount.get(g.count) ?? 0) + 1);
        expect(byCount.get(3)).toBe(7);
        expect(byCount.get(2)).toBe(2);
        expect(byCount.get(1) ?? 0).toBe(0);
    });

    it("every symbol has at least one match — no dead singles", () => {
        for (const g of SYMBOL_GROUPS) {
            expect(g.count).toBeGreaterThanOrEqual(2);
        }
    });
});

describe("PICK_COUNT and MAX_REVEALS", () => {
    it("PICK_COUNT is 2 (classic memory: flip 2 at a time)", () => {
        expect(PICK_COUNT).toBe(2);
    });

    it("MAX_REVEALS is 3 (three attempts per round)", () => {
        expect(MAX_REVEALS).toBe(3);
    });
});

describe("generateGrid", () => {
    it("shuffles the deck across all 25 positions every round", () => {
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

describe("MATCH_MULTIPLIERS", () => {
    it("covers all 0–3 matched-pair counts", () => {
        expect(MATCH_MULTIPLIERS[0]).toBeDefined();
        expect(MATCH_MULTIPLIERS[1]).toBeDefined();
        expect(MATCH_MULTIPLIERS[2]).toBeDefined();
        expect(MATCH_MULTIPLIERS[3]).toBeDefined();
    });

    it("0 matches always pays 0", () => {
        expect(MATCH_MULTIPLIERS[0]).toBe(0);
    });

    it("higher match counts pay progressively more", () => {
        expect(MATCH_MULTIPLIERS[1]).toBeGreaterThan(MATCH_MULTIPLIERS[0]);
        expect(MATCH_MULTIPLIERS[2]).toBeGreaterThan(MATCH_MULTIPLIERS[1]);
        expect(MATCH_MULTIPLIERS[3]).toBeGreaterThan(MATCH_MULTIPLIERS[2]);
    });
});

describe("memoryRtp", () => {
    it("lands in the ~85-95% RTP band for random (no-skill) play", () => {
        const rtp = memoryRtp();
        expect(rtp).toBeGreaterThan(0.85);
        expect(rtp).toBeLessThan(0.95);
    });

    it("matches the binomial calculation for the deck composition", () => {
        // 7 triples + 2 doubles: P(match per random 2-card pick) = 46/600
        const p = (21 * 2 + 4 * 1) / (25 * 24);
        const q = 1 - p;
        const binomial = [q ** 3, 3 * q ** 2 * p, 3 * q * p ** 2, p ** 3];
        const expected = Object.entries(MATCH_MULTIPLIERS).reduce((sum, [k, m]) => sum + m * binomial[Number(k)], 0);
        expect(memoryRtp()).toBeCloseTo(expected);
    });
});

// Monte Carlo: simulate 3 random 2-card picks (no skill) and check that the observed
// matched-pair distribution converges to the binomial expectation.
describe("simulated random play (no skill) converges to binomial distribution", () => {
    it("matched-pair frequencies converge within tolerance", () => {
        const ROUNDS = 50_000;
        const TOLERANCE = 0.02;
        const p = (21 * 2 + 4 * 1) / (25 * 24);
        const q = 1 - p;

        const observed: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
        for (let i = 0; i < ROUNDS; i++) {
            const grid = generateGrid();
            const available = Array.from({ length: CELL_COUNT }, (_, i) => i);
            let matchedPairs = 0;

            for (let r = 0; r < MAX_REVEALS; r++) {
                // Pick 2 random positions from remaining available (not yet matched).
                const idx1 = Math.floor(Math.random() * available.length);
                const pos1 = available.splice(idx1, 1)[0];
                const idx2 = Math.floor(Math.random() * available.length);
                const pos2 = available.splice(idx2, 1)[0];

                if (grid[pos1] === grid[pos2]) {
                    matchedPairs++;
                    // Matched cards stay out — already removed by splice above.
                } else {
                    // Non-match — cards go back into the pool (classic memory mechanic).
                    available.push(pos1, pos2);
                }
            }
            observed[Math.min(matchedPairs, 3)]++;
        }

        const binomial = [q ** 3, 3 * q ** 2 * p, 3 * q * p ** 2, p ** 3];
        for (const k of [0, 1, 2, 3]) {
            const observedProb = observed[k] / ROUNDS;
            expect(observedProb).toBeGreaterThan(binomial[k] - TOLERANCE);
            expect(observedProb).toBeLessThan(binomial[k] + TOLERANCE);
        }
    });
});

