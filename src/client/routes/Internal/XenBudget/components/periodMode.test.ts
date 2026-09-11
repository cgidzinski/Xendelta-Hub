import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    defaultMonthMode, defaultYearMode, isAnchored, parsePeriodMode, resolvePeriod,
    serializePeriodMode, stepPeriod, unitMode, type PeriodMode,
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
        expect(resolvePeriod({ kind: "day", anchor: new Date(2026, 7, 24) }).shortLabel).toBe("Aug 24");
        // Anchored on the Wednesday: a week names itself by the Monday it snaps back to.
        expect(resolvePeriod({ kind: "week", anchor: new Date(2026, 7, 26) }).shortLabel).toBe("Aug 24");
        expect(resolvePeriod({ kind: "quarter", anchor: new Date(2026, 7, 1) }).shortLabel).toBe("Q3 26");
        expect(resolvePeriod({ kind: "preset", preset: "last3" }).shortLabel).toBe("Last 3m");
        expect(resolvePeriod({ kind: "preset", preset: "last6" }).shortLabel).toBe("Last 6m");
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
            { kind: "day", anchor: NOW },
            { kind: "week", anchor: NOW },
            { kind: "month", anchor: NOW },
            { kind: "quarter", anchor: NOW },
            { kind: "year", anchor: NOW },
            { kind: "preset", preset: "last3" },
            { kind: "preset", preset: "last6" },
            { kind: "custom", from: new Date(2026, 0, 1), to: new Date(2026, 0, 31) },
        ];
        for (const mode of modes) expect(resolvePeriod(mode).bounded).toBe(true);
    });

    it("starts a week on MONDAY, not Sunday", () => {
        // The regression guard for the whole ladder: the server's budgetPeriodRange and
        // isoWeekKey (what Mongo's %G-W%V buckets key on) and the client's utcStartOfWeek
        // are all Monday-based. date-fns defaults to Sunday, so a week that began on Sunday
        // measured every weekly budget over the wrong seven days.
        // NOW is Wednesday 2026-08-12, so its week runs Mon 10th to Sun 16th.
        const r = resolvePeriod(unitMode("week"));
        expect(iso(r.from)).toBe("2026-08-10T00:00:00.000Z");
        expect(iso(r.to)).toBe("2026-08-16T23:59:59.999Z");
        expect(r.label).toBe("Week of Aug 10");
        expect(r.groupBy).toBe("day");
    });

    it("puts consecutive weeks back to back without overlapping", () => {
        const thisWeek = resolvePeriod(unitMode("week"));
        const lastWeek = resolvePeriod(stepPeriod(unitMode("week"), -1));

        expect(lastWeek.to.getTime()).toBeLessThan(thisWeek.from.getTime());
        // Adjacent: last week ends the instant before this week begins.
        expect(thisWeek.from.getTime() - lastWeek.to.getTime()).toBe(1);
        expect(lastWeek.label).toBe("Week of Aug 3");
    });

    it("runs a unit to the end of the unit, not to now", () => {
        // An item dated later this week is still in this week — the old item-list filter
        // left the end open, so nothing may start dropping off it.
        for (const unit of ["day", "week", "month", "quarter", "year"] as const) {
            expect(resolvePeriod(unitMode(unit)).to.getTime()).toBeGreaterThan(NOW.getTime());
        }
    });

    it("covers each unit exactly, day up to year", () => {
        const day = resolvePeriod({ kind: "day", anchor: new Date(2026, 7, 24) });
        expect(iso(day.from)).toBe("2026-08-24T00:00:00.000Z");
        expect(iso(day.to)).toBe("2026-08-24T23:59:59.999Z");
        expect(day.label).toBe("Mon, Aug 24 2026");
        expect(day.groupBy).toBe("day");

        const quarter = resolvePeriod({ kind: "quarter", anchor: new Date(2026, 7, 12) });
        expect(iso(quarter.from)).toBe("2026-07-01T00:00:00.000Z");
        expect(iso(quarter.to)).toBe("2026-09-30T23:59:59.999Z");
        expect(quarter.label).toBe("Q3 2026");
        expect(quarter.groupBy).toBe("week");
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
        { kind: "day", anchor: new Date(2026, 7, 24) },
        { kind: "week", anchor: new Date(2026, 7, 10) },
        { kind: "month", anchor: new Date(2026, 7, 1) },
        { kind: "quarter", anchor: new Date(2026, 6, 1) },
        { kind: "year", anchor: new Date(2026, 0, 1) },
        { kind: "preset", preset: "last3" },
        { kind: "preset", preset: "last6" },
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
        expect(parsePeriodMode('{"kind":"week","anchor":"not a date"}')).toBeNull();
        expect(parsePeriodMode('{"kind":"month","anchor":"not a date"}')).toBeNull();
        expect(parsePeriodMode('{"kind":"custom","from":"nope","to":"nope"}')).toBeNull();
    });
});

describe("stepPeriod", () => {
    it("walks each unit one whole step at a time", () => {
        expect(resolvePeriod(stepPeriod(unitMode("month"), -1)).label).toBe("July 2026");
        expect(resolvePeriod(stepPeriod(unitMode("month"), 1)).label).toBe("September 2026");
        expect(resolvePeriod(stepPeriod(unitMode("quarter"), -1)).label).toBe("Q2 2026");
        expect(resolvePeriod(stepPeriod(unitMode("year"), 1)).label).toBe("2027");
        expect(resolvePeriod(stepPeriod(unitMode("day"), -1)).label).toBe("Tue, Aug 11 2026");
    });

    it("steps a month without landing in the wrong one from a long month", () => {
        // Stepping back from the 31st must give July, not a clamped date that reads as June.
        const may31 = { kind: "month", anchor: new Date(2026, 4, 31) } as const;
        expect(resolvePeriod(stepPeriod(may31, 1)).label).toBe("June 2026");
    });

    it("leaves anything without a single anchor alone, so the arrows can hide", () => {
        const spans: PeriodMode[] = [
            { kind: "all" },
            { kind: "preset", preset: "last3" },
            { kind: "custom", from: new Date(2026, 0, 1), to: new Date(2026, 0, 31) },
        ];
        for (const mode of spans) {
            expect(isAnchored(mode)).toBe(false);
            expect(stepPeriod(mode, -1)).toEqual(mode);
        }
        expect(isAnchored(unitMode("week"))).toBe(true);
    });
});

describe("migrating windows stored before the ladder", () => {
    // These were fixed presets with no anchor. Failing to parse them would silently drop
    // everyone back to the default month on the first load after the upgrade.
    it("reads the retired week and quarter presets as their anchored unit", () => {
        const thisWeek = parsePeriodMode('{"kind":"preset","preset":"thisWeek"}');
        expect(resolvePeriod(thisWeek!)).toEqual(resolvePeriod(unitMode("week")));

        const lastWeek = parsePeriodMode('{"kind":"preset","preset":"lastWeek"}');
        expect(resolvePeriod(lastWeek!)).toEqual(resolvePeriod(stepPeriod(unitMode("week"), -1)));

        const quarter = parsePeriodMode('{"kind":"preset","preset":"thisQuarter"}');
        expect(resolvePeriod(quarter!)).toEqual(resolvePeriod(unitMode("quarter")));
    });

    it("still reads the month and year anchors it always stored", () => {
        const month = parsePeriodMode('{"kind":"month","anchor":"2026-03-01T00:00:00.000Z"}');
        expect(month).not.toBeNull();
        expect(resolvePeriod(month!).label).toBe("March 2026");
    });
});
