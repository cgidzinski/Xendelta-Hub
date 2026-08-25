import { describe, it, expect } from "vitest";
import { periodColumnLabels, periodKeyRange, shouldPivot, MAX_PERIOD_COLUMNS } from "./periodColumns";

describe("shouldPivot", () => {
    it("pivots a year into months", () => {
        const months = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);
        expect(shouldPivot(months)).toBe(true);
    });

    it("pivots a quarter of weeks, right at the limit", () => {
        const weeks = Array.from({ length: MAX_PERIOD_COLUMNS }, (_, i) => `2026-W${String(i + 1).padStart(2, "0")}`);
        expect(shouldPivot(weeks)).toBe(true);
    });

    it("leaves a month of days alone - too many columns to read", () => {
        const days = Array.from({ length: 31 }, (_, i) => `2026-08-${String(i + 1).padStart(2, "0")}`);
        expect(shouldPivot(days)).toBe(false);
    });

    it("does not pivot a single bucket into one column", () => {
        expect(shouldPivot(["2026-08"])).toBe(false);
        expect(shouldPivot([])).toBe(false);
    });
});

describe("periodColumnLabels", () => {
    it("names months within one year without repeating the year", () => {
        expect(periodColumnLabels(["2026-01", "2026-08", "2026-12"]))
            .toEqual(["Jan", "Aug", "Dec"]);
    });

    it("adds the year to every column once the range crosses one", () => {
        // "Dec" beside "Jan" is ambiguous, so the year goes on both - not just January.
        expect(periodColumnLabels(["2025-11", "2025-12", "2026-01"]))
            .toEqual(["Nov '25", "Dec '25", "Jan '26"]);
    });

    it("names weeks, dropping the zero padding", () => {
        expect(periodColumnLabels(["2026-W01", "2026-W34"])).toEqual(["W1", "W34"]);
    });

    it("qualifies weeks by year when the range crosses one", () => {
        expect(periodColumnLabels(["2025-W52", "2026-W01"])).toEqual(["W52 '25", "W1 '26"]);
    });

    it("names days as month and date", () => {
        expect(periodColumnLabels(["2026-08-01", "2026-08-21"])).toEqual(["Aug 1", "Aug 21"]);
    });

    it("passes anything it does not recognise straight through", () => {
        expect(periodColumnLabels(["whatever"])).toEqual(["whatever"]);
    });
});

describe("periodKeyRange", () => {
    it("covers a whole calendar month", () => {
        const range = periodKeyRange("2026-08");
        expect(range?.from).toEqual(new Date(Date.UTC(2026, 7, 1)));
        expect(range?.to).toEqual(new Date(Date.UTC(2026, 8, 1)));
    });

    it("rolls a December key into the next year", () => {
        const range = periodKeyRange("2026-12");
        expect(range?.to).toEqual(new Date(Date.UTC(2027, 0, 1)));
    });

    it("covers a Monday-to-Monday ISO week", () => {
        // ISO week 1 of 2026 starts Monday 2025-12-29.
        const range = periodKeyRange("2026-W01");
        expect(range?.from).toEqual(new Date(Date.UTC(2025, 11, 29)));
        expect(range?.to).toEqual(new Date(Date.UTC(2026, 0, 5)));
        expect((range!.to.getTime() - range!.from.getTime()) / 86400000).toBe(7);
    });

    it("covers a single day", () => {
        const range = periodKeyRange("2026-08-21");
        expect(range?.from).toEqual(new Date(Date.UTC(2026, 7, 21)));
        expect(range?.to).toEqual(new Date(Date.UTC(2026, 7, 22)));
    });

    it("returns nothing for a key it cannot read", () => {
        expect(periodKeyRange("whatever")).toBeNull();
    });

    it("hands back windows that meet without overlapping", () => {
        // Consecutive buckets must tile the range exactly, or per-column figures would
        // not add up to the total.
        expect(periodKeyRange("2026-08")?.to).toEqual(periodKeyRange("2026-09")?.from);
        expect(periodKeyRange("2026-W34")?.to).toEqual(periodKeyRange("2026-W35")?.from);
    });
});
