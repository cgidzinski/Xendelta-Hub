import { describe, it, expect } from "vitest";
import {
  addInterval, computeDueStatus, shouldNotify, applyComplete, applyPostpone,
  recipientsFor, canEdit, canAct, MAX_HISTORY, type RoutineLike, type RoutineMember,
} from "./xenRoutine";

const member = (id: string, over: Partial<RoutineMember> = {}): RoutineMember => ({
  user_id: id, role: "sharer", channels: { inapp: true, push: true, email: true }, muted: false, ...over,
});

const base = (over: Partial<RoutineLike> = {}): RoutineLike => ({
  owner_id: "u1",
  interval: { every: 3, unit: "months" },
  last_done_at: null,
  due_at: new Date("2026-06-01T00:00:00Z"),
  enabled: true,
  last_notified_at: null,
  remind_again_days: 3,
  members: [member("u1", { role: "owner" })],
  history: [],
  ...over,
});

describe("addInterval", () => {
  it("adds each unit", () => {
    const d = new Date("2026-01-10T12:00:00Z");
    expect(addInterval(d, { every: 10, unit: "days" }).toISOString()).toBe("2026-01-20T12:00:00.000Z");
    expect(addInterval(d, { every: 2, unit: "weeks" }).toISOString()).toBe("2026-01-24T12:00:00.000Z");
    expect(addInterval(d, { every: 6, unit: "months" }).toISOString()).toBe("2026-07-10T12:00:00.000Z");
    expect(addInterval(d, { every: 1, unit: "years" }).toISOString()).toBe("2027-01-10T12:00:00.000Z");
  });
  it("clamps month-end", () => {
    const d = new Date(2026, 0, 31);
    const r = addInterval(d, { every: 1, unit: "months" });
    expect(r.getMonth()).toBe(1);
    expect(r.getDate()).toBe(28);
  });
});

describe("computeDueStatus", () => {
  const now = new Date("2026-06-01T00:00:00Z");
  it("classifies", () => {
    expect(computeDueStatus({ due_at: new Date("2026-05-31T00:00:00Z") }, now)).toBe("overdue");
    expect(computeDueStatus({ due_at: now }, now)).toBe("overdue");
    expect(computeDueStatus({ due_at: new Date("2026-06-05T00:00:00Z") }, now)).toBe("due_soon");
    expect(computeDueStatus({ due_at: new Date("2026-07-01T00:00:00Z") }, now)).toBe("ok");
  });
});

describe("shouldNotify", () => {
  const now = new Date("2026-06-10T00:00:00Z");
  it("never for disabled or not yet due", () => {
    expect(shouldNotify(base({ enabled: false }), now)).toBe(false);
    expect(shouldNotify(base({ due_at: new Date("2026-07-01T00:00:00Z") }), now)).toBe(false);
  });
  it("first reminder for a due date", () => {
    expect(shouldNotify(base(), now)).toBe(true);
    expect(shouldNotify(base({ last_notified_at: new Date("2026-05-01T00:00:00Z") }), now)).toBe(true);
  });
  it("throttles re-reminders", () => {
    const due = new Date("2026-06-01T00:00:00Z");
    expect(shouldNotify(base({ due_at: due, last_notified_at: new Date("2026-06-09T00:00:00Z") }), now)).toBe(false);
    expect(shouldNotify(base({ due_at: due, last_notified_at: new Date("2026-06-07T00:00:00Z") }), now)).toBe(true);
  });
});

describe("applyComplete / applyPostpone", () => {
  const now = new Date("2026-06-10T00:00:00Z");
  it("complete restarts the clock from the completion time", () => {
    const r = applyComplete(base(), { by: "u1", now, note: "new filter" });
    expect(r.last_done_at).toEqual(now);
    expect(r.due_at.toISOString()).toBe("2026-09-10T00:00:00.000Z");
    expect(r.last_notified_at).toBeNull();
    expect(r.history[0]).toMatchObject({ action: "done", by_user: "u1", note: "new filter" });
  });
  it("complete honours a past doneAt but not a future one", () => {
    const past = new Date("2026-06-01T00:00:00Z");
    expect(applyComplete(base(), { by: "u1", now, doneAt: past }).last_done_at).toEqual(past);
    expect(applyComplete(base(), { by: "u1", now, doneAt: new Date("2027-01-01T00:00:00Z") }).last_done_at).toEqual(now);
  });
  it("postpone leaves last_done_at alone", () => {
    const r = applyPostpone(base({ last_done_at: new Date("2026-03-01T00:00:00Z") }), { by: "u2", now, days: 7 });
    expect(r).not.toHaveProperty("last_done_at");
    expect(r.due_at.toISOString()).toBe("2026-06-17T00:00:00.000Z");
    expect(r.history[0]).toMatchObject({ action: "postponed", by_user: "u2" });
  });
  it("postpone until a date", () => {
    const until = new Date("2026-08-01T00:00:00Z");
    expect(applyPostpone(base(), { by: "u1", now, until }).due_at).toEqual(until);
  });
  it("caps history", () => {
    const history = Array.from({ length: MAX_HISTORY }, () => ({ action: "done" as const, at: now }));
    expect(applyComplete(base({ history }), { by: "u1", now }).history).toHaveLength(MAX_HISTORY);
  });
});

describe("recipientsFor", () => {
  it("skips muted members and honours per-member channels", () => {
    const r = base({
      members: [
        member("u1", { role: "owner" }),
        member("u2", { muted: true }),
        member("u3", { channels: { inapp: false, push: true, email: false } }),
        member("u4", { channels: { inapp: false, push: false, email: false } }),
      ],
    });
    expect(recipientsFor(r)).toEqual([
      { userId: "u1", channels: ["inapp", "socket", "push", "email"] },
      { userId: "u3", channels: ["push"] },
    ]);
  });
});

describe("permissions", () => {
  const r = base({ members: [member("u1", { role: "owner" }), member("u2")] });
  it("owner edits, members act, strangers neither", () => {
    expect(canEdit(r, "u1")).toBe(true);
    expect(canEdit(r, "u2")).toBe(false);
    expect(canAct(r, "u2")).toBe(true);
    expect(canAct(r, "u9")).toBe(false);
  });
});
