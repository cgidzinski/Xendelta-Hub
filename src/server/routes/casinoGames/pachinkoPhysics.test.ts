import { describe, it, expect } from "vitest";
import { POCKETS, POCKET_FLOOR_Y } from "./pachinkoLayout";
import { simulateDrop } from "./pachinkoPhysics";

describe("simulateDrop", () => {
  it.each(POCKETS.map((p) => p.index))("lands in the requested pocket %i", (index) => {
    const { landedPocketIndex, trajectory } = simulateDrop(index);
    expect(landedPocketIndex).toBe(index);
    expect(trajectory.length).toBeGreaterThan(0);
    expect(trajectory[trajectory.length - 1].y).toBeCloseTo(POCKET_FLOOR_Y, 0);
  });

  it("produces a distinct trajectory on every drop, not a canned replay", () => {
    // A single trajectory can legitimately fall close to straight (rare, low-jitter runs) -
    // what must always be true is that repeat drops aren't identical, since launch position
    // and per-pin bounciness are re-randomized every attempt (see pachinkoPhysics.ts).
    const firstSampleXs = Array.from({ length: 8 }, () => simulateDrop(5).trajectory[0].x);
    expect(new Set(firstSampleXs.map((x) => Math.round(x * 100))).size).toBeGreaterThan(1);
  });
}, 20000);
