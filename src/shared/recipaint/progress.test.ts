import { describe, it, expect } from "vitest";
import { sanitizeCompletedSteps } from "./progress";

describe("sanitizeCompletedSteps", () => {
  it("keeps in-range indexes, sorted and de-duplicated", () => {
    expect(sanitizeCompletedSteps([2, 0, 2, 1], 4)).toEqual([0, 1, 2]);
  });

  it("drops indexes past the end of the recipe", () => {
    // The owner deleted steps since this client loaded the recipe.
    expect(sanitizeCompletedSteps([0, 1, 7], 2)).toEqual([0, 1]);
  });

  it("drops negative indexes", () => {
    expect(sanitizeCompletedSteps([-1, 0], 3)).toEqual([0]);
  });

  it("rejects non-integers and non-numbers", () => {
    expect(sanitizeCompletedSteps([1.5, NaN, Infinity, "2", null, undefined, {}, [0]], 5)).toEqual([]);
  });

  it("returns an empty list for a recipe with no steps", () => {
    expect(sanitizeCompletedSteps([0, 1, 2], 0)).toEqual([]);
  });

  it("returns an empty list for anything that isn't an array", () => {
    for (const input of [null, undefined, "0,1", 5, {}, { 0: 1 }]) {
      expect(sanitizeCompletedSteps(input, 3)).toEqual([]);
    }
  });

  it("bounds the stored array by the step count, however much is sent", () => {
    const flood = Array.from({ length: 10000 }, (_, i) => i);
    expect(sanitizeCompletedSteps(flood, 3)).toEqual([0, 1, 2]);
  });
});
