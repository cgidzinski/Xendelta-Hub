import { describe, it, expect } from "vitest";
import type { BudgetStatus } from "../../../../../hooks/xenbudget/types";
import { restateBudgetToUnit, scaleBudgetToRange } from "./scaleBudgetToRange";

/** A $600/yr budget with $60 spent, which is the plan's worked example. */
function budget(over: Partial<BudgetStatus> = {}): BudgetStatus {
    return {
        _id: "b1",
        categories: ["Groceries"],
        measures: "expense",
        period: "yearly",
        spent: 60,
        item_count: 3,
        amount: 600,
        by_person: [],
        sub_budgets: [],
        period_from: "2026-01-01T00:00:00.000Z",
        period_to: "2027-01-01T00:00:00.000Z",
        ...over,
    };
}

describe("restateBudgetToUnit", () => {
    it("reads $50 a month in February exactly as in January", () => {
        // The requirement the nominal conversion exists for. Prorating by real days gave
        // February a smaller allowance than January purely because it is shorter.
        const perMonth = restateBudgetToUnit(budget(), "month");
        expect(perMonth!.amount).toBe(50);
        // The unit is the only input, so there is no January/February to disagree about.
        expect(restateBudgetToUnit(budget(), "month")!.amount).toBe(50);
    });

    it("recomputes remaining, percent and over from the restated amount", () => {
        const perMonth = restateBudgetToUnit(budget(), "month")!;
        expect(perMonth.amount).toBe(50);
        expect(perMonth.remaining).toBe(-10);   // 50 - 60
        expect(perMonth.percent).toBe(120);     // uncapped, matching the server
        expect(perMonth.over).toBe(true);

        const perYear = restateBudgetToUnit(budget(), "year")!;
        expect(perYear.amount).toBe(600);
        expect(perYear.remaining).toBe(540);
        expect(perYear.percent).toBe(10);
        expect(perYear.over).toBe(false);
    });

    it("leaves spend alone - the allowance is nominal, the spending is real", () => {
        for (const unit of ["day", "week", "month", "quarter", "year"] as const) {
            expect(restateBudgetToUnit(budget(), unit)!.spent).toBe(60);
        }
    });

    it("restates each person's limit on the same footing", () => {
        const withSubs = budget({
            sub_budgets: [
                { person_id: "u1", amount: 240, spent: 30, remaining: 210, percent: 13, over: false, item_count: 2 },
            ],
        } as Partial<BudgetStatus>);

        const sub = restateBudgetToUnit(withSubs, "month")!.sub_budgets[0];
        expect(sub.amount).toBe(20);      // 240/yr -> 20/mo
        expect(sub.spent).toBe(30);       // untouched
        expect(sub.remaining).toBe(-10);
        expect(sub.over).toBe(true);
    });

    it("leaves a budget with no overall amount without one", () => {
        const peopleOnly = restateBudgetToUnit(budget({ amount: undefined }), "month")!;
        expect(peopleOnly.amount).toBeUndefined();
    });

    it("never touches `periods` - those are whole own-periods, already measured", () => {
        const periods = [{
            from: "2025-01-01T00:00:00.000Z", to: "2026-01-01T00:00:00.000Z",
            spent: 400, item_count: 9,
        }];
        const restated = restateBudgetToUnit(budget({ periods } as Partial<BudgetStatus>), "month")!;
        expect(restated.periods).toEqual(periods);
    });

    it("hands a one-off custom budget back, so the caller range-scales it instead", () => {
        // A fixed window has no repeating period, so there is no nominal rate to state.
        expect(restateBudgetToUnit(budget({ period: "custom" }), "month")).toBeNull();
    });
});

describe("scaleBudgetToRange", () => {
    it("still prorates an arbitrary span, which is what it is for", () => {
        // Three months of a $600 yearly budget is a clean 3/12 - month-aligned periods count
        // calendar months, never days (see budgetForRange).
        const q1 = scaleBudgetToRange(
            budget(), new Date("2026-01-01T00:00:00Z"), new Date("2026-04-01T00:00:00Z"),
        );
        expect(q1.amount).toBe(150);
        expect(q1.spent).toBe(60);
        expect(q1.remaining).toBe(90);
    });
});
