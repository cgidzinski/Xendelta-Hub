import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    defaultMonthMode, defaultYearMode, parsePeriodMode, resolvePeriod, serializePeriodMode,
    type PeriodMode,
} from "./periodMode";

// A Wednesday, so the week presets straddle a month boundary rather than lining up with it.
const NOW = new Date(2026, 7, 12, 9, 30);

beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
});
afterEach(() => {
    vi.useRealTimers();
});

const iso = (d: Date) => d.toISOString();

describe("resolvePeriod", () => {
    it("names a month and covers all of it", () => {
        const r = resolvePeriod({ kind: "month", anchor: new Date(2026, 7, 1) });
        expect(r.label).toBe("August 2026");
        expect(r.bounded).toBe(true);
        expect(r.groupBy).toBe("day");
        expect(iso(r.from)).toBe("2026-08-01T00:00:00.000Z");
        expect(iso(r.to)).toBe("2026-08-31T23:59:59.999Z");
    });

    it("names a year and covers all of it", () => {
        const r = resolvePeriod({ kind: "year", anchor: new Date(2025, 0, 1) });
        expect(r.label).toBe("2025");
        expect(r.groupBy).toBe("month");
        expect(iso(r.from)).toBe("2025-01-01T00:00:00.000Z");
        expect(iso(r.to)).toBe("2025-12-31T23:59:59.999Z");
    });

    it("marks 'all' unbounded, with a floor below any real item", () => {
        const r = resolvePeriod({ kind: "all" });
        expect(r.bounded).toBe(false);
        expect(r.label).toBe("All time");
        expect(r.from.getUTCFullYear()).toBe(1970);
        // Still a real range: the summary endpoint defaults a missing `from` to the
        // current month, so "all" must never resolve to open-ended.
        expect(r.to.getTime()).toBeGreaterThan(NOW.getTime());
    });

    it("shortens every label for the pill on a phone", () => {
        // The pill has to fit beside Source and Filters on one 360px row, so every mode
        // needs a form that stays well under the full label's width.
        expect(resolvePeriod({ kind: "all" }).shortLabel).toBe("All");
        expect(resolvePeriod({ kind: "month", anchor: new Date(2026, 7, 1) }).shortLabel).toBe("Aug 26");
        expect(resolvePeriod({ kind: "year", anchor: new Date(2025, 0, 1) }).shortLabel).toBe("2025");
        expect(resolvePeriod({ kind: "preset", preset: "thisWeek" }).shortLabel).toBe("This wk");
        expect(resolvePeriod({ kind: "preset", preset: "lastWeek" }).shortLabel).toBe("Last wk");
        expect(resolvePeriod({ kind: "preset", preset: "last3" }).shortLabel).toBe("Last 3m");
        expect(resolvePeriod({ kind: "preset", preset: "last6" }).shortLabel).toBe("Last 6m");
        expect(resolvePeriod({ kind: "preset", preset: "thisQuarter" }).shortLabel).toBe("Quarter");
    });

    it("shortens a whole-month custom range to that month, and any other to 'Custom'", () => {
        const wholeMonth = resolvePeriod({
            kind: "custom", from: new Date(2026, 7, 1), to: new Date(2026, 7, 31, 23, 59, 59, 999),
        });
        expect(wholeMonth.label).toBe("August 2026");
        expect(wholeMonth.shortLabel).toBe("Aug 26");

        const range = resolvePeriod({
            kind: "custom", from: new Date(2026, 7, 3), to: new Date(2026, 8, 9),
        });
        expect(range.label).toBe("Aug 3 – Sep 9");
        expect(range.shortLabel).toBe("Custom");
    });

    it("every other mode is bounded", () => {
        const modes: PeriodMode[] = [
            { kind: "month", anchor: NOW },
            { kind: "year", anchor: NOW },
            { kind: "preset", preset: "thisWeek" },
            { kind: "preset", preset: "lastWeek" },
            { kind: "preset", preset: "last3" },
            { kind: "preset", preset: "last6" },
            { kind: "preset", preset: "thisQuarter" },
            { kind: "custom", from: new Date(2026, 0, 1), to: new Date(2026, 0, 31) },
        ];
        for (const mode of modes) expect(resolvePeriod(mode).bounded).toBe(true);
    });

    it("puts this week and last week back to back without overlapping", () => {
        const thisWeek = resolvePeriod({ kind: "preset", preset: "thisWeek" });
        const lastWeek = resolvePeriod({ kind: "preset", preset: "lastWeek" });

        expect(lastWeek.to.getTime()).toBeLessThan(thisWeek.from.getTime());
        // Adjacent: last week ends the instant before this week begins.
        expect(thisWeek.from.getTime() - lastWeek.to.getTime()).toBe(1);
        expect(thisWeek.label).toBe("This week");
        expect(lastWeek.label).toBe("Last week");
    });

    it("runs this week to the end of the week, not to now", () => {
        // An item dated later this week is still in this week — the old item-list filter
        // left the end open, so nothing may start dropping off it.
        const r = resolvePeriod({ kind: "preset", preset: "thisWeek" });
        expect(r.to.getTime()).toBeGreaterThan(NOW.getTime());
    });

    it("widens the buckets as a custom range gets longer", () => {
        const day = resolvePeriod({ kind: "custom", from: new Date(2026, 7, 1), to: new Date(2026, 7, 20) });
        const week = resolvePeriod({ kind: "custom", from: new Date(2026, 4, 1), to: new Date(2026, 7, 1) });
        const month = resolvePeriod({ kind: "custom", from: new Date(2025, 0, 1), to: new Date(2026, 7, 1) });
        expect(day.groupBy).toBe("day");
        expect(week.groupBy).toBe("week");
        expect(month.groupBy).toBe("month");
    });

    it("names a custom range that is exactly one month as that month", () => {
        // What picking a month from the grid used to produce, and what a monthly budget's
        // "View items" hands over.
        const r = resolvePeriod({
            kind: "custom", from: new Date(2026, 7, 1), to: new Date(2026, 7, 31, 23, 59, 59, 999),
        });
        expect(r.label).toBe("August 2026");
    });

    it("names any other custom range by its ends", () => {
        const r = resolvePeriod({ kind: "custom", from: new Date(2026, 7, 3), to: new Date(2026, 7, 19) });
        expect(r.label).toBe("Aug 3 – Aug 19");
    });

    it("anchors the defaults to today", () => {
        expect(resolvePeriod(defaultMonthMode()).label).toBe("August 2026");
        expect(resolvePeriod(defaultYearMode()).label).toBe("2026");
    });
});

