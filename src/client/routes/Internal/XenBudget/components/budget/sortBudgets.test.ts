import { describe, it, expect } from "vitest";
import type { BudgetStatus, SubBudgetStatus } from "../../../../../hooks/xenbudget/types";
import { sortBudgets, worstPercent, isOver, overCount, budgetLabel } from "./sortBudgets";

function sub(percent: number, over = false): SubBudgetStatus {
    return {
        _id: `s${percent}`, person_id: "u1", person_name: "Alice",
        amount: 100, spent: percent, remaining: 100 - percent, percent, over, item_count: 1,
    };
}

function budget(over: Partial<BudgetStatus> = {}): BudgetStatus {
    return {
        _id: "b1", categories: ["Groceries"], period: "monthly",
        spent: 50, item_count: 3, amount: 100, remaining: 50, percent: 50, over: false,
        by_person: [], sub_budgets: [],
        period_from: "2026-08-01T00:00:00.000Z", period_to: "2026-09-01T00:00:00.000Z",
        ...over,
    };
}

describe("worstPercent", () => {
    it("takes the overall limit when it is the tightest", () => {
        expect(worstPercent(budget({ percent: 90, sub_budgets: [sub(40)] }))).toBe(90);
    });

    it("takes a person's limit when theirs is tighter", () => {
        expect(worstPercent(budget({ percent: 30, sub_budgets: [sub(40), sub(95)] }))).toBe(95);
    });

    it("reads a budget with no overall limit off its people alone", () => {
        const personalOnly = budget({
            amount: undefined, remaining: undefined, percent: undefined, over: undefined,
            sub_budgets: [sub(70)],
        });
        expect(worstPercent(personalOnly)).toBe(70);
    });

    it("is zero when nothing is capped", () => {
        expect(worstPercent(budget({
            amount: undefined, remaining: undefined, percent: undefined, over: undefined,
        }))).toBe(0);
    });
});

describe("isOver / overCount", () => {
    it("counts a person past their limit even when the overall one is fine", () => {
        const b = budget({ over: false, sub_budgets: [sub(120, true), sub(30)] });
        expect(isOver(b)).toBe(true);
        expect(overCount(b)).toBe(1);
    });

    it("counts the overall limit and each person separately", () => {
        const b = budget({ over: true, sub_budgets: [sub(120, true), sub(140, true)] });
        expect(overCount(b)).toBe(3);
    });

    it("is false when everything is inside its cap", () => {
        expect(isOver(budget({ sub_budgets: [sub(50)] }))).toBe(false);
    });
});

describe("budgetLabel", () => {
    it("names the categories, or the whole book", () => {
        expect(budgetLabel(budget({ categories: ["Dining", "Groceries"] }))).toBe("Dining, Groceries");
        expect(budgetLabel(budget({ categories: [] }))).toBe("Everything");
    });
});

describe("sortBudgets", () => {
    it("puts over budget first, then near the limit, then the rest", () => {
        const ok = budget({ _id: "ok", categories: ["Apples"], percent: 10 });
        const near = budget({ _id: "near", categories: ["Zucchini"], percent: 85 });
        const over = budget({ _id: "over", categories: ["Mangoes"], percent: 130, over: true });
        expect(sortBudgets([ok, near, over]).map((b) => b._id)).toEqual(["over", "near", "ok"]);
    });

    it("orders alphabetically inside a band rather than by percentage", () => {
        const b1 = budget({ _id: "z", categories: ["Zucchini"], percent: 12 });
        const b2 = budget({ _id: "a", categories: ["Apples"], percent: 70 });
        expect(sortBudgets([b1, b2]).map((b) => b._id)).toEqual(["a", "z"]);
    });

    it("promotes a budget whose only trouble is one person's limit", () => {
        const clean = budget({ _id: "clean", categories: ["Apples"], percent: 20 });
        const personOver = budget({
            _id: "person", categories: ["Zucchini"], percent: 20, sub_budgets: [sub(150, true)],
        });
        expect(sortBudgets([clean, personOver]).map((b) => b._id)).toEqual(["person", "clean"]);
    });

    it("does not mutate its input", () => {
        const list = [budget({ _id: "b" , categories: ["B"] }), budget({ _id: "a", categories: ["A"] })];
        sortBudgets(list);
        expect(list.map((b) => b._id)).toEqual(["b", "a"]);
    });
});
