import { describe, it, expect } from "vitest";
import { routineStatusBucket, pendingOccurrences, projectOccurrences, recentCompletions } from "./routineViews";
import type { Routine } from "./useRoutines";

const now = new Date("2026-06-10T12:00:00Z");
const iso = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();

const routine = (over: Partial<Routine> = {}): Routine => ({
    _id: "r1", name: "Filter", category: "", notes: "", interval: { every: 3, unit: "months" },
    last_done_at: null, due_at: iso(1), enabled: true, remind_again_days: 3, status: "ok", is_owner: true,
    my_notifications: null, members: [], history: [], done_ahead_indices: [], ...over,
});

describe("routineStatusBucket", () => {
    it("buckets by distance from now", () => {
        expect(routineStatusBucket({ due_at: iso(-2) }, now)).toBe("overdue");
        expect(routineStatusBucket({ due_at: iso(3) }, now)).toBe("soon");
        expect(routineStatusBucket({ due_at: iso(20) }, now)).toBe("month");
        expect(routineStatusBucket({ due_at: iso(45) }, now)).toBe("later");
    });
});

describe("projectOccurrences", () => {
    const weekly = { interval: { every: 1, unit: "weeks" as const } };
    it("lists every weekly occurrence inside 30 days, the first being the real due date", () => {
        const occ = projectOccurrences(routine({ ...weekly, due_at: iso(0) }), now);
        expect(occ).toHaveLength(5); // day 0, 7, 14, 21, 28
        expect(occ.map((o) => o.index)).toEqual([1, 2, 3, 4, 5]);
        expect(occ[0].date.toISOString()).toBe(iso(0));
    });
    it("a far-out monthly routine shows once, and more with a longer horizon", () => {
        const r = routine({ interval: { every: 1, unit: "months" }, due_at: iso(10) });
        expect(projectOccurrences(r, now)).toHaveLength(1);
        expect(projectOccurrences(r, now, 365)).toHaveLength(12);
    });
    it("keeps an overdue routine as its first occurrence", () => {
        const occ = projectOccurrences(routine({ ...weekly, due_at: iso(-3) }), now);
        expect(occ[0].index).toBe(1);
        expect(occ[0].date.getTime()).toBeLessThan(now.getTime());
        expect(occ.length).toBeGreaterThan(3);
    });
    it("caps a daily routine", () => {
        const r = routine({ interval: { every: 1, unit: "days" }, due_at: iso(0) });
        expect(projectOccurrences(r, now)).toHaveLength(12);
        expect(projectOccurrences(r, now, 365)).toHaveLength(60);
    });
    it("does not drift across month ends", () => {
        const r = routine({ interval: { every: 1, unit: "months" }, due_at: new Date(2026, 0, 31, 12).toISOString() });
        const occ = projectOccurrences(r, new Date(2026, 0, 1), 120);
        expect(occ.map((o) => o.date.getDate())).toEqual([31, 28, 31, 30]);
    });
    it("hides occurrences already completed ahead of time", () => {
        const occ = projectOccurrences(routine({ ...weekly, due_at: iso(0), done_ahead_indices: [3] }), now);
        expect(occ.map((o) => o.index)).toEqual([1, 2, 4, 5]);
    });
    it("is empty when the first due date is beyond the horizon", () => {
        expect(projectOccurrences(routine({ due_at: iso(90) }), now)).toHaveLength(0);
    });
});

describe("pendingOccurrences", () => {
    it("skips paused routines and sorts all occurrences by date", () => {
        const list = [
            routine({ _id: "w", interval: { every: 1, unit: "weeks" }, due_at: iso(2) }),
            routine({ _id: "m", interval: { every: 1, unit: "months" }, due_at: iso(5) }),
            routine({ _id: "p", due_at: iso(1), enabled: false }),
            routine({ _id: "over", interval: { every: 1, unit: "months" }, due_at: iso(-5) }),
        ];
        const out = pendingOccurrences(list, now);
        expect(out.some((o) => o.routine._id === "p")).toBe(false);
        expect(out[0].routine._id).toBe("over");
        const dates = out.map((o) => o.date.getTime());
        expect([...dates].sort((a, b) => a - b)).toEqual(dates);
    });
});

describe("pendingOccurrences simplified", () => {
    it("keeps only each routine's current occurrence", () => {
        const list = [
            routine({ _id: "w", interval: { every: 1, unit: "weeks" }, due_at: iso(1) }),
            routine({ _id: "m", interval: { every: 1, unit: "months" }, due_at: iso(3) }),
        ];
        const out = pendingOccurrences(list, now, 30, true);
        expect(out.map((o) => `${o.routine._id}:${o.index}`)).toEqual(["w:1", "m:1"]);
    });
});

describe("recentCompletions", () => {
    it("flattens done entries within the window, newest first", () => {
        const list = [
            routine({ _id: "a", name: "A", history: [
                { action: "done", at: iso(-2), by_username: "sam" },
                { action: "postponed", at: iso(-1), due_at: iso(5) },
                { action: "done", at: iso(-40) },
            ] }),
            routine({ _id: "b", name: "B", history: [{ action: "done", at: iso(-1), note: "new one" }] }),
        ];
        const out = recentCompletions(list, 30, now);
        expect(out.map((c) => c.routineName)).toEqual(["B", "A"]);
        expect(out[1].by_username).toBe("sam");
        expect(out[0].note).toBe("new one");
    });
});
