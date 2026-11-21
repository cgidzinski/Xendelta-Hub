import { describe, expect, it } from "vitest";
import { closedNodes, openAtRoute, toggleOpen } from "./railTree";

describe("toggleOpen", () => {
  it("opens a closed id and closes an open one, without changing the original set", () => {
    const closed = new Set<string>();
    const open = toggleOpen(closed, "nb1");
    expect([...open]).toEqual(["nb1"]);
    expect(closed.size).toBe(0);
    expect([...toggleOpen(open, "nb1")]).toEqual([]);
  });
});

describe("openAtRoute", () => {
  it("opens the notebook and section of the route", () => {
    expect(openAtRoute(closedNodes, "nb1", "s1")).toEqual({
      notebooks: new Set(["nb1"]),
      sections: new Set(["s1"]),
    });
  });

  it("keeps what was already open", () => {
    const current = { notebooks: new Set(["nb0"]), sections: new Set(["s0"]) };
    expect(openAtRoute(current, "nb1", "s1")).toEqual({
      notebooks: new Set(["nb0", "nb1"]),
      sections: new Set(["s0", "s1"]),
    });
  });

  it("returns the same tree when there is nothing new to open", () => {
    const current = { notebooks: new Set(["nb1"]), sections: new Set(["s1"]) };
    expect(openAtRoute(current, "nb1", "s1")).toBe(current);
    expect(openAtRoute(closedNodes, undefined, undefined)).toBe(closedNodes);
  });

  it("opens only the level the route knows", () => {
    expect(openAtRoute(closedNodes, "nb1", undefined)).toEqual({
      notebooks: new Set(["nb1"]),
      sections: new Set(),
    });
    expect(openAtRoute(closedNodes, undefined, "s1")).toEqual({
      notebooks: new Set(),
      sections: new Set(["s1"]),
    });
  });
});
