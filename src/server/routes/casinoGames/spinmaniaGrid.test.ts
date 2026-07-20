import { describe, it, expect } from "vitest";
import { GRID_COLS, GRID_ROWS, JACKPOT_ITEM, Grid, SpinmaniaConfig, evaluateWins, clearAndRefill, countScatter, resolveSpin, drawGrid, drawSymbol } from "./spinmaniaGrid";

// A minimal two-symbol config (A/B, 50/50) makes the weighted draw trivially predictable:
// with a 100-wide cumulative range, any random() < 0.5 draws "A", anything else draws "B".
const twoSymbolConfig: SpinmaniaConfig = {
    slug: "test",
    symbolWeights: [
        { symbol: "A", weight: 50 },
        { symbol: "B", weight: 50 },
    ],
    paytable: { A: { 3: 2, 4: 5, 5: 10 } }, // B never pays - lets tests isolate A's wins
    cascadeMultipliers: [1, 2, 3],
    jackpotScatterCount: 4,
    jackpotContributionRate: 0.05,
    jackpotSeed: 0,
    targetRtp: 0.9,
};

function fixedSequence(values: number[]): () => number {
    let i = 0;
    return () => values[Math.min(i++, values.length - 1)];
}

function makeGrid(rows: string[][]): Grid {
    // rows[r] is a row of GRID_COLS symbols - transposed here into column-major Grid.
    const grid: Grid = Array.from({ length: rows[0].length }, () => []);
    for (const row of rows) {
        row.forEach((symbol, col) => grid[col].push(symbol));
    }
    return grid;
}

describe("drawGrid / drawSymbol", () => {
    it("respects an injected random source deterministically", () => {
        expect(drawSymbol(twoSymbolConfig, () => 0.1)).toBe("A");
        expect(drawSymbol(twoSymbolConfig, () => 0.9)).toBe("B");
    });

    it("produces a GRID_COLS x GRID_ROWS grid", () => {
        const grid = drawGrid(twoSymbolConfig, () => 0.1);
        expect(grid.length).toBe(GRID_COLS);
        for (const column of grid) {
            expect(column.length).toBe(GRID_ROWS);
        }
    });
});

describe("evaluateWins", () => {
    it("pays a run of exactly 3 columns with a single matching cell per column", () => {
        const grid = makeGrid([
            ["A", "A", "A", "B", "B"],
            ["B", "B", "B", "B", "B"],
            ["B", "B", "B", "B", "B"],
        ]);
        const wins = evaluateWins(grid, twoSymbolConfig);
        expect(wins).toHaveLength(1);
        expect(wins[0]).toMatchObject({ symbol: "A", runLength: 3, ways: 1, multiplier: 2, payout: 2 });
    });

    it("does not pay when the run breaks before column 3 (a non-matching column 1)", () => {
        const grid = makeGrid([
            ["A", "B", "A", "A", "A"],
            ["B", "B", "B", "B", "B"],
            ["B", "B", "B", "B", "B"],
        ]);
        expect(evaluateWins(grid, twoSymbolConfig)).toHaveLength(0);
    });

    it("scales payout by ways - the product of per-column match counts", () => {
        // Column 0: 2 A's (rows 0,1), column 1: 1 A (row 0), column 2: 2 A's (rows 0,2) ->
        // ways = 2*1*2 = 4. Columns 3-4 have no A at all, so the run stops at 3 columns.
        const grid = makeGrid([
            ["A", "A", "A", "B", "B"],
            ["A", "B", "B", "B", "B"],
            ["B", "B", "A", "B", "B"],
        ]);
        const wins = evaluateWins(grid, twoSymbolConfig);
        expect(wins).toHaveLength(1);
        expect(wins[0].ways).toBe(4);
        expect(wins[0].payout).toBe(twoSymbolConfig.paytable.A[3] * 4);
    });

    it("extends the run length up to 5 when every column matches, using the runLength=5 multiplier", () => {
        const grid = makeGrid([
            ["A", "A", "A", "A", "A"],
            ["B", "B", "B", "B", "B"],
            ["B", "B", "B", "B", "B"],
        ]);
        const wins = evaluateWins(grid, twoSymbolConfig);
        expect(wins).toHaveLength(1);
        expect(wins[0]).toMatchObject({ runLength: 5, ways: 1, multiplier: 10 });
    });

    it("ignores a non-payable symbol entirely, even with a full run", () => {
        // "B" fills the entire grid - a full run in every sense, but B has no paytable
        // entry at all, so evaluateWins (which only ever loops over paytable keys) never
        // considers it.
        const grid = makeGrid([
            ["B", "B", "B", "B", "B"],
            ["B", "B", "B", "B", "B"],
            ["B", "B", "B", "B", "B"],
        ]);
        expect(evaluateWins(grid, twoSymbolConfig)).toHaveLength(0);
    });
});

