import { describe, it, expect } from "vitest";
import { sortByMode, sortDateOf, nextSortMode, parseSortMode, DEFAULT_SORT } from "./activitySort";
import { groupByDay } from "../../../../utils/dateGrouping";

// A row whose two timestamps disagree: entered on `added`, dated `date`.
const row = (id: string, date: string, added: string) => ({ id, date, added });

// Typed up on the 10th, but backdated across three different months.
const rows = [
    row("jan", "2025-01-05T12:00:00.000Z", "2025-03-10T09:00:00.000Z"),
    row("mar", "2025-03-05T12:00:00.000Z", "2025-03-10T11:00:00.000Z"),
    row("feb", "2025-02-05T12:00:00.000Z", "2025-03-10T10:00:00.000Z"),
];

const ids = <T extends { id: string }>(list: T[]) => list.map((r) => r.id);

describe("sortByMode", () => {
    it("orders by transaction date, newest first", () => {
        expect(ids(sortByMode(rows, { field: "date", dir: "desc" }))).toEqual(["mar", "feb", "jan"]);
    });

    it("orders by transaction date, oldest first", () => {
        expect(ids(sortByMode(rows, { field: "date", dir: "asc" }))).toEqual(["jan", "feb", "mar"]);
    });

    it("orders by added date, newest first - which is not the transaction order", () => {
        expect(ids(sortByMode(rows, { field: "added", dir: "desc" }))).toEqual(["mar", "feb", "jan"]);
        // The two orders only coincide here by construction; flip one row to prove they differ.
        const shuffled = [rows[0], rows[1], row("feb", "2025-02-05T12:00:00.000Z", "2025-03-09T10:00:00.000Z")];
        expect(ids(sortByMode(shuffled, { field: "added", dir: "desc" }))).toEqual(["mar", "jan", "feb"]);
        expect(ids(sortByMode(shuffled, { field: "date", dir: "desc" }))).toEqual(["mar", "feb", "jan"]);
    });

    it("orders by added date, oldest first", () => {
        expect(ids(sortByMode(rows, { field: "added", dir: "asc" }))).toEqual(["jan", "feb", "mar"]);
    });

    it("does not mutate its input", () => {
        const input = [...rows];
        sortByMode(input, { field: "date", dir: "asc" });
        expect(ids(input)).toEqual(["jan", "mar", "feb"]);
    });

    it("falls back to the transaction date when a row was never stamped with an added date", () => {
        // Expenses written before created_at joined the schema have no value for it, so
        // callers pass `created_at ?? date` - such a row sorts by its transaction date.
        const legacy = row("legacy", "2025-04-01T12:00:00.000Z", "2025-04-01T12:00:00.000Z");
        expect(ids(sortByMode([...rows, legacy], { field: "added", dir: "desc" }))).toEqual([
            "legacy", "mar", "feb", "jan",
        ]);
    });
});

describe("sortDateOf", () => {
    it("picks the field the list is sorted on", () => {
        expect(sortDateOf(rows[0], "date")).toBe("2025-01-05T12:00:00.000Z");
        expect(sortDateOf(rows[0], "added")).toBe("2025-03-10T09:00:00.000Z");
    });
});

// groupByDay only ever merges into its LAST group, so an unsorted list silently yields
// duplicate headers. These pin the pairing both views rely on: sort, then group on the
// SAME field - see dateGrouping.test.ts for the settlements equivalent.
describe("groupByDay over sortByMode output", () => {
    it("emits one header per day in either direction", () => {
        for (const dir of ["desc", "asc"] as const) {
            const sorted = sortByMode(rows, { field: "date", dir });
            expect(groupByDay(sorted, (r) => sortDateOf(r, "date"))).toHaveLength(3);
        }
    });

    it("collapses a day's worth of rows under one header when sorted by added date", () => {
        // All three were entered on the same day, so added-date grouping yields one header.
        const sorted = sortByMode(rows, { field: "added", dir: "desc" });
        const groups = groupByDay(sorted, (r) => sortDateOf(r, "added"));
        expect(groups).toHaveLength(1);
        expect(ids(groups[0].items)).toEqual(["mar", "feb", "jan"]);
    });

    it("would emit duplicate headers if grouped on a different field than it was sorted on", () => {
        const sorted = sortByMode(rows, { field: "added", dir: "desc" });
        expect(groupByDay(sorted, (r) => sortDateOf(r, "date"))).toHaveLength(3);
        expect(groupByDay(sorted, (r) => sortDateOf(r, "added"))).toHaveLength(1);
    });
});

describe("nextSortMode", () => {
    it("reverses direction when the active button is pressed again (MUI reports null)", () => {
        expect(nextSortMode({ field: "date", dir: "desc" }, null)).toEqual({ field: "date", dir: "asc" });
        expect(nextSortMode({ field: "added", dir: "asc" }, null)).toEqual({ field: "added", dir: "desc" });
    });

    it("restarts at newest-first when switching field", () => {
        expect(nextSortMode({ field: "date", dir: "asc" }, "added")).toEqual({ field: "added", dir: "desc" });
    });

    it("is a no-op when the pressed field is already active", () => {
        const mode = { field: "date", dir: "asc" } as const;
        expect(nextSortMode(mode, "date")).toEqual(mode);
    });
});

describe("parseSortMode", () => {
    it("defaults when nothing is stored", () => {
        expect(parseSortMode(null)).toEqual(DEFAULT_SORT);
        expect(parseSortMode("")).toEqual(DEFAULT_SORT);
    });

    it("round-trips a stored mode", () => {
        expect(parseSortMode(JSON.stringify({ field: "added", dir: "asc" }))).toEqual({
            field: "added", dir: "asc",
        });
    });

    it("falls back for malformed or partial values", () => {
        expect(parseSortMode("not json")).toEqual(DEFAULT_SORT);
        expect(parseSortMode(JSON.stringify({ field: "nonsense" }))).toEqual(DEFAULT_SORT);
        expect(parseSortMode(JSON.stringify({ dir: "asc" }))).toEqual({ field: "date", dir: "asc" });
    });
});
