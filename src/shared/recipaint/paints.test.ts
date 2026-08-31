import { describe, it, expect } from "vitest";
import {
  RecipePaint,
  aggregatePaints,
  cleanPaints,
  formatPaint,
  isBlankPaint,
  normalizePaintInput,
  paintKey,
} from "./paints";

const paint = (over: Partial<RecipePaint> = {}): RecipePaint => ({
  brand: "Citadel",
  name: "Nuln Oil",
  hex: "",
  type: "",
  ...over,
});

describe("formatPaint", () => {
  it("joins brand and name", () => {
    expect(formatPaint(paint())).toBe("Citadel: Nuln Oil");
  });

  it("falls back to whichever half exists", () => {
    expect(formatPaint(paint({ brand: "" }))).toBe("Nuln Oil");
    expect(formatPaint(paint({ name: "" }))).toBe("Citadel");
    expect(formatPaint(paint({ brand: "", name: "" }))).toBe("");
  });
});

describe("paintKey", () => {
  it("ignores casing and surrounding space", () => {
    expect(paintKey(paint({ brand: " CITADEL ", name: "nuln oil" }))).toBe(paintKey(paint()));
  });

  it("does not collide across a brand/name boundary", () => {
    expect(paintKey(paint({ brand: "ab", name: "c" }))).not.toBe(paintKey(paint({ brand: "a", name: "bc" })));
  });

  it("does not collide when a brand or name contains the separator's neighbours", () => {
    // Why the separator is a character that cannot occur in user text: with a space,
    // {brand: "a b", name: "c"} and {brand: "a", name: "b c"} would be the same key, and the
    // collection's unique index would refuse a legitimately different paint.
    expect(paintKey(paint({ brand: "a b", name: "c" }))).not.toBe(paintKey(paint({ brand: "a", name: "b c" })));
    expect(paintKey(paint({ brand: "Army Painter", name: "Matt Black" }))).not.toBe(
      paintKey(paint({ brand: "Army", name: "Painter Matt Black" })),
    );
  });
});

describe("isBlankPaint", () => {
  it("treats an untouched editor row as blank", () => {
    expect(isBlankPaint(paint({ brand: "", name: "" }))).toBe(true);
    expect(isBlankPaint(paint({ brand: "  ", name: " " }))).toBe(true);
  });

  it("keeps a row with only a name", () => {
    expect(isBlankPaint(paint({ brand: "", name: "Nuln Oil" }))).toBe(false);
  });

  it("does not consider a colour alone to be data", () => {
    expect(isBlankPaint(paint({ brand: "", name: "", hex: "#ff0000" }))).toBe(true);
  });
});

describe("aggregatePaints", () => {
  it("collapses the same paint used in several steps", () => {
    const out = aggregatePaints([
      { paints: [paint(), paint({ brand: "Vallejo", name: "White" })] },
      { paints: [paint({ brand: "citadel", name: "NULN OIL" })] },
    ]);
    expect(out.map(formatPaint)).toEqual(["Citadel: Nuln Oil", "Vallejo: White"]);
  });

  it("keeps first-use order", () => {
    const out = aggregatePaints([{ paints: [paint({ name: "Z" })] }, { paints: [paint({ name: "A" })] }]);
    expect(out.map((p) => p.name)).toEqual(["Z", "A"]);
  });

  it("fills in a colour or type recorded on a later mention", () => {
    const out = aggregatePaints([{ paints: [paint()] }, { paints: [paint({ hex: "#123456", type: "wash" })] }]);
    expect(out).toHaveLength(1);
    expect(out[0].hex).toBe("#123456");
    expect(out[0].type).toBe("wash");
  });

  it("does not let a later blank overwrite an earlier value", () => {
    const out = aggregatePaints([
      { paints: [paint({ hex: "#123456", type: "wash" })] },
      { paints: [paint({ hex: "", type: "" })] },
    ]);
    expect(out[0].hex).toBe("#123456");
    expect(out[0].type).toBe("wash");
  });

  it("skips blank rows and tolerates missing paint arrays", () => {
    const out = aggregatePaints([
      { paints: [paint({ brand: "", name: "" })] },
      { paints: null },
      {},
      { paints: [paint()] },
    ]);
    expect(out).toHaveLength(1);
  });

  it("returns an empty palette for no steps", () => {
    expect(aggregatePaints([])).toEqual([]);
  });
});

describe("cleanPaints", () => {
  it("trims and drops blank rows", () => {
    expect(cleanPaints([paint({ brand: " Citadel ", name: " Nuln Oil " }), paint({ brand: "", name: "" })])).toEqual([
      { brand: "Citadel", name: "Nuln Oil", hex: "", type: "" },
    ]);
  });

  it("handles null and undefined", () => {
    expect(cleanPaints(null)).toEqual([]);
    expect(cleanPaints(undefined)).toEqual([]);
  });
});

describe("normalizePaintInput", () => {
  it("trims and derives the dedupe key", () => {
    const out = normalizePaintInput({ brand: "  Citadel ", name: " Nuln Oil ", hex: " #14171a ", type: "wash", quantity: 2 });
    expect(out).toEqual({
      brand: "Citadel",
      name: "Nuln Oil",
      hex: "#14171a",
      type: "wash",
      quantity: 2,
      key: paintKey({ brand: "Citadel", name: "Nuln Oil", hex: "", type: "" }),
    });
  });

  // The property the collection's unique index relies on.
  it("gives casing and whitespace variants of one paint the same key", () => {
    const a = normalizePaintInput({ brand: "Citadel", name: "Nuln Oil" });
    const b = normalizePaintInput({ brand: " CITADEL ", name: "  nuln oil " });
    expect(a!.key).toBe(b!.key);
  });

  it("gives genuinely different paints different keys", () => {
    const a = normalizePaintInput({ brand: "Citadel", name: "Nuln Oil" });
    const b = normalizePaintInput({ brand: "Vallejo", name: "Nuln Oil" });
    const c = normalizePaintInput({ brand: "Citadel", name: "Agrax Earthshade" });
    expect(new Set([a!.key, b!.key, c!.key]).size).toBe(3);
  });

  it("requires a name - a brand alone is not a paint", () => {
    expect(normalizePaintInput({ brand: "Citadel", name: "" })).toBeNull();
    expect(normalizePaintInput({ brand: "Citadel", name: "   " })).toBeNull();
    expect(normalizePaintInput({})).toBeNull();
    expect(normalizePaintInput(null)).toBeNull();
    expect(normalizePaintInput(undefined)).toBeNull();
  });

  it("drops an unrecognised type rather than storing it", () => {
    // The schema enum would reject it, which would surface as a 500 instead of a saved paint.
    expect(normalizePaintInput({ name: "X", type: "sparkly" })!.type).toBe("");
    expect(normalizePaintInput({ name: "X", type: "metallic" })!.type).toBe("metallic");
  });

  it("floors the quantity and never stores a negative", () => {
    expect(normalizePaintInput({ name: "X", quantity: 2.7 })!.quantity).toBe(2);
    expect(normalizePaintInput({ name: "X", quantity: -5 })!.quantity).toBe(0);
    expect(normalizePaintInput({ name: "X", quantity: NaN })!.quantity).toBe(0);
    expect(normalizePaintInput({ name: "X", quantity: null })!.quantity).toBe(0);
  });
});
