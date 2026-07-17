import { describe, it, expect } from "vitest";
import {
    BOUNDARY_RIGHT_ARC,
    BOUNDARY_LEFT_ARC,
    BOUNDARY_RIGHT_POINTS,
    BOUNDARY_LEFT_POINTS,
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    TULIPS,
    tulipCatcherHalfWidth,
    generateNailField,
    RAIL_PATH,
    LAUNCHER_POSITION,
    RELEASE_POINT,
    CHANNEL_INNER_X,
    CHANNEL_OUTER_X,
    launchPowerToRailSpeed,
    MIN_LAUNCH_POWER,
    MAX_LAUNCH_POWER,
    GUTTER_CUTOUT_X_START,
    GUTTER_CUTOUT_X_END,
} from "./pachinkoLayout";

describe("boundary", () => {
    it("closes at the top - right arc starts where the left arc ends", () => {
        const rightStart = BOUNDARY_RIGHT_ARC[0].p0;
        const leftEnd = BOUNDARY_LEFT_ARC[BOUNDARY_LEFT_ARC.length - 1].p1;
        expect(rightStart).toEqual(leftEnd);
    });

    it("leaves a genuine gap at the bottom for the gutter cutout - the two arcs do not meet there", () => {
        const rightEnd = BOUNDARY_RIGHT_ARC[BOUNDARY_RIGHT_ARC.length - 1].p1;
        const leftStart = BOUNDARY_LEFT_ARC[0].p0;
        expect(rightEnd.x).not.toBe(leftStart.x);
        expect(rightEnd.x).toBeCloseTo(GUTTER_CUTOUT_X_END, 0);
        expect(leftStart.x).toBeCloseTo(GUTTER_CUTOUT_X_START, 0);
    });

    it("every sampled boundary point stays within the canvas", () => {
        for (const p of [...BOUNDARY_RIGHT_POINTS, ...BOUNDARY_LEFT_POINTS]) {
            expect(p.x).toBeGreaterThanOrEqual(0);
            expect(p.x).toBeLessThanOrEqual(CANVAS_WIDTH);
            expect(p.y).toBeGreaterThanOrEqual(0);
            expect(p.y).toBeLessThanOrEqual(CANVAS_HEIGHT);
        }
    });

    it("the right arc's middle segment is a straight vertical line - what the rail runs alongside", () => {
        const straightSegment = BOUNDARY_RIGHT_ARC[1];
        expect(straightSegment.p0.x).toBe(straightSegment.c1.x);
        expect(straightSegment.c1.x).toBe(straightSegment.c2.x);
        expect(straightSegment.c2.x).toBe(straightSegment.p1.x);
        expect(straightSegment.p0.x).toBe(CHANNEL_OUTER_X);
    });
});

describe("rail / channel", () => {
    it("runs straight from the launcher (below the field) up to the release point", () => {
        expect(RAIL_PATH).toEqual([LAUNCHER_POSITION, RELEASE_POINT]);
        expect(LAUNCHER_POSITION.y).toBeGreaterThan(RELEASE_POINT.y);
        expect(LAUNCHER_POSITION.x).toBe(RELEASE_POINT.x);
    });

    it("is about one ball-width wide, not several", () => {
        expect(CHANNEL_OUTER_X - CHANNEL_INNER_X).toBeLessThan(10);
    });
});

describe("tulips", () => {
    it("pays every tulip id a strictly wider catcher when open/primed than closed", () => {
        for (const tulip of TULIPS) {
            expect(tulipCatcherHalfWidth(tulip, true)).toBeGreaterThan(tulipCatcherHalfWidth(tulip, false));
        }
    });

    it("has exactly one of each tulip id", () => {
        expect(TULIPS.map((t) => t.id).sort()).toEqual(["center", "left", "right"]);
    });
});

describe("nail field", () => {
    it("is clustered, not a uniform lattice - stays inside the canvas", () => {
        const pins = generateNailField();
        expect(pins.length).toBeGreaterThan(20);
        for (const pin of pins) {
            expect(pin.x).toBeGreaterThan(0);
            expect(pin.x).toBeLessThan(CANVAS_WIDTH);
            expect(pin.y).toBeGreaterThan(0);
            expect(pin.y).toBeLessThan(CANVAS_HEIGHT);
        }
    });

    it("is deterministic - two calls produce the same field", () => {
        expect(generateNailField()).toEqual(generateNailField());
    });
});

describe("launchPowerToRailSpeed", () => {
    it("is monotonically non-decreasing across the valid power range", () => {
        let prev = launchPowerToRailSpeed(MIN_LAUNCH_POWER);
        for (let power = MIN_LAUNCH_POWER + 5; power <= MAX_LAUNCH_POWER; power += 5) {
            const speed = launchPowerToRailSpeed(power);
            expect(speed).toBeGreaterThanOrEqual(prev);
            prev = speed;
        }
    });

    it("is bounded for out-of-range input", () => {
        expect(launchPowerToRailSpeed(-50)).toBe(launchPowerToRailSpeed(MIN_LAUNCH_POWER));
        expect(launchPowerToRailSpeed(500)).toBe(launchPowerToRailSpeed(MAX_LAUNCH_POWER));
    });
});
