import { describe, it, expect } from "vitest";
import {
  applyComplete,
  applyReading,
  shouldNotify,
  thresholdTarget,
  THRESHOLD_ARMED_DUE,
  type RoutineLike,
} from "./xenRoutine";

const now = new Date("2026-06-01T12:00:00Z");
const oil = (over: Partial<RoutineLike> = {}): RoutineLike => ({
  owner_id: "u1",
  kind: "threshold",
  threshold: { unit: "km", every: 5000, last_done_value: 25000, current_value: 25000 },
  interval: { every: 1, unit: "months" },
  last_done_at: null,
  due_at: THRESHOLD_ARMED_DUE,
  enabled: true,
  last_notified_at: null,
  done_ahead: [],
  remind_again_days: 3,
  members: [],
  history: [],
  ...over,
});

describe("threshold routines", () => {
  it("stays armed below the target and triggers at it", () => {
    const below = applyReading(oil(), { value: 29999, now });
    expect(below.due_at).toEqual(THRESHOLD_ARMED_DUE);
    const hit = applyReading(oil(), { value: 30000, now });
    expect(hit.due_at).toEqual(now);
    expect(shouldNotify(oil({ ...hit }), new Date(now.getTime() + 1000))).toBe(true);
  });

  it("keeps the trigger time on later readings", () => {
    const hit = applyReading(oil(), { value: 30100, now });
    const later = applyReading(oil({ ...hit }), { value: 30500, now: new Date(now.getTime() + 86_400_000) });
    expect(later.due_at).toEqual(now);
  });

  it("re-baselines on the actual reading it was completed at", () => {
    const done = applyComplete(oil({ due_at: now }), { by: "u1", now, reading: 30000 });
    expect(done.threshold && thresholdTarget(done.threshold)).toBe(35000);
    expect(done.due_at).toEqual(THRESHOLD_ARMED_DUE);
    const late = applyComplete(oil({ due_at: now }), { by: "u1", now, reading: 35400 });
    expect(late.threshold && thresholdTarget(late.threshold)).toBe(40400);
  });

  it("keeps an undo snapshot of the old baseline", () => {
    const done = applyComplete(oil({ due_at: now }), { by: "u1", now, reading: 30000 });
    expect(done.history[0].undo_state).toMatchObject({ threshold_last_done: 25000 });
  });
});
