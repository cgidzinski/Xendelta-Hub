import { describe, it, expect } from "vitest";
import { routineStatusBucket, pendingRoutines, recentCompletions } from "./routineViews";
import type { Routine } from "./useRoutines";

const now = new Date("2026-06-10T12:00:00Z");
const iso = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString();

const routine = (over: Partial<Routine> = {}): Routine => ({
    _id: "r1", name: "Filter", category: "", notes: "", interval: { every: 3, unit: "months" },
    last_done_at: null, due_at: iso(1), enabled: true, remind_again_days: 3, status: "ok", is_owner: true,
    my_notifications: null, members: [], history: [], ...over,
});

describe("routineStatusBucket", () => {
    it("buckets by distance from now", () => {
        expect(routineStatusBucket({ due_at: iso(-2) }, now)).toBe("overdue");
        expect(routineStatusBucket({ due_at: iso(3) }, now)).toBe("soon");
        expect(routineStatusBucket({ due_at: iso(20) }, now)).toBe("month");
        expect(routineStatusBucket({ due_at: iso(45) }, now)).toBe("later");
    });
});

describe("pendingRoutines", () => {
    it("keeps overdue and next-30-days, drops paused and far-future, sorts soonest first", () => {
        const list = [
            routine({ _id: "far", due_at: iso(90) }),
            routine({ _id: "month", due_at: iso(25) }),
            routine({ _id: "paused", due_at: iso(1), enabled: false }),
            routine({ _id: "over", due_at: iso(-5) }),
        ];
        expect(pendingRoutines(list, now).map((r) => r._id)).toEqual(["over", "month"]);
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
