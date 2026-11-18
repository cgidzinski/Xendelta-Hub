import { describe, it, expect } from "vitest";
import {
  BADGES,
  COSMETIC_ITEMS,
  FRAMES,
  NAME_COLOURS,
  isWorn,
  slotOf,
  wornBadge,
  wornFrame,
  wornNameColour,
} from "./cosmetics";

describe("cosmetics", () => {
  it("colours are theme palette paths, never colour literals", () => {
    for (const c of [...Object.values(FRAMES), ...Object.values(NAME_COLOURS)]) {
      expect(c.token).toMatch(/^[a-z]+\.[a-z]+$/);
      expect(Number.isInteger(c.price) && c.price >= 1500 && c.price <= 6000).toBe(true);
    }
  });

  it("badges have a known shape, a theme colour and a whole-number price", () => {
    for (const b of Object.values(BADGES)) {
      expect(["star", "heart", "bolt", "leaf"]).toContain(b.icon);
      expect(b.token).toMatch(/^[a-z]+\.[a-z]+$/);
      expect(Number.isInteger(b.price) && b.price > 0).toBe(true);
    }
    expect(wornBadge({ badge: "heart-badge" })?.icon).toBe("heart");
    expect(wornBadge({ badge: "retired-badge" })).toBeUndefined();
    expect(COSMETIC_ITEMS.map((c) => c.key)).toEqual([
      ...Object.keys(BADGES),
      ...Object.keys(FRAMES),
      ...Object.keys(NAME_COLOURS),
    ]);
  });

  it("every item key is unique across slots and maps to its slot", () => {
    const keys = [...Object.keys(BADGES), ...Object.keys(FRAMES), ...Object.keys(NAME_COLOURS)];
    expect(new Set(keys).size).toBe(keys.length);
    expect(slotOf("golden-badge")).toBe("badge");
    expect(slotOf("frame-sky")).toBe("frame");
    expect(slotOf("name-rose")).toBe("nameColour");
    expect(slotOf("1000-gem-voucher")).toBeUndefined();
  });

  it("finds what is worn, and ignores keys it no longer knows", () => {
    expect(wornFrame({ frame: "frame-gold" })?.token).toBe("warning.main");
    expect(wornFrame({ frame: "frame-retired" })).toBeUndefined();
    expect(wornNameColour({ nameColour: "name-sky" })?.label).toBe("Sky Name");
    expect(wornNameColour(undefined)).toBeUndefined();
    expect(isWorn({ frame: "frame-sky" }, "frame-sky")).toBe(true);
    expect(isWorn({ frame: "frame-sky" }, "frame-gold")).toBe(false);
    expect(isWorn({}, "1000-gem-voucher")).toBe(false);
  });
});
