import { describe, it, expect } from "vitest";
import {
    CANVAS_WIDTH,
    ROWS,
    SLOT_COUNT,
    BOARD_TOP,
    BOARD_BOTTOM,
    DROP_MIN_X,
    DROP_MAX_X,
    MULTIPLIERS,
    xFor,
    generatePegPositions,
    slotCenterX,
    slotBoundaries,
    slotForX,
} from "./plinkoLayout";

describe("generatePegPositions", () => {
    const pegs = generatePegPositions();

    it("alternates SLOT_COUNT/ROWS pegs per row across all ROWS rows (a rectangular grid, not a triangle)", () => {
        const evenRows = Math.ceil(ROWS / 2);
        const oddRows = Math.floor(ROWS / 2);
        expect(pegs.length).toBe(evenRows * SLOT_COUNT + oddRows * ROWS);
    });

    it("stays within the canvas and the board's vertical span", () => {
        for (const peg of pegs) {
            expect(peg.x).toBeGreaterThan(0);
            expect(peg.x).toBeLessThan(CANVAS_WIDTH);
            expect(peg.y).toBeGreaterThanOrEqual(BOARD_TOP);
            expect(peg.y).toBeLessThan(BOARD_BOTTOM);
        }
    });

    it("is deterministic (no randomness in the field itself)", () => {
        expect(generatePegPositions()).toEqual(pegs);
    });

    it("row 0 is inset, not full - no peg sits directly under DROP_MIN_X/DROP_MAX_X at the very top", () => {
        const row0 = pegs.filter((p) => p.y === BOARD_TOP);
        expect(row0.length).toBe(ROWS);
        expect(Math.min(...row0.map((p) => p.x))).toBeGreaterThan(DROP_MIN_X);
        expect(Math.max(...row0.map((p) => p.x))).toBeLessThan(DROP_MAX_X);
    });

    it("row 1 is the first full row and spans the whole drop range, including its outer columns landing on it", () => {
        const rowYs = [...new Set(pegs.map((p) => p.y))].sort((a, b) => a - b);
        const row1 = pegs.filter((p) => p.y === rowYs[1]);
        expect(row1.length).toBe(SLOT_COUNT);
        expect(Math.min(...row1.map((p) => p.x))).toBeCloseTo(DROP_MIN_X);
        expect(Math.max(...row1.map((p) => p.x))).toBeCloseTo(DROP_MAX_X);
    });
});

describe("slot geometry", () => {
    it("slotBoundaries has SLOT_COUNT+1 strictly increasing entries", () => {
        const boundaries = slotBoundaries();
        expect(boundaries.length).toBe(SLOT_COUNT + 1);
        for (let i = 1; i < boundaries.length; i++) {
            expect(boundaries[i]).toBeGreaterThan(boundaries[i - 1]);
        }
    });

    it("slotForX picks the slot whose boundaries actually contain the point", () => {
        const boundaries = slotBoundaries();
        for (let slot = 0; slot < SLOT_COUNT; slot++) {
            const midpoint = (boundaries[slot] + boundaries[slot + 1]) / 2;
            expect(slotForX(midpoint)).toBe(slot);
        }
    });

    it("slotForX clamps out-of-range x to the nearest edge slot", () => {
        expect(slotForX(-1000)).toBe(0);
        expect(slotForX(1000)).toBe(SLOT_COUNT - 1);
    });

    it("slot centers are evenly spaced and symmetric around the board center", () => {
        const spacing = slotCenterX(1) - slotCenterX(0);
        for (let slot = 1; slot < SLOT_COUNT; slot++) {
            expect(slotCenterX(slot) - slotCenterX(slot - 1)).toBeCloseTo(spacing);
        }
        expect(slotCenterX(0) + slotCenterX(SLOT_COUNT - 1)).toBeCloseTo(CANVAS_WIDTH);
    });
});

describe("xFor", () => {
    it("is monotonic in rights for a fixed bounces", () => {
        for (let r = 1; r <= ROWS; r++) {
            expect(xFor(r, ROWS)).toBeGreaterThan(xFor(r - 1, ROWS));
        }
    });
});

describe("drop range", () => {
    it("DROP_MIN_X < DROP_MAX_X, both within the canvas", () => {
        expect(DROP_MIN_X).toBeLessThan(DROP_MAX_X);
        expect(DROP_MIN_X).toBeGreaterThan(0);
        expect(DROP_MAX_X).toBeLessThan(CANVAS_WIDTH);
    });

    it("spans a real range, not a single point", () => {
        expect(DROP_MAX_X - DROP_MIN_X).toBeGreaterThan(CANVAS_WIDTH / 2);
    });
});

describe("MULTIPLIERS", () => {
    it("has SLOT_COUNT entries, symmetric around the center", () => {
        expect(MULTIPLIERS.length).toBe(SLOT_COUNT);
        for (let slot = 0; slot < SLOT_COUNT; slot++) {
            expect(MULTIPLIERS[slot]).toBeCloseTo(MULTIPLIERS[SLOT_COUNT - 1 - slot]);
        }
    });

    it("pays nothing at the two extreme edge slots", () => {
        expect(MULTIPLIERS[0]).toBe(0);
        expect(MULTIPLIERS[SLOT_COUNT - 1]).toBe(0);
    });

    it("pays more just inside the dead edges than at the crowded center", () => {
        const center = Math.floor(ROWS / 2);
        expect(MULTIPLIERS[1]).toBeGreaterThan(MULTIPLIERS[center]);
        expect(MULTIPLIERS[SLOT_COUNT - 2]).toBeGreaterThan(MULTIPLIERS[center]);
    });
});
