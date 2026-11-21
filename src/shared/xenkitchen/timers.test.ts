import { describe, expect, it } from "vitest";
import {
  changeTimerClock,
  formatTimerDuration,
  parseTimerDuration,
  startTimerClock,
  type KitchenTimer,
} from "./timers";

describe("timer duration", () => {
  it("accepts minutes or minutes and seconds, keeping seconds with additive buttons", () => {
    expect(parseTimerDuration("8")).toBe(480);
    expect(parseTimerDuration(" 8:30 ")).toBe(510);
    expect(formatTimerDuration(parseTimerDuration("8:30")! + 5 * 60)).toBe("13:30");
    expect(parseTimerDuration("0:01")).toBe(1);
    expect(parseTimerDuration("1440:00")).toBe(86400);
    for (const invalid of ["", "-5", "3.5", "1:60", "1440:01", "10000"]) {
      expect(parseTimerDuration(invalid)).toBeNull();
    }
  });
});

describe("timer clock", () => {
  const make = (halfway: boolean): KitchenTimer => ({
    id: "id",
    label: "Timer 1",
    durationSeconds: 120,
    version: 0,
    ...startTimerClock(120, halfway, 1000),
  });

  it("preserves the remaining time to halfway and finish through a pause", () => {
    const paused = changeTimerClock(make(true), "pause", 31_000)!;
    expect(paused).toMatchObject({ endAt: null, pausedMs: 90_000, halfwayRemainingMs: 30_000 });
    expect(changeTimerClock(paused, "resume", 101_000)).toMatchObject({ endAt: 191_000, halfwayAt: 131_000 });
  });

  it("keeps halfway cleared after the midpoint and when it was disabled", () => {
    for (const timer of [make(true), make(false)]) {
      const paused = changeTimerClock(timer, "pause", 61_000)!;
      expect(changeTimerClock(paused, "resume", 101_000)).toMatchObject({ endAt: 161_000, halfwayAt: null });
    }
    expect(changeTimerClock(make(true), "pause", 121_000)).toBeNull();
  });
});
