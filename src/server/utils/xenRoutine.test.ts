import { describe, it, expect } from "vitest";
import {
  addInterval, computeDueStatus, doneAheadIndices, shouldNotify, applyComplete, applyPostpone,
  recipientsFor, activityRecipients, channelsFor, localHour, effectiveTimezone, reminderKindFor, groupForDigest, canEdit, canAct, MAX_HISTORY, type RoutineLike, type RoutineMember,
} from "./xenRoutine";

const member = (id: string, over: Partial<RoutineMember> = {}): RoutineMember => ({
  user_id: id, role: "sharer", muted: false, ...over,
});

const base = (over: Partial<RoutineLike> = {}): RoutineLike => ({
  owner_id: "u1",
  interval: { every: 3, unit: "months" },
  last_done_at: null,
  due_at: new Date("2026-06-01T00:00:00Z"),
  enabled: true,
  last_notified_at: null,
  done_ahead: [],
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
  it("completing an early occurrence keeps the schedule", () => {
    const early = base({ interval: { every: 1, unit: "weeks" }, due_at: new Date("2026-06-15T00:00:00Z") });
    const r = applyComplete(early, { by: "u1", now });
    expect(r.due_at.toISOString()).toBe("2026-06-22T00:00:00.000Z");
  });
  it("completing a later occurrence records only that one and leaves due_at alone", () => {
    const weekly = base({ interval: { every: 1, unit: "weeks" }, due_at: new Date("2026-06-10T00:00:00Z") });
    const r = applyComplete(weekly, { by: "u1", now, occurrence: 3 });
    expect(r.due_at).toEqual(weekly.due_at);
    expect(r.done_ahead.map((d) => d.toISOString())).toEqual(["2026-06-24T00:00:00.000Z"]);
    expect(r.history[0]).toMatchObject({ action: "done" });
    expect(r.history[0].occurrence_at?.toISOString()).toBe("2026-06-24T00:00:00.000Z");
    expect(doneAheadIndices({ ...weekly, done_ahead: r.done_ahead })).toEqual([3]);
  });
  it("doing the same later occurrence twice is idempotent", () => {
    const weekly = base({ interval: { every: 1, unit: "weeks" }, due_at: new Date("2026-06-10T00:00:00Z") });
    const once = applyComplete(weekly, { by: "u1", now, occurrence: 2 });
    const twice = applyComplete({ ...weekly, done_ahead: once.done_ahead }, { by: "u1", now, occurrence: 2 });
    expect(twice.done_ahead).toHaveLength(1);
  });
  it("completing the current one skips occurrences already done ahead", () => {
    const weekly = base({ interval: { every: 1, unit: "weeks" }, due_at: new Date("2026-06-10T12:00:00Z"), done_ahead: [new Date("2026-06-17T12:00:00Z")] });
    const r = applyComplete(weekly, { by: "u1", now: new Date("2026-06-10T12:00:00Z") });
    // next would be Jun 17 (done ahead) so it lands on Jun 24
    expect(r.due_at.toISOString()).toBe("2026-06-24T12:00:00.000Z");
    expect(r.done_ahead).toEqual([]);
  });
  it("an overdue occurrence still restarts the clock from now", () => {
    const overdue = base({ interval: { every: 1, unit: "weeks" }, due_at: new Date("2026-05-01T00:00:00Z") });
    expect(applyComplete(overdue, { by: "u1", now, occurrence: 1 }).due_at.toISOString()).toBe("2026-06-17T00:00:00.000Z");
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
  const on = { inapp: true, push: true, email: true };
  it("skips muted members and honours each person's own channel settings", () => {
    const r = base({
      members: [
        member("u1", { role: "owner" }),
        member("u2", { muted: true }),
        member("u3"),
        member("u4"),
      ],
    });
    const prefs = new Map([
      ["u3", { inapp: false, push: true, email: false }],
      ["u4", { inapp: false, push: false, email: false }],
    ]);
    expect(recipientsFor(r, prefs)).toEqual([
      { userId: "u1", channels: ["inapp", "socket", "push", "email"] }, // no stored prefs = everything on
      { userId: "u3", channels: ["push"] },
    ]);
  });
  it("channelsFor pairs socket with inapp and can drop email", () => {
    expect(channelsFor(on)).toEqual(["inapp", "socket", "push", "email"]);
    expect(channelsFor(on, { email: false })).toEqual(["inapp", "socket", "push"]);
    expect(channelsFor({ inapp: false, push: false, email: false })).toEqual([]);
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

describe("effectiveTimezone", () => {
  it("prefers Profile, then the browser-reported zone, then UTC", () => {
    expect(effectiveTimezone("Europe/London", "America/New_York")).toBe("Europe/London");
    expect(effectiveTimezone("", "America/New_York")).toBe("America/New_York");
    expect(effectiveTimezone(undefined, undefined)).toBe("UTC");
  });
});

describe("localHour", () => {
  it("reads the hour in a zone, including across DST", () => {
    expect(localHour(new Date("2026-01-15T08:00:00Z"), "UTC")).toBe(8);
    expect(localHour(new Date("2026-01-15T08:00:00Z"), "Asia/Tokyo")).toBe(17);
    // New York is UTC-5 in winter, UTC-4 in summer
    expect(localHour(new Date("2026-01-15T13:00:00Z"), "America/New_York")).toBe(8);
    expect(localHour(new Date("2026-07-15T12:00:00Z"), "America/New_York")).toBe(8);
  });
  it("treats midnight as 0, not 24", () => {
    expect(localHour(new Date("2026-01-15T00:30:00Z"), "UTC")).toBe(0);
  });
  it("falls back to UTC for an unknown zone", () => {
    expect(localHour(new Date("2026-01-15T05:00:00Z"), "Not/AZone")).toBe(5);
  });
});

describe("reminderKindFor", () => {
  const settings = { remindHour: 8, timezone: "UTC" };
  const at8 = new Date("2026-06-10T08:00:00Z");
  const routine = (over: Partial<RoutineLike> = {}) => base({ due_at: new Date("2026-06-09T00:00:00Z"), ...over });

  it("only fires in the member's own reminder hour", () => {
    expect(reminderKindFor(routine(), member("u1"), settings, new Date("2026-06-10T09:00:00Z"))).toBeNull();
    expect(reminderKindFor(routine(), member("u1"), settings, at8)).toBe("due");
  });
  it("uses the member's timezone", () => {
    const tokyo = { remindHour: 8, timezone: "Asia/Tokyo" };
    expect(reminderKindFor(routine(), member("u1"), tokyo, new Date("2026-06-09T23:00:00Z"))).toBe("due");
    expect(reminderKindFor(routine(), member("u1"), tokyo, at8)).toBeNull();
  });
  it("nags again only after remind_again_days, measured per member", () => {
    const told = member("u1", { last_due_notified_at: new Date("2026-06-09T08:00:00Z") });
    expect(reminderKindFor(routine(), told, settings, at8)).toBeNull(); // 1 day later
    const toldLong = member("u1", { last_due_notified_at: new Date("2026-06-07T08:00:00Z") });
    expect(reminderKindFor(routine(), toldLong, settings, at8)).toBe("due"); // 3 days later
    const other = member("u2");
    expect(reminderKindFor(routine(), other, settings, at8)).toBe("due"); // never told
  });
  it("a new due date restarts the cycle", () => {
    const told = member("u1", { last_due_notified_at: new Date("2026-06-09T08:00:00Z") });
    const moved = routine({ due_at: new Date("2026-06-10T00:00:00Z") });
    expect(reminderKindFor(moved, told, settings, at8)).toBe("due");
  });
  it("gives a heads-up once per due date", () => {
    const upcoming = routine({ due_at: new Date("2026-06-12T08:00:00Z") });
    const m = member("u1", { lead_days: 3 });
    expect(reminderKindFor(upcoming, m, settings, at8)).toBe("lead");
    const told = member("u1", { lead_days: 3, lead_notified_for: upcoming.due_at });
    expect(reminderKindFor(upcoming, told, settings, at8)).toBeNull();
    expect(reminderKindFor(upcoming, member("u1"), settings, at8)).toBeNull(); // lead off
    expect(reminderKindFor(routine({ due_at: new Date("2026-06-20T08:00:00Z") }), m, settings, at8)).toBeNull(); // too far out
  });
  it("stays quiet for muted members and disabled routines", () => {
    expect(reminderKindFor(routine(), member("u1", { muted: true }), settings, at8)).toBeNull();
    expect(reminderKindFor(routine({ enabled: false }), member("u1"), settings, at8)).toBeNull();
  });
});

describe("groupForDigest", () => {
  const now = new Date("2026-06-10T08:00:00Z");
  it("uses the single message for one item and a combined one for several", () => {
    const one = groupForDigest([{ name: "Filter", kind: "due", dueAt: new Date("2026-06-08T00:00:00Z") }], now);
    expect(one.title).toBe("Due: Filter");
    const many = groupForDigest([
      { name: "B", kind: "lead", dueAt: new Date("2026-06-12T08:00:00Z") },
      { name: "A", kind: "due", dueAt: new Date("2026-06-08T00:00:00Z") },
    ], now);
    expect(many.title).toBe("2 routines need attention");
    expect(many.message.split("\n")[0]).toContain('"A" is 2 days overdue');
  });
});

describe("activityRecipients", () => {
  it("excludes the actor, muted members and opted-out members, and never uses email", () => {
    const r = base({ members: [
      member("actor", { role: "owner" }),
      member("a"),
      member("muted", { muted: true }),
      member("off", { activity: false }),
      member("pushOnly"),
    ] });
    const prefs = new Map([["pushOnly", { inapp: false, push: true, email: true }]]);
    expect(activityRecipients(r, "actor", prefs)).toEqual([
      { userId: "a", channels: ["inapp", "socket", "push"] },
      { userId: "pushOnly", channels: ["push"] },
    ]);
  });
});
