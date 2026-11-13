import { describe, it, expect } from "vitest";
import { DEFAULT_PINNED_APPS, resolvePinnedApps, toggledPins } from "./apps";

describe("pinned apps", () => {
  it("someone who has never chosen gets the default, and anyone who has chosen gets exactly that, even nothing", () => {
    expect(resolvePinnedApps(null)).toEqual(DEFAULT_PINNED_APPS);
    expect(resolvePinnedApps(undefined)).toEqual(DEFAULT_PINNED_APPS);
    expect(resolvePinnedApps([])).toEqual([]);
    expect(resolvePinnedApps(["xennote"])).toEqual(["xennote"]);
  });

  it("pinning adds to the end with no limit, and unpinning removes only that app", () => {
    let pins: string[] = [];
    for (const key of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]) pins = toggledPins(pins, key);
    expect(pins).toHaveLength(10);
    expect(toggledPins(pins, "c")).toEqual(["a", "b", "d", "e", "f", "g", "h", "i", "j"]);
    expect(toggledPins(["a"], "a")).toEqual([]);
    expect(toggledPins(["a"], "b")).toEqual(["a", "b"]);
  });
});
