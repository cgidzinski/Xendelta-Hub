import { describe, it, expect } from "vitest";
import { BADGES, FRAMES, NAME_COLOURS, isWorn, slotOf, wornFrame, wornNameColour } from "./cosmetics";

describe("cosmetics", () => {
  it("colours are theme palette paths, never colour literals", () => {
    for (const c of [...Object.values(FRAMES), ...Object.values(NAME_COLOURS)]) {
      expect(c.token).toMatch(/^[a-z]+\.(main|light|dark)$/);
      expect(Number.isInteger(c.price) && c.price >= 1500 && c.price <= 6000).toBe(true);
    }
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
