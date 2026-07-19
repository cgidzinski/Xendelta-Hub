import { describe, it, expect } from "vitest";
import { simulateDrop } from "./plinkoPhysics";
import { CANVAS_WIDTH, SLOT_COUNT, DROP_MIN_X, DROP_MAX_X } from "./plinkoLayout";

const CENTER_X = (DROP_MIN_X + DROP_MAX_X) / 2;

describe("simulateDrop", () => {
    it("always terminates and returns a valid slot", () => {
        for (const dropX of [DROP_MIN_X, CENTER_X, DROP_MAX_X]) {
            const { slot, trajectory } = simulateDrop(dropX);
            expect(slot).toBeGreaterThanOrEqual(0);
            expect(slot).toBeLessThan(SLOT_COUNT);
            expect(trajectory.length).toBeGreaterThan(0);
        }
    });

    it("produces a trajectory that never leaves the canvas", () => {
        const { trajectory } = simulateDrop(CENTER_X);
        for (const sample of trajectory) {
            expect(sample.x).toBeGreaterThan(-10);
            expect(sample.x).toBeLessThan(CANVAS_WIDTH + 10);
        }
    });

    it("identical dropX still produces non-identical trajectories (per-shot peg jitter is real)", () => {
        const first = simulateDrop(CENTER_X).trajectory;
        const second = simulateDrop(CENTER_X).trajectory;
        const firstXs = first.map((s) => Math.round(s.x * 10));
        const secondXs = second.map((s) => Math.round(s.x * 10));
        expect(firstXs).not.toEqual(secondXs);
    });

    it("dropping from a spread of positions reaches a spread of slots (aim genuinely matters, but isn't deterministic)", () => {
        const slotsHit = new Set<number>();
        for (let i = 0; i < 60; i++) {
            const dropX = DROP_MIN_X + (i / 59) * (DROP_MAX_X - DROP_MIN_X);
            slotsHit.add(simulateDrop(dropX).slot);
        }
        expect(slotsHit.size).toBeGreaterThan(3);
    });

    it("dropping dead center favors the middle band of slots over the two extreme edges", () => {
        // A real peg field isn't a perfect binomial, and a single degenerate contact
        // straight down the middle can occasionally cascade all the way to an edge - so
        // this doesn't assert "never," just that landing near the middle is meaningfully
        // more common than landing on either extreme edge, over a large enough sample to
        // not be a coin flip itself.
        let middleBand = 0;
        let extremeEdge = 0;
        for (let i = 0; i < 300; i++) {
            const { slot } = simulateDrop(CENTER_X);
            if (slot >= 4 && slot <= 8) middleBand++;
            if (slot === 0 || slot === SLOT_COUNT - 1) extremeEdge++;
        }
        expect(middleBand).toBeGreaterThan(extremeEdge);
    });

    it("terminates within a bounded time even at the extremes of the drop range", () => {
        const start = Date.now();
        simulateDrop(DROP_MIN_X);
        simulateDrop(DROP_MAX_X);
        expect(Date.now() - start).toBeLessThan(2000);
    });

    it("actually reaches the floor, rather than getting wedged against a wall or balanced on a peg", () => {
        // A ball pinned between the outer wall and a peg (or balanced dead-center on one)
        // never reaches SLOT_FLOOR_Y within MAX_STEPS - the sim just gives up and returns
        // wherever it got stuck, still high up the board. Sample across the whole drop range,
        // not just the extremes, so any lingering trap at another alignment point would show
        // up too as a trajectory ending well short of the floor.
        for (let i = 0; i < 10; i++) {
            for (let j = 0; j < 8; j++) {
                const dropX = DROP_MIN_X + (j / 7) * (DROP_MAX_X - DROP_MIN_X);
                const { trajectory } = simulateDrop(dropX);
                const last = trajectory[trajectory.length - 1];
                expect(last.y).toBeGreaterThan(390); // SLOT_FLOOR_Y is 400
            }
        }
    });
}, 20000);
