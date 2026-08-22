import { describe, it, expect } from "vitest";
import { budgetPace } from "./budgetPace";

const FROM = "2026-08-01T00:00:00.000Z";
const TO = "2026-09-01T00:00:00.000Z";

describe("budgetPace", () => {
    it("splits an even limit across the window", () => {
        // Half way through a 31-day August, on an $800 limit.
        const pace = budgetPace(FROM, TO, "2026-08-16T12:00:00.000Z", 400, 800);
        expect(pace.elapsed).toBeCloseTo(0.5, 5);
        expect(pace.expected).toBeCloseTo(400, 5);
        expect(pace.ahead).toBeCloseTo(0, 5);
        expect(pace.projected).toBeCloseTo(800, 5);
        expect(pace.finished).toBe(false);
    });

    it("projects overspend from a fast start", () => {
        const pace = budgetPace(FROM, TO, "2026-08-16T12:00:00.000Z", 500, 800);
        expect(pace.ahead).toBeCloseTo(100, 5);
        expect(pace.projected).toBeCloseTo(1000, 5);
    });

    it("counts days from one", () => {
        expect(budgetPace(FROM, TO, FROM, 0, 800).dayOf).toBe(1);
        expect(budgetPace(FROM, TO, "2026-08-14T09:00:00.000Z", 0, 800).dayOf).toBe(14);
        expect(budgetPace(FROM, TO, TO, 0, 800).totalDays).toBe(31);
    });

    it("clamps an as_of after the window to complete", () => {
        const pace = budgetPace(FROM, TO, "2026-10-05T00:00:00.000Z", 700, 800);
        expect(pace.elapsed).toBe(1);
        expect(pace.expected).toBe(800);
        // The window is closed, so the projection is simply what was spent.
        expect(pace.projected).toBeCloseTo(700, 5);
        expect(pace.finished).toBe(true);
        expect(pace.dayOf).toBe(31);
    });

    it("clamps an as_of before the window to day one", () => {
        const pace = budgetPace(FROM, TO, "2026-07-20T00:00:00.000Z", 0, 800);
        expect(pace.elapsed).toBe(0);
        expect(pace.dayOf).toBe(1);
        // No elapsed time is no rate to extrapolate - not a division by zero.
        expect(pace.projected).toBe(0);
        expect(Number.isFinite(pace.projected)).toBe(true);
    });

    it("treats a zero-length window as finished", () => {
        const pace = budgetPace(FROM, FROM, FROM, 50, 800);
        expect(pace.elapsed).toBe(1);
        expect(pace.projected).toBe(50);
        expect(pace.totalDays).toBe(1);
        expect(pace.finished).toBe(true);
    });

    it("survives a zero limit", () => {
        const pace = budgetPace(FROM, TO, "2026-08-16T12:00:00.000Z", 40, 0);
        expect(pace.expected).toBe(0);
        expect(pace.ahead).toBeCloseTo(40, 5);
        expect(Number.isFinite(pace.projected)).toBe(true);
    });
});
