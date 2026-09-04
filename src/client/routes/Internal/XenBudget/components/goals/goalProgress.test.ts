import { describe, it, expect } from "vitest";
import { goalProgress, sortGoals, goalTotals } from "./goalProgress";
import type { XenBudgetSavingsGoal } from "../../../../../hooks/xenbudget/types";

function goal(over: Partial<XenBudgetSavingsGoal> = {}): XenBudgetSavingsGoal {
    return {
        _id: "g1",
        name: "New car",
        target_amount: 20000,
        currency: "CAD",
        status: "active",
        saved: 0,
        contribution_count: 0,
        by_person: [],
        created_by: "u1",
        created_at: "2026-01-01T00:00:00.000Z",
        ...over,
    };
}

describe("goalProgress", () => {
    it("reports what is left and how far along", () => {
        expect(goalProgress(4500, 20000)).toEqual({ remaining: 15500, percent: 23, reached: false });
    });

    it("leaves the percentage uncapped so the bar can draw the overflow", () => {
        expect(goalProgress(26000, 20000).percent).toBe(130);
    });

    it("goes negative on remaining once the target is passed", () => {
        expect(goalProgress(21000, 20000).remaining).toBe(-1000);
    });

    it("counts landing exactly on the target as reached", () => {
        expect(goalProgress(20000, 20000).reached).toBe(true);
    });

    it("does not divide by a zero target", () => {
        expect(goalProgress(0, 0)).toEqual({ remaining: 0, percent: 0, reached: false });
        expect(goalProgress(50, 0).percent).toBe(100);
    });

    it("rounds remaining to cents rather than carrying float drift", () => {
        expect(goalProgress(0.1, 0.3).remaining).toBe(0.2);
    });
});

describe("sortGoals", () => {
    it("puts active goals before completed ones and archived last", () => {
        const sorted = sortGoals([
            goal({ _id: "a", name: "Archived", status: "archived" }),
            goal({ _id: "c", name: "Completed", status: "completed" }),
            goal({ _id: "v", name: "Active", status: "active" }),
        ]);
        expect(sorted.map((g) => g._id)).toEqual(["v", "c", "a"]);
    });

    it("leads with the goal nearest to done - the opposite of how budgets sort", () => {
        const sorted = sortGoals([
            goal({ _id: "early", name: "Early", saved: 1000 }),
            goal({ _id: "nearly", name: "Nearly", saved: 19000 }),
            goal({ _id: "half", name: "Half", saved: 10000 }),
        ]);
        expect(sorted.map((g) => g._id)).toEqual(["nearly", "half", "early"]);
    });

    it("breaks ties on name, so the order is stable between renders", () => {
        const sorted = sortGoals([
            goal({ _id: "b", name: "Boat" }),
            goal({ _id: "a", name: "Attic" }),
        ]);
        expect(sorted.map((g) => g._id)).toEqual(["a", "b"]);
    });

    it("does not mutate what it was given", () => {
        const goals = [goal({ _id: "b", name: "Boat" }), goal({ _id: "a", name: "Attic" })];
        sortGoals(goals);
        expect(goals.map((g) => g._id)).toEqual(["b", "a"]);
    });
});

describe("goalTotals", () => {
    it("adds up the active goals only", () => {
        const totals = goalTotals([
            goal({ saved: 1000, target_amount: 5000 }),
            goal({ saved: 500, target_amount: 2000 }),
            goal({ saved: 900, target_amount: 900, status: "completed" }),
        ]);
        expect(totals).toEqual({ saved: 1500, target: 7000, activeCount: 2, completedCount: 1 });
    });

    it("counts archived goals in neither tally", () => {
        const totals = goalTotals([goal({ saved: 10, target_amount: 20, status: "archived" })]);
        expect(totals).toEqual({ saved: 0, target: 0, activeCount: 0, completedCount: 0 });
    });
});
