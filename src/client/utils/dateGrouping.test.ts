import { describe, it, expect } from "vitest";
import { groupByDay } from "./dateGrouping";
import { settlementsNewestFirst } from "../../shared/xensplit/rewind";

// groupByDay only ever merges into the LAST group, so it produces one header per
// *run* of same-day items, not one per day. Feeding it an unsorted list silently
// yields duplicate headers rather than an error — these pin the pairing the
// Settlements history relies on (settlementsNewestFirst -> groupByDay).
describe("groupByDay over settlementsNewestFirst output", () => {
    const settlement = (_id: string, settled_at: string) => ({
        _id, from: "B", to: "A", amount: 10, currency: "CAD", settled_at,
    });

    it("emits one group per day, newest day first", () => {
        const ordered = settlementsNewestFirst([
            settlement("b", "2025-06-05T12:00:00.000Z"),
            settlement("a", "2025-06-09T12:00:00.000Z"),
            settlement("c", "2025-06-01T12:00:00.000Z"),
        ]);
        const groups = groupByDay(ordered, (s) => s.settled_at);
        expect(groups).toHaveLength(3);
        expect(groups.flatMap((g) => g.items.map((s) => s._id))).toEqual(["a", "b", "c"]);
    });

    it("puts several settlements from one day under a single header", () => {
        const ordered = settlementsNewestFirst([
            settlement("morning", "2025-06-05T09:00:00.000Z"),
            settlement("evening", "2025-06-05T21:00:00.000Z"),
            settlement("older", "2025-06-01T12:00:00.000Z"),
        ]);
        const groups = groupByDay(ordered, (s) => s.settled_at);
        expect(groups).toHaveLength(2);
        expect(groups[0].items.map((s) => s._id)).toEqual(["evening", "morning"]);
        expect(groups[1].items.map((s) => s._id)).toEqual(["older"]);
    });

    it("still groups correctly after the history filters, which never reorder", () => {
        const ordered = settlementsNewestFirst([
            { _id: "mine", from: "me", to: "A", amount: 10, currency: "CAD", settled_at: "2025-06-09T12:00:00.000Z" },
            { _id: "theirs", from: "B", to: "C", amount: 20, currency: "CAD", settled_at: "2025-06-05T12:00:00.000Z" },
            { _id: "mine2", from: "A", to: "me", amount: 30, currency: "CAD", settled_at: "2025-06-01T12:00:00.000Z" },
        ]);
        const filtered = ordered.filter((s) => s.from === "me" || s.to === "me");
        const groups = groupByDay(filtered, (s) => s.settled_at);
        expect(groups.map((g) => g.items.map((i) => i._id))).toEqual([["mine"], ["mine2"]]);
    });

    it("would emit a duplicate header if the list were not sorted first", () => {
        // Documents why the component must group settlementsNewestFirst output and
        // not the raw group.settlements array.
        const unsorted = [
            settlement("a", "2025-06-09T12:00:00.000Z"),
            settlement("b", "2025-06-01T12:00:00.000Z"),
            settlement("c", "2025-06-09T18:00:00.000Z"),
        ];
        expect(groupByDay(unsorted, (s) => s.settled_at)).toHaveLength(3);
        expect(groupByDay(settlementsNewestFirst(unsorted), (s) => s.settled_at)).toHaveLength(2);
    });
});
