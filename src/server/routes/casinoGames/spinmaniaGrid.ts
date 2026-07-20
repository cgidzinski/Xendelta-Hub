/**
 * Pure SpinMania grid/cascade logic - no Express/Mongo, mirrors the pure-logic/route split
 * already used by Pachinko (pachinkoLayout.ts) and Plinko (plinkoLayout.ts). Deliberately not
 * shared with slots.ts's 3-reel engine: this is a 5x3 all-ways-pay grid with cascading
 * (tumbling) wins, a genuinely different shape of game, not a config variant of Easy Spin.
 *
 * A column is "live" for a symbol as long as every column so far (starting at column 0) has
 * at least one cell with that symbol - a run of 3+ live columns pays, scaled by "ways"
 * (the product of how many matching cells sit in each of those columns), same convention as
 * standard all-ways-pay slots. `JACKPOT_ITEM` is scatter-only: it never appears in the
 * paytable and never blocks/extends another symbol's run - N-or-more anywhere on the
 * *initial* grid (before any cascade) triggers the jackpot instead.
 *
 * One spin resolves every cascade step up front, synchronously, before anything is persisted -
 * each step is a pure function of the previous grid plus new weighted draws for the emptied
 * cells, so there's no player action mid-cascade and thus no reason to split it into separate
 * rounds (contrast Pachinko, where a "round" spans real player-triggered steps).
 */

export const GRID_COLS = 5;
export const GRID_ROWS = 3;

export type SlotSymbol = string;

// Scatter-only - see file header. Never appears as a key in `paytable`.
export const JACKPOT_ITEM = "JACKPOT_ITEM";

// Column-major: grid[col][row], row 0 = top.
export type Grid = SlotSymbol[][];

export interface SpinmaniaConfig {
    slug: string;
    symbolWeights: { symbol: SlotSymbol; weight: number }[];
    // symbol -> runLength (3/4/5) -> multiplier-per-way, applied before that step's cascade multiplier.
    paytable: Record<string, Record<number, number>>;
    // cascadeMultipliers[i] applies to the (i+1)-th consecutive win within one spin; the last
    // entry repeats for any further cascade beyond the table's length.
    cascadeMultipliers: number[];
    // N-or-more JACKPOT_ITEM symbols anywhere on the initial (pre-cascade) grid triggers the jackpot.
    jackpotScatterCount: number;
    jackpotContributionRate: number;
    jackpotSeed: number;
    targetRtp: number;
}

export interface Win {
    symbol: SlotSymbol;
    runLength: number;
    ways: number;
    multiplier: number; // paytable value, before ways/cascade scaling
    payout: number; // multiplier * ways, per unit wager, before the cascade-step multiplier
    cells: { col: number; row: number }[]; // every matched cell, for clearing + frontend highlight
}

export interface CascadeStep {
    grid: Grid; // the grid state these wins were evaluated against (before clearing)
    wins: Win[];
    stepMultiplier: number;
    stepPayout: number; // sum(win.payout) * stepMultiplier, per unit wager
}

export interface SpinResult {
    initialGrid: Grid;
    steps: CascadeStep[];
    finalGrid: Grid; // the resting grid once cascades stop - what the frontend renders after the last step's clear/refill
    totalPayout: number; // per unit wager - caller multiplies by the actual wager
    jackpot: boolean;
}

// A cascade that never terminates would only ever happen from a misconfigured paytable/weight
// table (e.g. every cell scoring on every step) - this is a defensive cap, not expected to bind
// against any real configuration.
const MAX_CASCADE_STEPS = 20;

function totalWeight(config: SpinmaniaConfig): number {
    return config.symbolWeights.reduce((sum, s) => sum + s.weight, 0);
}

export function weightOf(config: SpinmaniaConfig, symbol: SlotSymbol): number {
    return config.symbolWeights.find((s) => s.symbol === symbol)?.weight ?? 0;
}

// Same weighted-draw approach as slots.ts's drawSymbol, duplicated rather than imported -
// this file is deliberately standalone (see file header), and the algorithm is a handful of
// lines. `random` is injectable so the RTP simulation (spinmaniaGrid.rtp.test.ts) can run
// against a fast PRNG instead of crypto.randomInt across millions of draws; production always
// uses the default crypto-backed one.
export function drawSymbol(config: SpinmaniaConfig, random: () => number = cryptoRandom): SlotSymbol {
    const total = totalWeight(config);
    const roll = Math.floor(random() * total);
    let cumulative = 0;
    for (const { symbol, weight } of config.symbolWeights) {
        cumulative += weight;
        if (roll < cumulative) {
            return symbol;
        }
    }
    return config.symbolWeights[config.symbolWeights.length - 1].symbol;
}

