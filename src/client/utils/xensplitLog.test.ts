import { describe, it, expect } from "vitest";
import { describeLogEntry } from "./xensplitLog";
import type { XenSplitLogEntry } from "../hooks/xensplit/types";

const names: Record<string, string> = { a: "Alex", b: "Blake", c: "Casey" };
const nameOf = (id: string) => names[id] ?? "Former member";

const entry = (over: Partial<XenSplitLogEntry>): XenSplitLogEntry => ({
    _id: "1",
    actor_id: "a",
    action: "group_created",
    changes: [],
    created_at: "2026-03-01T12:00:00.000Z",
    ...over,
});

describe("describeLogEntry", () => {
    it("describes a new expense with its amount", () => {
        const d = describeLogEntry(entry({ action: "expense_created", summary: "Groceries", meta: { amount: 42, currency: "CAD", paid_by: "a" } }), nameOf);
        expect(d.actor).toBe("Alex");
        expect(d.text).toBe('added "Groceries" (CA$42.00)');
    });

    it("lists each changed field of an edit", () => {
        const d = describeLogEntry(entry({
            action: "expense_updated",
            summary: "Groceries",
            meta: { amount: 42, currency: "USD" },
            changes: [
                { field: "amount", from: 40, to: 42 },
                { field: "paid_by", from: "a", to: "b" },
                { field: "date", from: "2026-03-01T00:00:00.000Z", to: "2026-03-02T00:00:00.000Z" },
                { field: "splits", from: [{ user_id: "a", amount_owed: 20 }, { user_id: "b", amount_owed: 20 }], to: [{ user_id: "a", percentage: 100 }] },
                { field: "category", from: null, to: "food" },
                { field: "notes", from: "x", to: "y" },
            ],
        }), nameOf);
        expect(d.text).toBe('edited "Groceries"');
        expect(d.details).toEqual([
            "Amount: $40.00 → $42.00",
            "Paid by: Alex → Blake",
            "Date: Mar 1, 2026 → Mar 2, 2026",
            "Shares: Alex $20.00, Blake $20.00 → Alex 100%",
            "Category: none → food",
            "Notes changed",
        ]);
    });

    it("attributes scheduler actions to the recurring schedule", () => {
        const d = describeLogEntry(entry({ actor_id: null, action: "recurring_generated", summary: "Rent", meta: { count: 3 } }), nameOf);
        expect(d.actor).toBe("Recurring schedule");
        expect(d.text).toBe('added 3 occurrences of "Rent"');
    });

    it("names both sides of a settlement, including members who have left", () => {
        const d = describeLogEntry(entry({ action: "settlement_deleted", meta: { from: "z", to: "c", amount: 10, currency: "CAD" } }), nameOf);
        expect(d.text).toBe("undid a settlement: Former member paid Casey CA$10.00");
    });

    it("distinguishes leaving from being removed", () => {
        expect(describeLogEntry(entry({ action: "member_removed", meta: { user_id: "a", left: true } }), nameOf).text).toBe("left the group");
        expect(describeLogEntry(entry({ action: "member_removed", meta: { user_id: "b", left: false } }), nameOf).text).toBe("removed Blake");
    });

    it("doesn't repeat the schedule state on a pause", () => {
        const d = describeLogEntry(entry({ action: "recurring_paused", summary: "Rent", changes: [{ field: "active", from: true, to: false }] }), nameOf);
        expect(d.details).toEqual([]);
    });
});
