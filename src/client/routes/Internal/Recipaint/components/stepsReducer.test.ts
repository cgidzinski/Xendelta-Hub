import { describe, it, expect } from "vitest";
import { RecipeStep } from "../../../../types/RecipeStep";
import { dropTarget, emptyStep, stepsReducer } from "./stepsReducer";

const steps = (...names: string[]): RecipeStep[] => names.map((stepName, i) => ({ ...emptyStep(i), stepName }));
const names = (list: RecipeStep[]) => list.map((s) => s.stepName);
const indexes = (list: RecipeStep[]) => list.map((s) => s.index);

describe("stepsReducer", () => {
  it("moves a step up or down with the arrows and renumbers", () => {
    const list = steps("a", "b", "c");
    const up = stepsReducer(list, { type: "move", index: 2, direction: "up" });
    expect(names(up)).toEqual(["a", "c", "b"]);
    expect(indexes(up)).toEqual([0, 1, 2]);
    expect(names(stepsReducer(list, { type: "move", index: 0, direction: "down" }))).toEqual(["b", "a", "c"]);
  });

  it("leaves the list alone when an arrow move would leave it", () => {
    const list = steps("a", "b");
    expect(stepsReducer(list, { type: "move", index: 0, direction: "up" })).toBe(list);
    expect(stepsReducer(list, { type: "move", index: 1, direction: "down" })).toBe(list);
  });

  it("drags a step to any position and renumbers", () => {
    const list = steps("a", "b", "c", "d");
    const down = stepsReducer(list, { type: "moveTo", from: 0, to: 2 });
    expect(names(down)).toEqual(["b", "c", "a", "d"]);
    expect(indexes(down)).toEqual([0, 1, 2, 3]);
    expect(names(stepsReducer(list, { type: "moveTo", from: 3, to: 0 }))).toEqual(["d", "a", "b", "c"]);
  });

  it("keeps unmoved steps' identity so their editors don't re-render", () => {
    const list = steps("a", "b", "c", "d");
    const next = stepsReducer(list, { type: "moveTo", from: 1, to: 2 });
    expect(next[0]).toBe(list[0]);
    expect(next[3]).toBe(list[3]);
  });

  it("ignores a drag to the same place or out of range", () => {
    const list = steps("a", "b");
    expect(stepsReducer(list, { type: "moveTo", from: 1, to: 1 })).toBe(list);
    expect(stepsReducer(list, { type: "moveTo", from: 0, to: 5 })).toBe(list);
    expect(stepsReducer(list, { type: "moveTo", from: -1, to: 0 })).toBe(list);
  });
});

describe("dropTarget", () => {
  // Three cards centred at 100, 200 and 300.
  const mids = [100, 200, 300];

  it("finds the gap the pointer is in", () => {
    expect(dropTarget(mids, 50, 1).slot).toBe(0);
    expect(dropTarget(mids, 150, 1).slot).toBe(1);
    expect(dropTarget(mids, 250, 1).slot).toBe(2);
    expect(dropTarget(mids, 999, 1).slot).toBe(3);
  });

  it("turns the gap into the dragged step's new index", () => {
    expect(dropTarget(mids, 50, 2).to).toBe(0);
    expect(dropTarget(mids, 999, 0).to).toBe(2);
    expect(dropTarget(mids, 250, 0).to).toBe(1);
  });

  it("reports no move when dropped on either side of itself", () => {
    expect(dropTarget(mids, 150, 1).to).toBe(1);
    expect(dropTarget(mids, 250, 1).to).toBe(1);
  });
});
