import { describe, it, expect } from "vitest";
import { windowLabel, periodNoun, monthlyEquivalent } from "./periodDisplay";

// UTC dates throughout, matching the server's windows (see the repo's UTC convention).
const local = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const iso = (d: Date) => d.toISOString();

describe("windowLabel", () => {
    it("names a weekly window by its Monday", () => {
        expect(windowLabel("weekly", iso(local(2026, 8, 24)), iso(local(2026, 8, 31))))
            .toBe("Week of Aug 24");
    });

    it("names a monthly window as its month", () => {
        expect(windowLabel("monthly", iso(local(2026, 8, 1)), iso(local(2026, 9, 1))))
            .toBe("Aug 2026");
    });

    it("names a quarterly window as Qn yyyy", () => {
        expect(windowLabel("quarterly", iso(local(2026, 7, 1)), iso(local(2026, 10, 1))))
            .toBe("Q3 2026");
        expect(windowLabel("quarterly", iso(local(2026, 1, 1)), iso(local(2026, 4, 1))))
            .toBe("Q1 2026");
    });

    it("names a yearly window as its year", () => {
        expect(windowLabel("yearly", iso(local(2026, 1, 1)), iso(local(2027, 1, 1))))
            .toBe("2026");
    });

    it("names a custom window as its date range", () => {
        expect(windowLabel("custom", iso(local(2026, 8, 24)), iso(local(2026, 9, 20))))
            .toBe("Aug 24 – Sep 20, 2026");
    });

    it("names a cross-year custom window with both years", () => {
        expect(windowLabel("custom", iso(local(2025, 12, 20)), iso(local(2026, 1, 5))))
            .toBe("Dec 20 – Jan 5, 2025 – 2026");
    });
});

describe("periodNoun", () => {
    it("maps every period to its rate noun", () => {
        expect(periodNoun("weekly")).toBe("week");
        expect(periodNoun("monthly")).toBe("month");
        expect(periodNoun("quarterly")).toBe("quarter");
        expect(periodNoun("yearly")).toBe("year");
        expect(periodNoun("custom")).toBe("period");
    });
});

describe("monthlyEquivalent", () => {
    it("multiplies a weekly amount by four", () => {
        expect(monthlyEquivalent("weekly", 100)).toBe(400);
    });

    it("divides a quarterly amount by three", () => {
        expect(monthlyEquivalent("quarterly", 3000)).toBe(1000);
    });

    it("leaves a monthly amount alone", () => {
        expect(monthlyEquivalent("monthly", 800)).toBe(800);
    });

    it("divides a yearly amount by twelve", () => {
        expect(monthlyEquivalent("yearly", 12000)).toBe(1000);
    });

    it("is undefined for a one-off custom period", () => {
        expect(monthlyEquivalent("custom", 1000)).toBeUndefined();
    });

    it("is undefined with no overall amount or a non-positive one", () => {
        expect(monthlyEquivalent("monthly", undefined)).toBeUndefined();
        expect(monthlyEquivalent("monthly", 0)).toBeUndefined();
        expect(monthlyEquivalent("monthly", -5)).toBeUndefined();
    });
});
