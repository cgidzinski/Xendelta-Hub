import { describe, it, expect } from "vitest";
import { splitDeleted } from "./splitDeleted";
import type { XenSplit, XenSplitExpense, XenSplitSettlement, XenSplitExchange } from "./types";

const expense = (_id: string, deleted_at?: string): XenSplitExpense => ({
    _id, paid_by: "A", amount: 10, currency: "CAD", title: _id,
    date: "2025-06-01T00:00:00.000Z", split_type: "equal", splits: [],
    ...(deleted_at ? { deleted_at } : {}),
});
const settlement = (_id: string, deleted_at?: string): XenSplitSettlement => ({
    _id, from: "A", to: "B", amount: 5, currency: "CAD",
    settled_at: "2025-06-02T00:00:00.000Z",
    ...(deleted_at ? { deleted_at } : {}),
});
const exchange = (_id: string, deleted_at?: string): XenSplitExchange => ({
    _id, party_a: "A", currency_a: "CAD", amount_a: 10,
    party_b: "B", currency_b: "USD", amount_b: 7, rate: 0.7,
    date: "2025-06-03T00:00:00.000Z", created_at: "2025-06-03T00:00:00.000Z",
    ...(deleted_at ? { deleted_at } : {}),
});

const DEL = "2025-06-10T00:00:00.000Z";

function group(overrides: Partial<XenSplit> = {}): XenSplit {
    return {
        _id: "g1", name: "Trip", default_currency: "CAD", secondary_currencies: [],
        created_by: "A", created_at: "2025-01-01T00:00:00.000Z", members: [],
        expenses: [], settlements: [], exchanges: [],
        ...overrides,
    } as XenSplit;
}

describe("splitDeleted", () => {
    it("narrows every ledger array to live records", () => {
        const result = splitDeleted(group({
            expenses: [expense("live"), expense("gone", DEL)],
            settlements: [settlement("s-live"), settlement("s-gone", DEL)],
            exchanges: [exchange("x-live"), exchange("x-gone", DEL)],
        }));

        expect(result.expenses.map((e) => e._id)).toEqual(["live"]);
        expect(result.settlements.map((s) => s._id)).toEqual(["s-live"]);
        expect(result.exchanges.map((x) => x._id)).toEqual(["x-live"]);
    });

    it("moves deleted records to group.deleted rather than dropping them", () => {
        const result = splitDeleted(group({
            expenses: [expense("live"), expense("gone", DEL)],
            settlements: [settlement("s-gone", DEL)],
            exchanges: [exchange("x-gone", DEL)],
        }));

        expect(result.deleted?.expenses.map((e) => e._id)).toEqual(["gone"]);
        expect(result.deleted?.settlements.map((s) => s._id)).toEqual(["s-gone"]);
        expect(result.deleted?.exchanges.map((x) => x._id)).toEqual(["x-gone"]);
    });

    it("always populates group.deleted, so consumers need no null guard on the arrays", () => {
        const result = splitDeleted(group());
        expect(result.deleted).toEqual({ expenses: [], settlements: [], exchanges: [] });
    });

    it("tolerates a group with no exchanges array", () => {
        const g = group();
        delete (g as Partial<XenSplit>).exchanges;
        const result = splitDeleted(g);
        expect(result.exchanges).toEqual([]);
        expect(result.deleted?.exchanges).toEqual([]);
    });

    it("does not mutate the input group", () => {
        const g = group({ expenses: [expense("live"), expense("gone", DEL)] });
        splitDeleted(g);
        expect(g.expenses).toHaveLength(2);
        expect(g.deleted).toBeUndefined();
    });
});
