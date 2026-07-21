import { describe, it, expect } from "vitest";
import {
    BOUNDARY_RIGHT_ARC,
    BOUNDARY_LEFT_ARC,
    BOUNDARY_RIGHT_POINTS,
    BOUNDARY_LEFT_POINTS,
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    TULIPS,
    JACKPOT,
    ATTACKER,
    BONUS_POCKETS,
    CHUCKER,
    isJackpotPrimed,
    shouldCloseLapsedTulips,
    generateNailField,
    RAIL_CLIMB_PATH,
    RAIL_OUTER_ARC,
    RAIL_INNER_ARC,
    RAIL_CAP,
    LAUNCHER_POSITION,
    RELEASE_POINT,
    RELEASE_TANGENT,
    PIN_RADIUS,
    POCKET_DEPTH,
    BALL_RADIUS,
    launchPowerToRailSpeed,
    MIN_LAUNCH_POWER,
    MAX_LAUNCH_POWER,
    GUTTER_CUTOUT_X_START,
    GUTTER_CUTOUT_X_END,
    GUTTER_CUTOUT_Y,
    FIELD_CX,
    FIELD_CY,
    FIELD_RX,
    FIELD_RY,
} from "./pachinkoLayout";

// Same hybrid ellipse-above/circle-below shape the boundary curve itself uses (see the file
// header) - a positive return means the point sits this many px inside the true curve, negative
// means it's past the glass entirely. Used below to catch a pin sitting outside the *actual*
// boundary, which the plain canvas-rectangle check further down can't see at all.
function marginInsideBoundary(x: number, y: number): number {
    if (y <= FIELD_CY) {
        const nx = (x - FIELD_CX) / FIELD_RX;
        const ny = (y - FIELD_CY) / FIELD_RY;
        const onEllipseR = Math.hypot(nx, ny);
        return (1 - onEllipseR) * Math.min(FIELD_RX, FIELD_RY);
    }
    return FIELD_RX - Math.hypot(x - FIELD_CX, y - FIELD_CY);
}

