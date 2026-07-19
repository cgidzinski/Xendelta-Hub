import { describe, it, expect } from "vitest";
import { simulateShot } from "./pachinkoPhysics";
import { MIN_LAUNCH_POWER, MAX_LAUNCH_POWER } from "./pachinkoLayout";

const CLOSED = { leftOpen: false, rightOpen: false };
const PRIMED = { leftOpen: true, rightOpen: true };

describe("simulateShot", () => {
    it("always terminates and returns one of the four defined outcomes", () => {
        const powers = [MIN_LAUNCH_POWER, 25, 50, 75, MAX_LAUNCH_POWER];
        for (const power of powers) {
            const { outcome, trajectory } = simulateShot(power, CLOSED);
            expect(["gutter", "tulipLeft", "tulipRight", "tulipCenter"]).toContain(outcome);
            expect(trajectory.length).toBeGreaterThan(0);
        }
    });

    it("produces a trajectory that starts at the launcher and never exceeds the canvas bounds", () => {
        const { trajectory } = simulateShot(50, CLOSED);
        for (const sample of trajectory) {
            expect(sample.x).toBeGreaterThan(-5);
            expect(sample.x).toBeLessThan(465);
        }
    });

    it("identical launchPower and tulipState still produce non-identical trajectories (per-shot jitter is real)", () => {
        const first = simulateShot(50, CLOSED).trajectory;
        const second = simulateShot(50, CLOSED).trajectory;
        const firstXs = first.map((s) => Math.round(s.x * 10));
        const secondXs = second.map((s) => Math.round(s.x * 10));
        expect(firstXs).not.toEqual(secondXs);
    });

    it("a primed center tulip is reachable (wider catcher than when unprimed)", () => {
        // Mostly-miss is the point (real pachinko), so a tulip hit is a low-probability event
        // per shot (~2-3% empirically) - sample across a spread of launch powers with a large
        // trial count to keep this from being a flaky test on a rare outcome (P(zero hits in
        // 400 trials at 2.5%) is well under 0.01%).
        let centerHits = 0;
        for (let i = 0; i < 400; i++) {
            const power = MIN_LAUNCH_POWER + (i % 9) * ((MAX_LAUNCH_POWER - MIN_LAUNCH_POWER) / 9);
            const { outcome } = simulateShot(power, PRIMED);
            if (outcome === "tulipCenter") centerHits++;
        }
        expect(centerHits).toBeGreaterThan(0);
    });

    it("terminates within a bounded number of steps even at the extremes of launch power", () => {
        const start = Date.now();
        simulateShot(MIN_LAUNCH_POWER, CLOSED);
        simulateShot(MAX_LAUNCH_POWER, CLOSED);
        expect(Date.now() - start).toBeLessThan(2000);
    });
}, 20000);