describe("serializePeriodMode / parsePeriodMode", () => {
    const modes: PeriodMode[] = [
        { kind: "all" },
        { kind: "month", anchor: new Date(2026, 7, 1) },
        { kind: "year", anchor: new Date(2026, 0, 1) },
        { kind: "preset", preset: "thisWeek" },
        { kind: "preset", preset: "lastWeek" },
        { kind: "preset", preset: "last3" },
        { kind: "preset", preset: "last6" },
        { kind: "preset", preset: "thisQuarter" },
        { kind: "custom", from: new Date(2026, 0, 1), to: new Date(2026, 0, 31) },
    ];

    it("round-trips every mode", () => {
        for (const mode of modes) {
            const back = parsePeriodMode(serializePeriodMode(mode));
            expect(back).not.toBeNull();
            // Compare through the resolver: that's what every caller actually reads.
            expect(resolvePeriod(back!)).toEqual(resolvePeriod(mode));
        }
    });

    it("returns null rather than throwing on anything unusable", () => {
        expect(parsePeriodMode(null)).toBeNull();
        expect(parsePeriodMode("")).toBeNull();
        expect(parsePeriodMode("not json")).toBeNull();
        expect(parsePeriodMode('{"kind":"nonsense"}')).toBeNull();
        expect(parsePeriodMode('{"kind":"preset","preset":"fortnightly"}')).toBeNull();
        expect(parsePeriodMode('{"kind":"month","anchor":"not a date"}')).toBeNull();
        expect(parsePeriodMode('{"kind":"custom","from":"nope","to":"nope"}')).toBeNull();
    });
});
