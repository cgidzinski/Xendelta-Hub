import { describe, it, expect } from "vitest";
import type { BudgetStatus, SubBudgetStatus } from "../../../../../hooks/xenbudget/types";
import { buildCategoryReport } from "./categoryReportRows";

const ALICE = "alice-id";
const BOB = "bob-id";

// One calendar month, so a monthly cap scales to exactly its own amount and the
// assertions below stay readable.
const FROM = new Date(2026, 7, 1);
const TO = new Date(2026, 8, 1);

function budget(patch: Partial<BudgetStatus> = {}): BudgetStatus {
    return {
        _id: "b1", categories: ["Groceries"], period: "monthly",
        spent: 0, item_count: 0, amount: 800, remaining: 800, percent: 0, over: false,
        by_person: [], sub_budgets: [],
        period_from: FROM.toISOString(), period_to: TO.toISOString(),
        ...patch,
    };
}

function sub(personId: string, amount: number): SubBudgetStatus {
    return {
        _id: `sub-${personId}`, person_id: personId, person_name: personId,
        amount, spent: 0, remaining: amount, percent: 0, over: false, item_count: 0,
    };
}

const base = {
    byCategory: [
        { category: "Groceries", total: 620, count: 12 },
        { category: "Dining", total: 240, count: 5 },
    ],
    byCategoryPeriod: [],
    uncategorised: { total: 0, count: 0 },
    uncategorisedByPeriod: [],
    // One bucket, so nothing pivots unless a test asks for it.
    periodKeys: ["2026-08"],
    rangeFrom: FROM,
    rangeTo: TO,
};

describe("buildCategoryReport", () => {
    it("puts a single-category budget on that category's row", () => {
        const { rows } = buildCategoryReport({ ...base, budgets: [budget()] });
        const groceries = rows.find((r) => r.label === "Groceries");
        expect(groceries).toMatchObject({ spent: 620, budgeted: 800 });
    });

    it("leaves a category with no budget without one, rather than showing zero", () => {
        const { rows } = buildCategoryReport({ ...base, budgets: [budget()] });
        expect(rows.find((r) => r.label === "Dining")?.budgeted).toBeUndefined();
    });

    it("gives a category a row when it is budgeted but unspent", () => {
        const { rows } = buildCategoryReport({
            ...base, budgets: [budget({ categories: ["Travel"], amount: 500 })],
        });
        expect(rows.find((r) => r.label === "Travel")).toMatchObject({ spent: 0, budgeted: 500 });
    });

    it("matches a budget to its category regardless of spelling", () => {
        const { rows } = buildCategoryReport({
            ...base, budgets: [budget({ categories: ["groceries"] })],
        });
        // The item spelling wins for display, and there is still only one row.
        expect(rows.filter((r) => r.label.toLowerCase() === "groceries")).toHaveLength(1);
        expect(rows.find((r) => r.label === "Groceries")?.budgeted).toBe(800);
    });

    it("sums two budgets that cap the same single category", () => {
        const { rows } = buildCategoryReport({
            ...base,
            budgets: [budget({ _id: "a", amount: 800 }), budget({ _id: "b", amount: 200 })],
        });
        expect(rows.find((r) => r.label === "Groceries")?.budgeted).toBe(1000);
    });

    it("keeps a multi-category budget off the category rows and on its own line", () => {
        const { rows, spanning } = buildCategoryReport({
            ...base,
            budgets: [budget({ categories: ["Groceries", "Dining"], amount: 1000 })],
        });
        expect(rows.every((r) => r.budgeted === undefined)).toBe(true);
        expect(spanning).toHaveLength(1);
        expect(spanning[0]).toMatchObject({
            label: "Groceries + Dining",
            budgeted: 1000,
            // The two categories' spend, restated - not new money.
            spent: 860,
        });
    });

    it("counts a whole-book budget separately from any category", () => {
        const { rows, spanning, wholeBook, totalBudgeted } = buildCategoryReport({
            ...base, budgets: [budget({ categories: [], amount: 3000 })],
        });
        expect(wholeBook).toBe(3000);
        expect(totalBudgeted).toBe(3000);
        expect(spanning).toHaveLength(0);
        expect(rows.every((r) => r.budgeted === undefined)).toBe(true);
    });

    it("counts every budget exactly once in the total", () => {
        const { totalBudgeted } = buildCategoryReport({
            ...base,
            budgets: [
                budget({ _id: "a", categories: ["Groceries"], amount: 800 }),
                budget({ _id: "b", categories: ["Groceries", "Dining"], amount: 1000 }),
                budget({ _id: "c", categories: [], amount: 3000 }),
            ],
        });
        expect(totalBudgeted).toBe(4800);
    });

    it("scales the budget to the range rather than showing one period's cap", () => {
        // A full year of an $800 monthly cap.
        const { rows, totalBudgeted } = buildCategoryReport({
            ...base, budgets: [budget()],
            rangeFrom: new Date(2026, 0, 1), rangeTo: new Date(2027, 0, 1),
        });
        expect(rows.find((r) => r.label === "Groceries")?.budgeted).toBeCloseTo(9600, 6);
        expect(totalBudgeted).toBeCloseTo(9600, 6);
    });

    it("adds an uncategorised row only when there is something in it", () => {
        const without = buildCategoryReport({ ...base, budgets: [] });
        expect(without.rows.some((r) => r.label === "Uncategorised")).toBe(false);

        const withSome = buildCategoryReport({
            ...base, budgets: [], uncategorised: { total: 95, count: 3 },
        });
        const row = withSome.rows.find((r) => r.label === "Uncategorised");
        expect(row?.spent).toBe(95);
        expect(row?.budgeted).toBeUndefined();
        // Always last, whatever it cost.
        expect(withSome.rows[withSome.rows.length - 1].label).toBe("Uncategorised");
    });

    it("orders categories by spend, biggest first", () => {
        const { rows } = buildCategoryReport({ ...base, budgets: [] });
        expect(rows.map((r) => r.label)).toEqual(["Groceries", "Dining"]);
    });

    it("reports nothing budgeted when no budget sets an overall cap", () => {
        const personalOnly = budget({
            amount: undefined, remaining: undefined, percent: undefined, over: undefined,
            sub_budgets: [sub(ALICE, 200)],
        });
        const { hasBudgets, totalBudgeted } = buildCategoryReport({
            ...base, budgets: [personalOnly],
        });
        expect(hasBudgets).toBe(false);
        expect(totalBudgeted).toBe(0);
    });

    describe("narrowed to one member", () => {
        it("uses that member's own limit, not the household cap", () => {
            const shared = budget({ amount: 800, sub_budgets: [sub(ALICE, 200), sub(BOB, 150)] });
            const { rows, totalBudgeted } = buildCategoryReport({
                ...base, budgets: [shared], personId: ALICE,
            });
            expect(rows.find((r) => r.label === "Groceries")?.budgeted).toBe(200);
            expect(totalBudgeted).toBe(200);
        });

        it("gives no budget figure for a household cap they have no limit inside", () => {
            const shared = budget({ amount: 800, sub_budgets: [] });
            const { rows, hasBudgets } = buildCategoryReport({
                ...base, budgets: [shared], personId: ALICE,
            });
            expect(rows.find((r) => r.label === "Groceries")?.budgeted).toBeUndefined();
            expect(hasBudgets).toBe(false);
        });

        it("ignores a budget that only caps somebody else", () => {
            const bobsOwn = budget({
                amount: undefined, remaining: undefined, percent: undefined, over: undefined,
                sub_budgets: [sub(BOB, 150)],
            });
            const { totalBudgeted } = buildCategoryReport({
                ...base, budgets: [bobsOwn], personId: ALICE,
            });
            expect(totalBudgeted).toBe(0);
        });
    });
});