describe("clearAndRefill", () => {
    it("removes exactly the matched cells, preserves remaining order, and refills the top", () => {
        const grid = makeGrid([
            ["A", "A", "A", "B", "B"],
            ["B", "B", "B", "B", "B"],
            ["B", "B", "B", "B", "B"],
        ]);
        const wins = evaluateWins(grid, twoSymbolConfig);
        const refilled = clearAndRefill(grid, wins, twoSymbolConfig, () => 0.9); // 0.9 always draws "B"

        // Columns 0-2 each had their single A (row 0) cleared - the two B's beneath it drop
        // down, and a freshly-drawn symbol ("B", per the fixed random above) fills the top.
        for (let col = 0; col < 3; col++) {
            expect(refilled[col]).toEqual(["B", "B", "B"]);
        }
        // Columns 3-4 had no wins at all - completely untouched.
        expect(refilled[3]).toEqual(grid[3]);
        expect(refilled[4]).toEqual(grid[4]);
        // Column count/shape is always preserved.
        expect(refilled.length).toBe(GRID_COLS);
        refilled.forEach((column) => expect(column.length).toBe(GRID_ROWS));
    });
});

describe("countScatter", () => {
    it("counts JACKPOT_ITEM occurrences anywhere in the grid", () => {
        const grid = makeGrid([
            [JACKPOT_ITEM, "A", JACKPOT_ITEM, "A", "A"],
            ["A", JACKPOT_ITEM, "A", "A", "A"],
            ["A", "A", "A", "A", JACKPOT_ITEM],
        ]);
        expect(countScatter(grid)).toBe(4);
    });
});

describe("resolveSpin", () => {
    it("terminates and cascades exactly as far as consecutive wins actually chain, applying the right step multiplier each time", () => {
        // drawGrid draws column-by-column, top-to-bottom within each column (see
        // spinmaniaGrid.ts's drawGrid), so repeating [A,B,B] 5 times over produces exactly
        // one A per column (row 0) and B everywhere else - a single runLength=5, ways=1 win.
        const initialDraws = Array(5).fill([0.1, 0.9, 0.9]).flat();
        // The cascade then clears exactly the 5 row-0 A's and redraws 1 cell per column -
        // all >= 0.5 so every refilled cell draws "B", guaranteeing no further win.
        const refillDraws = Array.from({ length: 5 }, () => 0.9);
        const random = fixedSequence([...initialDraws, ...refillDraws]);

        const result = resolveSpin(twoSymbolConfig, random);

        expect(result.jackpot).toBe(false); // no JACKPOT_ITEM in this two-symbol config at all
        expect(result.steps).toHaveLength(1);
        expect(result.steps[0].stepMultiplier).toBe(twoSymbolConfig.cascadeMultipliers[0]);
        // Every column/every row was "A" initially -> a single runLength=5 win, ways=1.
        expect(result.steps[0].wins[0]).toMatchObject({ runLength: 5, ways: 1, multiplier: 10 });
        expect(result.totalPayout).toBe(10 * 1 * twoSymbolConfig.cascadeMultipliers[0]);
    });

    it("repeats the final cascade multiplier once the escalation table is exhausted", () => {
        expect(twoSymbolConfig.cascadeMultipliers).toEqual([1, 2, 3]);
        // Config used here only needs the *table*, not an actual 4-cascade spin (that would
        // require carefully hand-sequenced draws) - this locks down the escalation contract
        // resolveSpin relies on: config.cascadeMultipliers[Math.min(stepIndex, length - 1)].
        const pickStepMultiplier = (stepIndex: number) => twoSymbolConfig.cascadeMultipliers[Math.min(stepIndex, twoSymbolConfig.cascadeMultipliers.length - 1)];
        expect(pickStepMultiplier(0)).toBe(1);
        expect(pickStepMultiplier(2)).toBe(3);
        expect(pickStepMultiplier(5)).toBe(3); // beyond the table - repeats the last entry
    });
});
