import { describe, it, expect } from "vitest";
import { budgetedForRange, type RangeBudget } from "./budgetForRange";

// UTC dates throughout: period boundaries and report ranges are both anchored on UTC
// days, the way the server keys items and resolvePeriod builds its ranges.
const local = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

function monthly(amount = 800): RangeBudget {
    return { period: "monthly", amount, period_from: "", period_to: "" };
}

describe("budgetedForRange", () => {
    it("gives exactly twelve months of a monthly cap over a calendar year", () => {
        expect(budgetedForRange(monthly(800), local(2026, 1, 1), local(2027, 1, 1)))
            .toBeCloseTo(9600, 6);
    });

    it("gives exactly one month over one calendar month", () => {
        expect(budgetedForRange(monthly(800), local(2026, 8, 1), local(2026, 9, 1)))
            .toBeCloseTo(800, 6);
    });

    it("prorates a partial month by how much of it the range covers", () => {
        // Sixteen of August's 31 days.
        const value = budgetedForRange(monthly(800), local(2026, 8, 1), local(2026, 8, 17));
        expect(value).toBeCloseTo(800 * (16 / 31), 6);
    });

    it("adds a partial tail to whole months rather than rounding it up", () => {
        // All of August, then half of September.
        const value = budgetedForRange(monthly(800), local(2026, 8, 1), local(2026, 9, 16));
        expect(value).toBeCloseTo(800 + 800 * (15 / 30), 6);
    });

    it("counts a quarterly cap once per quarter of a year", () => {
        const quarterly: RangeBudget = { period: "quarterly", amount: 1500, period_from: "", period_to: "" };
        expect(budgetedForRange(quarterly, local(2026, 1, 1), local(2027, 1, 1)))
            .toBeCloseTo(6000, 6);
    });

    it("counts a yearly cap once per year", () => {
        const yearly: RangeBudget = { period: "yearly", amount: 12000, period_from: "", period_to: "" };
        expect(budgetedForRange(yearly, local(2026, 1, 1), local(2027, 1, 1)))
            .toBeCloseTo(12000, 6);
    });

    it("counts whole weeks of a weekly cap", () => {
        // 2026-08-03 is a Monday; four weeks to 2026-08-31.
        const weekly: RangeBudget = { period: "weekly", amount: 100, period_from: "", period_to: "" };
        expect(budgetedForRange(weekly, local(2026, 8, 3), local(2026, 8, 31)))
            .toBeCloseTo(400, 6);
    });

    it("scales a one-off budget by the slice of its own window the range covers", () => {
        const custom: RangeBudget = {
            period: "custom", amount: 1000,
            period_from: local(2026, 8, 1).toISOString(),
            period_to: local(2026, 8, 11).toISOString(),
        };
        // The range covers five of the window's ten days.
        expect(budgetedForRange(custom, local(2026, 8, 1), local(2026, 8, 6)))
            .toBeCloseTo(500, 6);
        // And the whole window, however much wider the range is.
        expect(budgetedForRange(custom, local(2026, 1, 1), local(2027, 1, 1)))
            .toBeCloseTo(1000, 6);
    });

    it("is zero for a one-off window the range never touches", () => {
        const custom: RangeBudget = {
            period: "custom", amount: 1000,
            period_from: local(2025, 1, 1).toISOString(),
            period_to: local(2025, 2, 1).toISOString(),
        };
        expect(budgetedForRange(custom, local(2026, 8, 1), local(2026, 9, 1))).toBe(0);
    });

    it("is zero when the budget sets no overall cap", () => {
        const personalOnly: RangeBudget = { period: "monthly", period_from: "", period_to: "" };
        expect(budgetedForRange(personalOnly, local(2026, 1, 1), local(2027, 1, 1))).toBe(0);
    });

    it("is zero for an empty or backwards range", () => {
        expect(budgetedForRange(monthly(), local(2026, 8, 1), local(2026, 8, 1))).toBe(0);
        expect(budgetedForRange(monthly(), local(2026, 9, 1), local(2026, 8, 1))).toBe(0);
    });

    it("handles a range that starts mid-period without counting the part before it", () => {
        // Starting on the 17th must not pick up the 1st-to-16th of the same month.
        const value = budgetedForRange(monthly(800), local(2026, 8, 17), local(2026, 9, 1));
        expect(value).toBeCloseTo(800 * (15 / 31), 6);
    });
});