describe("period columns", () => {
    const MONTHS = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);

    const yearly = {
        ...base,
        periodKeys: MONTHS,
        byCategoryPeriod: [
            { category: "Groceries", key: "2026-01", total: 300 },
            { category: "Groceries", key: "2026-02", total: 320 },
            { category: "Dining", key: "2026-02", total: 240 },
        ],
        rangeFrom: new Date(2026, 0, 1),
        rangeTo: new Date(2027, 0, 1),
    };

    it("hands back the columns to render when the range has a few buckets", () => {
        expect(buildCategoryReport({ ...yearly, budgets: [] }).periodKeys).toEqual(MONTHS);
    });

    it("reports no columns for a single bucket, so the table stays flat", () => {
        expect(buildCategoryReport({ ...base, budgets: [] }).periodKeys).toEqual([]);
    });

    it("reports no columns when there are too many buckets to read", () => {
        const days = Array.from({ length: 31 }, (_, i) => `2026-08-${String(i + 1).padStart(2, "0")}`);
        const { periodKeys, rows } = buildCategoryReport({
            ...base, budgets: [], periodKeys: days,
            byCategoryPeriod: [{ category: "Groceries", key: "2026-08-01", total: 50 }],
        });
        expect(periodKeys).toEqual([]);
        // And the cells aren't built at all, rather than built and discarded.
        expect(rows.find((r) => r.label === "Groceries")?.byPeriod).toEqual({});
    });

    it("fills each category's cells from the cross-tab", () => {
        const { rows } = buildCategoryReport({ ...yearly, budgets: [] });
        expect(rows.find((r) => r.label === "Groceries")?.byPeriod)
            .toEqual({ "2026-01": 300, "2026-02": 320 });
        expect(rows.find((r) => r.label === "Dining")?.byPeriod).toEqual({ "2026-02": 240 });
    });

    it("adds the member categories' cells together on a spanning row", () => {
        const { spanning } = buildCategoryReport({
            ...yearly,
            budgets: [budget({ categories: ["Groceries", "Dining"], amount: 1000 })],
        });
        expect(spanning[0].byPeriod).toEqual({ "2026-01": 300, "2026-02": 560 });
    });

    it("matches cross-tab rows to categories case-insensitively", () => {
        const { rows } = buildCategoryReport({
            ...yearly,
            byCategoryPeriod: [{ category: "groceries", key: "2026-01", total: 300 }],
            budgets: [],
        });
        expect(rows.find((r) => r.label === "Groceries")?.byPeriod).toEqual({ "2026-01": 300 });
    });

    it("gives the uncategorised row its own cells", () => {
        const { rows } = buildCategoryReport({
            ...yearly,
            budgets: [],
            uncategorised: { total: 95, count: 3 },
            uncategorisedByPeriod: [{ key: "2026-03", total: 95 }],
        });
        expect(rows.find((r) => r.label === "Uncategorised")?.byPeriod).toEqual({ "2026-03": 95 });
    });

    it("leaves a category with no spend in a bucket with no cell for it", () => {
        const { rows } = buildCategoryReport({ ...yearly, budgets: [] });
        expect(rows.find((r) => r.label === "Dining")?.byPeriod["2026-01"]).toBeUndefined();
    });
});
