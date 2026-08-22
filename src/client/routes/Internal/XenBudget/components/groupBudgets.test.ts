import { describe, it, expect } from "vitest";
import { groupBudgets } from "./groupBudgets";
import type { BudgetStatus } from "../../../../hooks/xenbudget/types";

function budget(overrides: Partial<BudgetStatus> & Pick<BudgetStatus, "amount">): BudgetStatus {
    return {
        _id: Math.random().toString(36).slice(2),
        categories: [],
        spent: 0,
        remaining: overrides.amount,
        percent: 0,
        over: false,
        item_count: 0,
        period: "monthly",
        period_from: "2026-08-01T00:00:00.000Z",
        period_to: "2026-08-31T23:59:59.999Z",
        ...overrides,
    };
}

describe("groupBudgets", () => {
    it("groups duplicate budgets under one heading while keeping each budget separate", () => {
        const groups = groupBudgets([
            budget({ amount: 300, categories: ["Rent"] }),
            budget({ amount: 200, categories: ["Rent"] }),
        ]);
        expect(groups).toHaveLength(1);
        expect(groups[0].categories).toEqual(["Rent"]);
        expect(groups[0].budgets).toHaveLength(2);
    });

    it("groups multiple 'no category' budgets under one Everything heading", () => {
        const groups = groupBudgets([budget({ amount: 100 }), budget({ amount: 50 })]);
        expect(groups).toHaveLength(1);
        expect(groups[0].label).toBe("Everything");
        expect(groups[0].budgets).toHaveLength(2);
    });

    it("keeps the same category separate when the person differs", () => {
        const groups = groupBudgets([
            budget({ amount: 100, categories: ["Rent"] }),
            budget({ amount: 100, categories: ["Rent"], person_id: "p1", person_name: "Alice" }),
        ]);
        expect(groups).toHaveLength(2);
    });

    it("orders groups alphabetically by category, with Everything first", () => {
        const groups = groupBudgets([
            budget({ amount: 100, categories: ["Transport"] }),
            budget({ amount: 100, categories: ["Rent"] }),
            budget({ amount: 100 }),
        ]);
        expect(groups.map((g) => g.label)).toEqual(["Everything", "Rent", "Transport"]);
    });
});
