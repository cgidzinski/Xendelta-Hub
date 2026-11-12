import { describe, it, expect } from "vitest";
import { BADGES, wornBadge } from "./cosmetics";

describe("wornBadge", () => {
  it("finds a known badge", () => {
    expect(wornBadge({ badge: "golden-badge" })).toEqual({ key: "golden-badge", label: BADGES["golden-badge"].label });
  });

  it("is undefined for nothing, an empty object, or a badge we no longer have", () => {
    expect(wornBadge(undefined)).toBeUndefined();
    expect(wornBadge(null)).toBeUndefined();
    expect(wornBadge({})).toBeUndefined();
    expect(wornBadge({ badge: "retired-badge" })).toBeUndefined();
  });
});