function cryptoRandom(): number {
    const crypto = require("crypto");
    // [0,1) from a uniform 32-bit draw - matches crypto.randomInt's fairness without needing a
    // dynamic upper bound threaded through here.
    return crypto.randomInt(0, 0x100000000) / 0x100000000;
}

export function drawGrid(config: SpinmaniaConfig, random?: () => number): Grid {
    return Array.from({ length: GRID_COLS }, () => Array.from({ length: GRID_ROWS }, () => drawSymbol(config, random)));
}

export function countScatter(grid: Grid): number {
    return grid.reduce((sum, column) => sum + column.filter((s) => s === JACKPOT_ITEM).length, 0);
}

// All-ways-pay evaluation: for each payable symbol, the run of consecutive columns starting
// at column 0 that each contain at least one matching cell. A run >=3 columns pays, scaled by
// "ways" (product of per-column match counts) - e.g. 2 matches in column 0, 1 in column 1, 3 in
// column 2 is 2*1*3=6 ways at that run length.
export function evaluateWins(grid: Grid, config: SpinmaniaConfig): Win[] {
    const wins: Win[] = [];
    for (const symbol of Object.keys(config.paytable)) {
        const cellsPerColumn: { col: number; row: number }[][] = [];
        for (let col = 0; col < GRID_COLS; col++) {
            const matches: { col: number; row: number }[] = [];
            for (let row = 0; row < GRID_ROWS; row++) {
                if (grid[col][row] === symbol) {
                    matches.push({ col, row });
                }
            }
            if (matches.length === 0) {
                break;
            }
            cellsPerColumn.push(matches);
        }
        const runLength = cellsPerColumn.length;
        if (runLength < 3) {
            continue;
        }
        const multiplier = config.paytable[symbol][runLength] ?? 0;
        if (multiplier <= 0) {
            continue;
        }
        const ways = cellsPerColumn.reduce((product, column) => product * column.length, 1);
        wins.push({
            symbol,
            runLength,
            ways,
            multiplier,
            payout: multiplier * ways,
            cells: cellsPerColumn.flat(),
        });
    }
    return wins;
}

// Clears every matched cell, drops the remaining cells in each column down to the bottom (their
// relative order preserved), and fills the vacated top with freshly drawn symbols - the
// standard "tumble" refill.
export function clearAndRefill(grid: Grid, wins: Win[], config: SpinmaniaConfig, random?: () => number): Grid {
    const clearedRowsByColumn: Set<number>[] = Array.from({ length: GRID_COLS }, () => new Set());
    for (const win of wins) {
        for (const { col, row } of win.cells) {
            clearedRowsByColumn[col].add(row);
        }
    }
    return grid.map((column, col) => {
        const remaining = column.filter((_, row) => !clearedRowsByColumn[col].has(row));
        const drawnCount = GRID_ROWS - remaining.length;
        const drawn = Array.from({ length: drawnCount }, () => drawSymbol(config, random));
        return [...drawn, ...remaining];
    });
}

// Resolves an entire spin - initial draw, jackpot scatter check, and the full cascade chain -
// synchronously and deterministically from the given RNG. `random` defaults to a
// crypto-backed [0,1) source; the RTP simulation injects a fast PRNG instead.
export function resolveSpin(config: SpinmaniaConfig, random?: () => number): SpinResult {
    const initialGrid = drawGrid(config, random);
    const jackpot = countScatter(initialGrid) >= config.jackpotScatterCount;

    let grid = initialGrid;
    const steps: CascadeStep[] = [];
    let totalPayout = 0;

    for (let stepIndex = 0; stepIndex < MAX_CASCADE_STEPS; stepIndex++) {
        const wins = evaluateWins(grid, config);
        if (wins.length === 0) {
            break;
        }
        const stepMultiplier = config.cascadeMultipliers[Math.min(stepIndex, config.cascadeMultipliers.length - 1)];
        const stepPayout = wins.reduce((sum, win) => sum + win.payout, 0) * stepMultiplier;
        totalPayout += stepPayout;
        steps.push({ grid, wins, stepMultiplier, stepPayout });
        grid = clearAndRefill(grid, wins, config, random);
    }

    return { initialGrid, steps, finalGrid: grid, jackpot, totalPayout };
}
