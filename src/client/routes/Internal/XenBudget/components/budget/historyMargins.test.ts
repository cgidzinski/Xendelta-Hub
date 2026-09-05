import { describe, it, expect } from "vitest";
import type { BudgetPeriodResult } from "../../../../../hooks/xenbudget/types";
import { historyMargins, columnLabel } from "./historyMargins";

function period(month: number, spent: number, itemCount = 5, amount = 800): BudgetPeriodResult {
    const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
    const next = month === 12 ? { y: 2027, m: 1 } : { y: 2026, m: month + 1 };
    return {
        from: `2026-${pad(month)}-01T00:00:00.000Z`,
        to: `${next.y}-${pad(next.m)}-01T00:00:00.000Z`,
        spent,
        item_count: itemCount,
        amount,
        percent: Math.round((spent / amount) * 100),
        over: spent > amount,
    };
}

// Every period below is closed by this point except where noted.
const AFTER = "2026-12-15T00:00:00.000Z";

describe("historyMargins", () => {
    it("makes under-the-cap positive, so positive is always the good direction", () => {
        const { columns } = historyMargins([period(3, 620)], "ceiling", AFTER);
        expect(columns[0].margin).toBe(180);
        expect(columns[0].passed).toBe(true);
    });

    it("makes over-the-cap negative", () => {
        const { columns } = historyMargins([period(3, 892)], "ceiling", AFTER);
        expect(columns[0].margin).toBe(-92);
        expect(columns[0].passed).toBe(false);
    });

    it("flips the sign for a floor, so beating a target is also positive", () => {
        const { columns } = historyMargins([period(3, 950)], "floor", AFTER);
        expect(columns[0].margin).toBe(150);
        expect(columns[0].passed).toBe(true);
    });

    it("makes falling short of a floor negative", () => {
        const { columns } = historyMargins([period(3, 600)], "floor", AFTER);
        expect(columns[0].margin).toBe(-200);
        expect(columns[0].passed).toBe(false);
    });

    it("counts a period landing exactly on a cap as a pass", () => {
        expect(historyMargins([period(3, 800)], "ceiling", AFTER).passed).toBe(1);
    });

    it("counts a floor landing exactly on target as a pass too", () => {
        expect(historyMargins([period(3, 800)], "floor", AFTER).passed).toBe(1);
    });

    it("leaves an empty period out of the record rather than passing it", () => {
        const summary = historyMargins([period(3, 0, 0), period(4, 620)], "ceiling", AFTER);
        expect(summary.columns[0].quiet).toBe(true);
        expect(summary.columns[0].passed).toBeUndefined();
        expect(summary).toMatchObject({ passed: 1, judged: 1 });
    });

    it("does not judge the period still in progress", () => {
        // December is the window `asOf` falls in, so it is still open.
        const summary = historyMargins(
            [period(11, 620), period(12, 300)], "ceiling", AFTER,
        );
        expect(summary.columns[1].open).toBe(true);
        expect(summary.columns[1].passed).toBeUndefined();
        expect(summary.judged).toBe(1);
    });

    it("still measures the open period, so the strip has a bar for it", () => {
        const summary = historyMargins([period(12, 300)], "ceiling", AFTER);
        expect(summary.columns[0].margin).toBe(500);
    });

    it("counts the streak back from the most recent closed period", () => {
        const summary = historyMargins(
            [period(6, 900), period(7, 620), period(8, 500)], "ceiling", AFTER,
        );
        expect(summary).toMatchObject({ passed: 2, judged: 3, streak: 2 });
    });

    it("breaks the streak on a miss without losing the earlier passes", () => {
        const summary = historyMargins(
            [period(6, 620), period(7, 500), period(8, 900)], "ceiling", AFTER,
        );
        expect(summary).toMatchObject({ passed: 2, judged: 3, streak: 0 });
    });

    it("scales to the largest margin either way", () => {
        const summary = historyMargins(
            [period(6, 620), period(7, 1200)], "ceiling", AFTER,
        );
        expect(summary.peak).toBe(400);
    });

    it("never scales to zero, so an all-exact run can't divide by nothing", () => {
        expect(historyMargins([period(6, 800)], "ceiling", AFTER).peak).toBe(1);
    });

    it("treats a budget with no overall amount as having nothing to judge", () => {
        // A budget that caps only named people: no amount, so no whole-budget result.
        const { amount, percent, over, ...capless } = period(6, 620);
        void amount; void percent; void over;
        const summary = historyMargins([capless], "ceiling", AFTER);
        expect(summary.columns[0].quiet).toBe(true);
        expect(summary.judged).toBe(0);
    });
});

describe("columnLabel", () => {
    it("dates a weekly column, since two weeks in one month need telling apart", () => {
        expect(columnLabel("2026-08-10T00:00:00.000Z", "2026-08-17T00:00:00.000Z"))
            .toBe("Aug 10");
    });

    it("names a monthly column", () => {
        expect(columnLabel("2026-08-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z"))
            .toBe("Aug");
    });

    it("handles a short month without reading as a week", () => {
        expect(columnLabel("2026-02-01T00:00:00.000Z", "2026-03-01T00:00:00.000Z"))
            .toBe("Feb");
    });

    it("numbers a quarterly column", () => {
        expect(columnLabel("2026-07-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z"))
            .toBe("Q3");
    });

    it("gives a yearly column its year", () => {
        expect(columnLabel("2026-01-01T00:00:00.000Z", "2027-01-01T00:00:00.000Z"))
            .toBe("2026");
    });
});