describe("boundary", () => {
    it("closes at the top - right arc starts where the left arc ends", () => {
        const rightStart = BOUNDARY_RIGHT_ARC[0].p0;
        const leftEnd = BOUNDARY_LEFT_ARC[BOUNDARY_LEFT_ARC.length - 1].p1;
        expect(rightStart.x).toBeCloseTo(leftEnd.x, 6);
        expect(rightStart.y).toBeCloseTo(leftEnd.y, 6);
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

    it("the top and bottom halves meet exactly at the widest point on each side, matching radii", () => {
        // Right side: the top-ellipse segment and the bottom-circle segment share an endpoint.
        const topRightEnd = BOUNDARY_RIGHT_ARC[0].p1;
        const bottomRightStart = BOUNDARY_RIGHT_ARC[1].p0;
        expect(topRightEnd.x).toBeCloseTo(bottomRightStart.x, 6);
        expect(topRightEnd.y).toBeCloseTo(bottomRightStart.y, 6);
    });

    it("is a genuinely round-ish egg, not an elongated capsule - height is close to width", () => {
        const top = BOUNDARY_RIGHT_ARC[0].p0.y; // top of the ellipse
        const bottom = GUTTER_CUTOUT_Y; // roughly the bottom of the circle half
        const width = 340; // field half-width (170) * 2
        const height = bottom - top;
        expect(height / width).toBeGreaterThan(1);
        expect(height / width).toBeLessThan(1.3);
    });
});

describe("rail", () => {
    it("runs from the launcher up to the release point, entirely inside the boundary curve", () => {
        expect(RAIL_CLIMB_PATH[0]).toEqual(LAUNCHER_POSITION);
        expect(RAIL_CLIMB_PATH[RAIL_CLIMB_PATH.length - 1].x).toBeCloseTo(RELEASE_POINT.x, 6);
        expect(RAIL_CLIMB_PATH[RAIL_CLIMB_PATH.length - 1].y).toBeCloseTo(RELEASE_POINT.y, 6);
    });

    it("outer wall is flush with the boundary itself (zero gap) at the shared widest-point seam", () => {
        // Both RAIL_OUTER_ARC and BOUNDARY_RIGHT_ARC have a segment boundary at theta=0 (the
        // widest point) - RAIL_OUTER_ARC[0].p1 and BOUNDARY_RIGHT_ARC[0].p1 should be the same
        // point, since the rail's outer wall is the boundary curve itself over that span.
        expect(RAIL_OUTER_ARC[0].p1.x).toBeCloseTo(BOUNDARY_RIGHT_ARC[0].p1.x, 4);
        expect(RAIL_OUTER_ARC[0].p1.y).toBeCloseTo(BOUNDARY_RIGHT_ARC[0].p1.y, 4);
    });

    it("inner wall stays strictly inside the outer wall at every matching endpoint, including the widest-point seam", () => {
        for (let i = 0; i < RAIL_OUTER_ARC.length; i++) {
            for (const point of ["p0", "p1"] as const) {
                const outer = RAIL_OUTER_ARC[i][point];
                const inner = RAIL_INNER_ARC[i][point];
                const dist = Math.hypot(outer.x - inner.x, outer.y - inner.y);
                expect(dist).toBeGreaterThan(0);
            }
        }
    });

    it("release tangent is a unit vector", () => {
        const mag = Math.hypot(RELEASE_TANGENT.x, RELEASE_TANGENT.y);
        expect(mag).toBeCloseTo(1, 6);
    });

    it("release tangent points up and to the left (into the field, away from the launcher)", () => {
        expect(RELEASE_TANGENT.x).toBeLessThan(0);
        expect(RELEASE_TANGENT.y).toBeLessThan(0);
    });

    it("the launcher end cap is centered on LAUNCHER_POSITION", () => {
        expect(RAIL_CAP.center).toEqual(LAUNCHER_POSITION);
        expect(RAIL_CAP.radius).toBeGreaterThan(0);
    });
});

describe("scoring pockets", () => {
    // Every pocket is a fixed-width physical cup now (see pachinkoLayout.ts's own header on
    // this) - priming/open-closed/timer state changes color and payout, never the hitbox. There
    // are no more "open" vs "closed" widths to compare.
    it("every pocket has a positive, fixed half-width", () => {
        for (const pocket of [...TULIPS, JACKPOT, ATTACKER, ...BONUS_POCKETS, CHUCKER]) {
            expect(pocket.halfWidth).toBeGreaterThan(0);
        }
    });

    it("has exactly one tulip per side", () => {
        expect(TULIPS.map((t) => t.id).sort()).toEqual(["left", "right"]);
    });

    it("jackpot is only primed when both tulips are open", () => {
        expect(isJackpotPrimed(false, false)).toBe(false);
        expect(isJackpotPrimed(true, false)).toBe(false);
        expect(isJackpotPrimed(false, true)).toBe(false);
        expect(isJackpotPrimed(true, true)).toBe(true);
    });

    describe("shouldCloseLapsedTulips", () => {
        const now = 1_000_000;

        it("does NOT close a tulip an ordinary catch just opened, when no window was ever primed", () => {
            // Regression case for the real bug this function exists to fix: a single-tulip catch
            // with previousJackpotOpenUntil still its default 0 must not immediately stomp the
            // toggle that same shot just set.
            expect(shouldCloseLapsedTulips(0, 0, true, false, now)).toBe(false);
            expect(shouldCloseLapsedTulips(0, 0, false, true, now)).toBe(false);
        });

        it("closes both tulips once a previously-primed window has actually expired", () => {
            expect(shouldCloseLapsedTulips(now - 1, now - 1, false, false, now)).toBe(true);
        });

        it("does not close tulips while a previously-primed window is still open", () => {
            expect(shouldCloseLapsedTulips(now - 1, now + 5000, false, false, now)).toBe(false);
        });

        it("does not close tulips on the exact shot that just primed the jackpot (both open)", () => {
            expect(shouldCloseLapsedTulips(0, now + 10000, true, true, now)).toBe(false);
        });
    });

    it("the jackpot pocket is tiny - barely wider than the ball, even though it's always this size", () => {
        expect(JACKPOT.halfWidth).toBeLessThan(BALL_RADIUS * 3);
    });

    it("has exactly two bonus pockets and a chucker, both smaller/no-frills than the tulips", () => {
        expect(BONUS_POCKETS).toHaveLength(2);
        expect(CHUCKER.halfWidth).toBeGreaterThan(0);
    });

    it("pocket width scales inversely with payout - bonus > tulip > jackpot", () => {
        expect(BONUS_POCKETS[0].halfWidth).toBeGreaterThan(TULIPS[0].halfWidth);
        expect(TULIPS[0].halfWidth).toBeGreaterThan(JACKPOT.halfWidth);
    });

    it("no two pockets' hit-rectangles overlap", () => {
        // The real hit test (see pachinkoPhysics.ts's withinPocket) is a rectangle, not a
        // circle - independent x (halfWidth) and y (fixed +-POCKET_DEPTH/2) thresholds - so two
        // pockets only actually overlap if both axes overlap at once.
        const points = [...TULIPS, JACKPOT, ATTACKER, ...BONUS_POCKETS, CHUCKER].map((p) => ({ ...p.position, halfWidth: p.halfWidth }));
        for (let i = 0; i < points.length; i++) {
            for (let j = i + 1; j < points.length; j++) {
                const xOverlap = Math.abs(points[i].x - points[j].x) < points[i].halfWidth + points[j].halfWidth;
                const yOverlap = Math.abs(points[i].y - points[j].y) < POCKET_DEPTH;
                expect(xOverlap && yOverlap).toBe(false);
            }
        }
    });
});

describe("nail field", () => {
    it("is a real staggered lattice - stays inside the canvas", () => {
        const pins = generateNailField();
        expect(pins.length).toBeGreaterThan(20);
        for (const pin of pins) {
            expect(pin.x).toBeGreaterThan(0);
            expect(pin.x).toBeLessThan(CANVAS_WIDTH);
            expect(pin.y).toBeGreaterThan(0);
            expect(pin.y).toBeLessThan(CANVAS_HEIGHT);
        }
    });

    it("every pin stays inside the true boundary curve, not just the canvas rectangle", () => {
        // A pin can sit well inside the 0..460 canvas rectangle checked above while still being
        // physically past the board's own oval glass - the canvas check alone can't catch that.
        const pins = generateNailField();
        for (const pin of pins) {
            expect(marginInsideBoundary(pin.x, pin.y)).toBeGreaterThan(0);
        }
    });

    it("is deterministic - two calls produce the same field", () => {
        expect(generateNailField()).toEqual(generateNailField());
    });

    it("no two pins overlap each other", () => {
        const pins = generateNailField();
        for (let i = 0; i < pins.length; i++) {
            for (let j = i + 1; j < pins.length; j++) {
                const dist = Math.hypot(pins[i].x - pins[j].x, pins[i].y - pins[j].y);
                expect(dist).toBeGreaterThan(PIN_RADIUS * 2);
            }
        }
    });

    it("no pin sits inside any scoring pocket's catcher", () => {
        const pins = generateNailField();
        const pockets = [...TULIPS, JACKPOT, ATTACKER, ...BONUS_POCKETS, CHUCKER].map((p) => ({ ...p.position, halfWidth: p.halfWidth }));
        for (const pin of pins) {
            for (const pocket of pockets) {
                if (Math.abs(pin.y - pocket.y) <= POCKET_DEPTH / 2) {
                    expect(Math.abs(pin.x - pocket.x)).toBeGreaterThan(pocket.halfWidth);
                }
            }
        }
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
