import { describe, it, expect } from "vitest";
import { clampStep, formatCountdown, remainingSeconds, runningTimers, swipeDirection } from "./cookLogic";

describe("clampStep", () => {
  it("stays inside the recipe", () => {
    expect(clampStep(-1, 5)).toBe(0);
    expect(clampStep(2, 5)).toBe(2);
    expect(clampStep(9, 5)).toBe(4);
    expect(clampStep(3, 0)).toBe(0);
  });
});

describe("swipeDirection", () => {
  it("swipe left is next, swipe right is previous", () => {
    expect(swipeDirection(-120, 10)).toBe("next");
    expect(swipeDirection(120, -10)).toBe("prev");
  });
  it("ignores a short movement and one that is mostly vertical", () => {
    expect(swipeDirection(-30, 0)).toBeNull();
    expect(swipeDirection(59, 0)).toBeNull();
    expect(swipeDirection(-100, 90)).toBeNull(); // scrolling with a drift
    expect(swipeDirection(-100, 80)).toBeNull(); // 100 < 80 * 1.5
  });
  it("counts a clearly horizontal one even with some vertical drift", () => {
    expect(swipeDirection(-100, 40)).toBe("next");
  });
});

describe("countdown", () => {
  it("counts down in whole seconds and never below zero", () => {
    expect(remainingSeconds(10_000, 4_100)).toBe(6); // 5.9 s left reads as 6
    expect(remainingSeconds(10_000, 10_000)).toBe(0);
    expect(remainingSeconds(10_000, 12_000)).toBe(0);
  });
  it("formats minutes and hours", () => {
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(5)).toBe("0:05");
    expect(formatCountdown(65)).toBe("1:05");
    expect(formatCountdown(600)).toBe("10:00");
    expect(formatCountdown(3725)).toBe("1:02:05");
    expect(formatCountdown(-3)).toBe("0:00");
  });
});

describe("runningTimers", () => {
  it("lists started timers, those still running soonest first, finished ones after", () => {
    const now = 100_000;
    const list = runningTimers({ 2: now + 90_000, 0: now - 1_000, 5: now + 30_000 }, now);
    expect(list.map((t) => [t.step, t.seconds, t.finished])).toEqual([
      [5, 30, false],
      [2, 90, false],
      [0, 0, true],
    ]);
  });
  it("is empty when nothing was started", () => {
    expect(runningTimers({}, 1)).toEqual([]);
  });
});
