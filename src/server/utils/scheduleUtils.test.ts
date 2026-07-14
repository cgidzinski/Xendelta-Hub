import { describe, it, expect } from "vitest";
import { advanceDate, computeDueDates, applyAdvance, TaskScheduleState } from "./scheduleUtils";

const utc = (iso: string) => new Date(iso);

describe("advanceDate", () => {
  it("returns the anchor itself for occurrence 0", () => {
    const anchor = utc("2026-07-11T14:30:00.000Z");
    for (const f of ["daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"] as const) {
      expect(advanceDate(anchor, f, 0).toISOString()).toBe(anchor.toISOString());
    }
  });

  it("throws on an unknown frequency instead of computing garbage dates", () => {
    const anchor = utc("2026-01-01T09:00:00.000Z");
    expect(() => advanceDate(anchor, "30s" as never, 1)).toThrow(/Unknown schedule frequency/);
  });

  it("advances daily by exact 24h periods", () => {
    const anchor = utc("2026-01-01T09:00:00.000Z");
    expect(advanceDate(anchor, "daily", 1).toISOString()).toBe("2026-01-02T09:00:00.000Z");
    expect(advanceDate(anchor, "daily", 31).toISOString()).toBe("2026-02-01T09:00:00.000Z");
    expect(advanceDate(anchor, "daily", 365).toISOString()).toBe("2027-01-01T09:00:00.000Z");
  });

  it("advances weekly and biweekly", () => {
    const anchor = utc("2026-01-05T00:00:00.000Z"); // a Monday
    expect(advanceDate(anchor, "weekly", 1).toISOString()).toBe("2026-01-12T00:00:00.000Z");
    expect(advanceDate(anchor, "weekly", 4).toISOString()).toBe("2026-02-02T00:00:00.000Z");
    expect(advanceDate(anchor, "biweekly", 1).toISOString()).toBe("2026-01-19T00:00:00.000Z");
    expect(advanceDate(anchor, "biweekly", 3).toISOString()).toBe("2026-02-16T00:00:00.000Z");
  });

  it("clamps monthly day-of-month per occurrence without cumulative drift", () => {
    const anchor = utc("2026-01-31T12:00:00.000Z");
    expect(advanceDate(anchor, "monthly", 1).toISOString()).toBe("2026-02-28T12:00:00.000Z");
    expect(advanceDate(anchor, "monthly", 2).toISOString()).toBe("2026-03-31T12:00:00.000Z");
    expect(advanceDate(anchor, "monthly", 3).toISOString()).toBe("2026-04-30T12:00:00.000Z");
    expect(advanceDate(anchor, "monthly", 12).toISOString()).toBe("2027-01-31T12:00:00.000Z");
    // large n stays anchored to the 31st
    expect(advanceDate(anchor, "monthly", 120).toISOString()).toBe("2036-01-31T12:00:00.000Z");
  });

  it("clamps to Feb 29 in leap years", () => {
    const anchor = utc("2027-12-31T08:00:00.000Z");
    expect(advanceDate(anchor, "monthly", 2).toISOString()).toBe("2028-02-29T08:00:00.000Z");
  });

  it("advances quarterly as 3-month periods with clamping", () => {
    const anchor = utc("2026-11-30T10:00:00.000Z");
    expect(advanceDate(anchor, "quarterly", 1).toISOString()).toBe("2027-02-28T10:00:00.000Z");
    expect(advanceDate(anchor, "quarterly", 2).toISOString()).toBe("2027-05-30T10:00:00.000Z");
    expect(advanceDate(anchor, "quarterly", 4).toISOString()).toBe("2027-11-30T10:00:00.000Z");
  });

  it("handles yearly Feb 29 anchors", () => {
    const anchor = utc("2024-02-29T00:00:00.000Z");
    expect(advanceDate(anchor, "yearly", 1).toISOString()).toBe("2025-02-28T00:00:00.000Z");
    expect(advanceDate(anchor, "yearly", 4).toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });

  it("crosses year boundaries for month-based frequencies", () => {
    const anchor = utc("2026-11-15T23:45:00.000Z");
    expect(advanceDate(anchor, "monthly", 2).toISOString()).toBe("2027-01-15T23:45:00.000Z");
    expect(advanceDate(anchor, "quarterly", 1).toISOString()).toBe("2027-02-15T23:45:00.000Z");
  });

  it("preserves the anchor's UTC time-of-day including milliseconds", () => {
    const anchor = utc("2026-03-31T17:05:09.123Z");
    expect(advanceDate(anchor, "monthly", 1).toISOString()).toBe("2026-04-30T17:05:09.123Z");
    expect(advanceDate(anchor, "yearly", 1).toISOString()).toBe("2027-03-31T17:05:09.123Z");
  });
});

function makeTask(overrides: Partial<TaskScheduleState> = {}): TaskScheduleState {
  const anchor = utc("2026-01-01T09:00:00.000Z");
  return {
    anchor_date: anchor,
    frequency: "daily",
    run_count: 1, // occurrence 0 already happened
    run_at: advanceDate(anchor, "daily", 1),
    ...overrides,
  };
}

describe("computeDueDates", () => {
  it("returns every missed due date, oldest first (catch-up 'all')", () => {
    const task = makeTask();
    const now = utc("2026-01-04T10:00:00.000Z"); // days 2, 3, 4 are due
    const due = computeDueDates(task, now);
    expect(due.map((d) => d.toISOString())).toEqual([
      "2026-01-02T09:00:00.000Z",
      "2026-01-03T09:00:00.000Z",
      "2026-01-04T09:00:00.000Z",
    ]);
  });

  it("returns nothing when the next run is in the future", () => {
    const task = makeTask();
    expect(computeDueDates(task, utc("2026-01-01T12:00:00.000Z"))).toEqual([]);
  });

  it("respects the cap, and the remainder is computable on the next pass", () => {
    const task = makeTask();
    const now = utc("2026-01-11T10:00:00.000Z"); // 10 due
    const first = computeDueDates(task, now, 4);
    expect(first).toHaveLength(4);
    const advanced = { ...task, ...applyAdvance(task, 4) };
    const rest = computeDueDates(advanced, now, 100);
    expect(rest).toHaveLength(6);
    expect(rest[0].toISOString()).toBe("2026-01-06T09:00:00.000Z");
  });

  it("stops at end_date (inclusive)", () => {
    const task = makeTask({ end_date: utc("2026-01-03T09:00:00.000Z") });
    const due = computeDueDates(task, utc("2026-01-10T00:00:00.000Z"));
    expect(due.map((d) => d.toISOString())).toEqual([
      "2026-01-02T09:00:00.000Z",
      "2026-01-03T09:00:00.000Z",
    ]);
  });

  it("stops at max_runs", () => {
    const task = makeTask({ max_runs: 3 }); // run_count 1 -> only 2 more allowed
    const due = computeDueDates(task, utc("2026-01-10T00:00:00.000Z"));
    expect(due).toHaveLength(2);
  });

  it("one-shot: due exactly once at run_at", () => {
    const task = makeTask({ frequency: null, run_count: 0, run_at: utc("2026-01-05T00:00:00.000Z") });
    expect(computeDueDates(task, utc("2026-01-04T00:00:00.000Z"))).toEqual([]);
    expect(computeDueDates(task, utc("2026-01-06T00:00:00.000Z")).map((d) => d.toISOString()))
      .toEqual(["2026-01-05T00:00:00.000Z"]);
  });
});

describe("applyAdvance", () => {
  it("advances the counter and keeps the run_at invariant", () => {
    const task = makeTask();
    const next = applyAdvance(task, 3);
    expect(next.run_count).toBe(4);
    expect(next.run_at.toISOString()).toBe(advanceDate(task.anchor_date, "daily", 4).toISOString());
    expect(next.enabled).toBe(true);
  });

  it("partial advance (processed < due) keeps the invariant", () => {
    const task = makeTask();
    const next = applyAdvance(task, 1);
    expect(next.run_at.toISOString()).toBe("2026-01-03T09:00:00.000Z");
    expect(next.enabled).toBe(true);
  });

  it("retires when the next run passes end_date", () => {
    const task = makeTask({ end_date: utc("2026-01-03T09:00:00.000Z") });
    expect(applyAdvance(task, 1).enabled).toBe(true);  // next = Jan 3, still within
    expect(applyAdvance(task, 2).enabled).toBe(false); // next = Jan 4, past end
  });

  it("retires when max_runs is reached", () => {
    const task = makeTask({ max_runs: 3 });
    expect(applyAdvance(task, 1).enabled).toBe(true);
    expect(applyAdvance(task, 2).enabled).toBe(false);
  });

  it("one-shot: disabled after a successful run, unchanged otherwise", () => {
    const task = makeTask({ frequency: null, run_count: 0, run_at: utc("2026-01-05T00:00:00.000Z") });
    expect(applyAdvance(task, 1).enabled).toBe(false);
    expect(applyAdvance(task, 0).enabled).toBe(true);
    expect(applyAdvance(task, 0).run_at.toISOString()).toBe("2026-01-05T00:00:00.000Z");
  });
});
