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

    it("has one more peg per row, ROWS rows total (12+11+...+1 = 78 pegs)", () => {
        expect(pegs.length).toBe((ROWS * (ROWS + 1)) / 2);
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

    it("row 0 has exactly one peg, dead center", () => {
        const row0 = pegs.filter((p) => p.y === BOARD_TOP);
        expect(row0.length).toBe(1);
        expect(row0[0].x).toBeCloseTo(CANVAS_WIDTH / 2);
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

    it("pays the least at the crowded center and the most at the rare edges", () => {
        const center = Math.floor(ROWS / 2);
        expect(MULTIPLIERS[0]).toBeGreaterThan(MULTIPLIERS[center]);
        expect(MULTIPLIERS[SLOT_COUNT - 1]).toBeGreaterThan(MULTIPLIERS[center]);
    });
});
