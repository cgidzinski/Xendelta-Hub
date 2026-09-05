import { describe, it, expect } from "vitest";
import { bankProgress, bankCaption, sortPiggyBanks, bankTotals } from "./piggyBankProgress";
import type { XenBudgetPiggyBank } from "../../../../../hooks/xenbudget/types";

function bank(over: Partial<XenBudgetPiggyBank> = {}): XenBudgetPiggyBank {
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

describe("bankProgress", () => {
    it("reports what is left and how far along", () => {
        expect(bankProgress(4500, 20000)).toEqual({ remaining: 15500, percent: 23, reached: false });
    });

    it("leaves the percentage uncapped so the bar can draw the overflow", () => {
        expect(bankProgress(26000, 20000).percent).toBe(130);
    });

    it("goes negative on remaining once the target is passed", () => {
        expect(bankProgress(21000, 20000).remaining).toBe(-1000);
    });

    it("counts landing exactly on the target as reached", () => {
        expect(bankProgress(20000, 20000).reached).toBe(true);
    });

    it("does not divide by a zero target", () => {
        expect(bankProgress(0, 0)).toEqual({ remaining: 0, percent: 0, reached: false });
        expect(bankProgress(50, 0).percent).toBe(100);
    });

    it("rounds remaining to cents rather than carrying float drift", () => {
        expect(bankProgress(0.1, 0.3).remaining).toBe(0.2);
    });
});

describe("bankCaption", () => {
    const money = (v: number) => `$${v}`;

    it("says what is still owed while the target is short", () => {
        expect(bankCaption(15500, 23, money)).toBe("$15500 to go · 23%");
    });

    it("says TARGET, not minimum - the word the budget floor uses", () => {
        // The whole reason this lives here and not in budgetKind: renaming the budget's
        // wording must never retitle a piggy bank's card.
        expect(bankCaption(-1000, 105, money)).toBe("$1000 past target · 105%");
    });

    it("reads exactly on target as past it, not as still owing", () => {
        expect(bankCaption(0, 100, money)).toBe("$0 past target · 100%");
    });
});

describe("sortPiggyBanks", () => {
    it("puts active banks before completed ones and archived last", () => {
        const sorted = sortPiggyBanks([
            bank({ _id: "a", name: "Archived", status: "archived" }),
            bank({ _id: "c", name: "Completed", status: "completed" }),
            bank({ _id: "v", name: "Active", status: "active" }),
        ]);
        expect(sorted.map((g) => g._id)).toEqual(["v", "c", "a"]);
    });

    it("leads with the bank nearest to done - the opposite of how budgets sort", () => {
        const sorted = sortPiggyBanks([
            bank({ _id: "early", name: "Early", saved: 1000 }),
            bank({ _id: "nearly", name: "Nearly", saved: 19000 }),
            bank({ _id: "half", name: "Half", saved: 10000 }),
        ]);
        expect(sorted.map((g) => g._id)).toEqual(["nearly", "half", "early"]);
    });

    it("breaks ties on name, so the order is stable between renders", () => {
        const sorted = sortPiggyBanks([
            bank({ _id: "b", name: "Boat" }),
            bank({ _id: "a", name: "Attic" }),
        ]);
        expect(sorted.map((g) => g._id)).toEqual(["a", "b"]);
    });

    it("does not mutate what it was given", () => {
        const banks = [bank({ _id: "b", name: "Boat" }), bank({ _id: "a", name: "Attic" })];
        sortPiggyBanks(banks);
        expect(banks.map((g) => g._id)).toEqual(["b", "a"]);
    });
});

describe("bankTotals", () => {
    it("adds up the active banks only", () => {
        const totals = bankTotals([
            bank({ saved: 1000, target_amount: 5000 }),
            bank({ saved: 500, target_amount: 2000 }),
            bank({ saved: 900, target_amount: 900, status: "completed" }),
        ]);
        expect(totals).toEqual({ saved: 1500, target: 7000, activeCount: 2, completedCount: 1 });
    });

    it("counts archived banks in neither tally", () => {
        const totals = bankTotals([bank({ saved: 10, target_amount: 20, status: "archived" })]);
        expect(totals).toEqual({ saved: 0, target: 0, activeCount: 0, completedCount: 0 });
    });
});
