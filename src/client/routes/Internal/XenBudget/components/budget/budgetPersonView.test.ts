import { describe, it, expect } from "vitest";
import type { BudgetStatus, SubBudgetStatus } from "../../../../../hooks/xenbudget/types";
import { budgetsForPerson, personShare } from "./budgetPersonView";

const ALICE = "alice-id";
const BOB = "bob-id";

function sub(personId: string, name: string): SubBudgetStatus {
    return {
        _id: `sub-${personId}`, person_id: personId, person_name: name,
        amount: 200, spent: 80, remaining: 120, percent: 40, over: false, item_count: 2,
    };
}

function budget(patch: Partial<BudgetStatus> = {}): BudgetStatus {
    return {
        _id: "b1", categories: ["Groceries"], kind: "cap", period: "monthly",
        spent: 500, item_count: 9, amount: 800, remaining: 300, percent: 63, over: false,
        by_person: [
            { user_id: ALICE, username: "Alice", amount: 310 },
            { user_id: BOB, username: "Bob", amount: 190 },
        ],
        sub_budgets: [],
        period_from: "2026-08-01T00:00:00.000Z", period_to: "2026-09-01T00:00:00.000Z",
        ...patch,
    };
}

describe("budgetsForPerson", () => {
    it("keeps a shared limit for someone with no personal limit of their own", () => {
        // A household cap constrains everyone in the book, so it is still their business.
        const shared = budget({ sub_budgets: [] });
        expect(budgetsForPerson([shared], ALICE)).toHaveLength(1);
    });

    it("strips other people's rows from a budget it keeps", () => {
        const both = budget({ sub_budgets: [sub(ALICE, "Alice"), sub(BOB, "Bob")] });
        const [result] = budgetsForPerson([both], ALICE);
        expect(result.sub_budgets.map((s) => s.person_id)).toEqual([ALICE]);
    });

    it("keeps a personal-only budget for the person it caps", () => {
        const personalOnly = budget({
            amount: undefined, remaining: undefined, percent: undefined, over: undefined,
            sub_budgets: [sub(BOB, "Bob")],
        });
        expect(budgetsForPerson([personalOnly], BOB)).toHaveLength(1);
    });

    it("drops a personal-only budget that caps somebody else", () => {
        const bobsOwn = budget({
            amount: undefined, remaining: undefined, percent: undefined, over: undefined,
            sub_budgets: [sub(BOB, "Bob")],
        });
        expect(budgetsForPerson([bobsOwn], ALICE)).toEqual([]);
    });

    it("leaves the shared figures alone - they are still household totals", () => {
        const [result] = budgetsForPerson([budget()], ALICE);
        expect(result.spent).toBe(500);
        expect(result.amount).toBe(800);
        expect(result.percent).toBe(63);
    });

    it("does not mutate the budgets it was given", () => {
        const original = budget({ sub_budgets: [sub(ALICE, "Alice"), sub(BOB, "Bob")] });
        budgetsForPerson([original], ALICE);
        expect(original.sub_budgets).toHaveLength(2);
    });

    it("returns nothing for a member no budget touches", () => {
        const bobsOwn = budget({
            amount: undefined, remaining: undefined, percent: undefined, over: undefined,
            sub_budgets: [sub(BOB, "Bob")],
        });
        expect(budgetsForPerson([bobsOwn], "carol-id")).toEqual([]);
    });
});

describe("personShare", () => {
    it("reads a member's slice out of by_person", () => {
        expect(personShare(budget(), ALICE)).toBe(310);
    });

    it("is zero for a member who spent nothing", () => {
        expect(personShare(budget(), "carol-id")).toBe(0);
        expect(personShare(budget({ by_person: [] }), ALICE)).toBe(0);
    });
});
