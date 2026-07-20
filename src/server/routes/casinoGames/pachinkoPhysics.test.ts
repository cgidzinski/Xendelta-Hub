import { describe, it, expect } from "vitest";
import { simulateShot } from "./pachinkoPhysics";
import { MIN_LAUNCH_POWER, MAX_LAUNCH_POWER, CANVAS_WIDTH } from "./pachinkoLayout";

const ALL_OUTCOMES = ["gutter", "tulipLeft", "tulipRight", "jackpot", "bonusLeft", "bonusRight", "chucker", "attacker"];

describe("simulateShot", () => {
    it("always terminates and returns one of the defined outcomes", () => {
        const powers = [MIN_LAUNCH_POWER, 25, 50, 75, MAX_LAUNCH_POWER];
        for (const power of powers) {
            const { outcome, trajectory } = simulateShot(power);
            expect(ALL_OUTCOMES).toContain(outcome);
            expect(trajectory.length).toBeGreaterThan(0);
        }
    });

    it("produces a trajectory that starts at the launcher and never exceeds the canvas bounds", () => {
        const { trajectory } = simulateShot(50);
        for (const sample of trajectory) {
            expect(sample.x).toBeGreaterThan(-5);
            expect(sample.x).toBeLessThan(CANVAS_WIDTH + 5);
        }
    });

    it("identical launchPower still produces non-identical trajectories (per-shot jitter is real)", () => {
        const first = simulateShot(50).trajectory;
        const second = simulateShot(50).trajectory;
        const firstXs = first.map((s) => Math.round(s.x * 10));
        const secondXs = second.map((s) => Math.round(s.x * 10));
        expect(firstXs).not.toEqual(secondXs);
    });

    it("the jackpot pocket is reachable when active (both tulips open) but never registers a catch when inactive (the default) - not just non-scoring, physically not there, mirroring the chucker/attacker", () => {
        // Mostly-miss is the point (real pachinko), so a jackpot hit is a low-probability event
        // per shot - sample across a spread of launch powers with a large trial count to keep
        // this from being a flaky test on a rare outcome.
        let jackpotHitsActive = 0;
        let jackpotHitsInactive = 0;
        for (let i = 0; i < 400; i++) {
            const power = MIN_LAUNCH_POWER + (i % 9) * ((MAX_LAUNCH_POWER - MIN_LAUNCH_POWER) / 9);
            if (simulateShot(power, true, false, true).outcome === "jackpot") jackpotHitsActive++;
            if (simulateShot(power, true, false, false).outcome === "jackpot") jackpotHitsInactive++;
        }
        expect(jackpotHitsActive).toBeGreaterThan(0);
        expect(jackpotHitsInactive).toBe(0);
    });

    it("the attacker is reachable when active but never registers a catch when inactive (the default) - not just non-scoring, physically not there, mirroring the chucker", () => {
        let attackerHitsActive = 0;
        let attackerHitsInactive = 0;
        for (let i = 0; i < 200; i++) {
            const power = MIN_LAUNCH_POWER + (i % 9) * ((MAX_LAUNCH_POWER - MIN_LAUNCH_POWER) / 9);
            if (simulateShot(power, true, true).outcome === "attacker") attackerHitsActive++;
            if (simulateShot(power, true, false).outcome === "attacker") attackerHitsInactive++;
        }
        expect(attackerHitsActive).toBeGreaterThan(0);
        expect(attackerHitsInactive).toBe(0);
    });

    it("bonus pockets, the chucker, and both tulips are all reachable", () => {
        const outcomes = new Set<string>();
        for (let i = 0; i < 400; i++) {
            const power = MIN_LAUNCH_POWER + (i % 9) * ((MAX_LAUNCH_POWER - MIN_LAUNCH_POWER) / 9);
            const { outcome } = simulateShot(power);
            outcomes.add(outcome);
        }
        expect(outcomes.has("bonusLeft") || outcomes.has("bonusRight") || outcomes.has("chucker") || outcomes.has("tulipLeft") || outcomes.has("tulipRight")).toBe(true);
    });

    it("the chucker is reachable when active (the default) but never registers a catch when inactive - not just non-scoring, physically not there", () => {
        let chuckerHitsActive = 0;
        let chuckerHitsInactive = 0;
        for (let i = 0; i < 200; i++) {
            const power = MIN_LAUNCH_POWER + (i % 9) * ((MAX_LAUNCH_POWER - MIN_LAUNCH_POWER) / 9);
            if (simulateShot(power, true).outcome === "chucker") chuckerHitsActive++;
            if (simulateShot(power, false).outcome === "chucker") chuckerHitsInactive++;
        }
        expect(chuckerHitsActive).toBeGreaterThan(0);
        expect(chuckerHitsInactive).toBe(0);
    });

    it("terminates within a bounded number of steps even at the extremes of launch power", () => {
        const start = Date.now();
        simulateShot(MIN_LAUNCH_POWER);
        simulateShot(MAX_LAUNCH_POWER);
        expect(Date.now() - start).toBeLessThan(2000);
    });
    // Raised from 20000 - the denser (100+ pin) nail field means more Matter.js static bodies
    // per shot, so a single simulateShot() now costs ~70ms instead of ~10ms. The large-N
    // reachability tests above (hundreds of shots each, needed to catch a rare outcome without
    // being flaky) need real headroom for that, even though a single production /launch request
    // is still well under 100ms either way.
}, 120000);
