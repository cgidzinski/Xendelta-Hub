import { describe, it, expect } from "vitest";
import {
  RecipePaint,
  aggregatePaints,
  cleanPaints,
  formatPaint,
  isBlankPaint,
  catalogueKey,
  normalizePaintInput,
  paintKey,
  paintTypeFromDataset,
  describePaintDetail,
  PAINT_TYPES,
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
    const out = normalizePaintInput({
      brand: "  Citadel ",
      name: " Nuln Oil ",
      range: " Shade ",
      hex: " #14171a ",
      type: "wash",
      quantity: 2,
      catalogueKey: " cat-key ",
    });
    expect(out).toEqual({
      brand: "Citadel",
      name: "Nuln Oil",
      range: "Shade",
      hex: "#14171a",
      type: "wash",
      quantity: 2,
      catalogueKey: "cat-key",
      // Range-aware, so two ranges sharing a name stay distinct.
      key: catalogueKey({ brand: "Citadel", range: "Shade", name: "Nuln Oil" }),
    });
  });

  it("separates two library paints that share a name across ranges", () => {
    const warpaints = normalizePaintInput({ brand: "Army Painter", name: "Warlock Purple", range: "Warpaints" });
    const air = normalizePaintInput({ brand: "Army Painter", name: "Warlock Purple", range: "Warpaints Air" });
    expect(warpaints!.key).not.toBe(air!.key);
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

describe("catalogueKey", () => {
  const warpaints = { brand: "Army Painter", range: "Warpaints", name: "Warlock Purple" };
  const air = { brand: "Army Painter", range: "Warpaints Air", name: "Warlock Purple" };

  // The whole reason the range is part of a paint's identity: these are different colours.
  it("separates one name that exists in two ranges", () => {
    expect(catalogueKey(warpaints)).not.toBe(catalogueKey(air));
  });

  it("collapses casing and whitespace variants of one paint", () => {
    expect(catalogueKey({ brand: " ARMY painter ", range: "  warpaints ", name: "WARLOCK purple" })).toBe(
      catalogueKey(warpaints),
    );
  });

  it("does not collide across the brand/range/name boundaries", () => {
    expect(catalogueKey({ brand: "a b", range: "c", name: "d" })).not.toBe(
      catalogueKey({ brand: "a", range: "b c", name: "d" }),
    );
    expect(catalogueKey({ brand: "a", range: "b", name: "c d" })).not.toBe(
      catalogueKey({ brand: "a", range: "b c", name: "d" }),
    );
  });

  it("is a different identity from paintKey", () => {
    // A recipe step keys on brand+name and carries no range; the two must not be conflated.
    expect(catalogueKey(warpaints)).not.toBe(paintKey({ brand: "Army Painter", name: "Warlock Purple", hex: "", type: "" }));
  });

  it("tolerates a missing range", () => {
    expect(catalogueKey({ brand: "Citadel", range: "", name: "Nuln Oil" })).toBe(
      catalogueKey({ brand: "Citadel", range: "  ", name: "Nuln Oil" }),
    );
  });
});

describe("paintTypeFromDataset", () => {
  it("maps the Citadel-style ranges onto our enum", () => {
    expect(paintTypeFromDataset("Base", "standard")).toBe("base");
    expect(paintTypeFromDataset("Layer", "standard")).toBe("layer");
    expect(paintTypeFromDataset("Shade", "wash")).toBe("wash");
    expect(paintTypeFromDataset("Contrast", "standard")).toBe("contrast");
    expect(paintTypeFromDataset("Technical", "standard")).toBe("technical");
  });

  it("recognises the same categories inside a longer range name", () => {
    expect(paintTypeFromDataset("Quickshade Washes Set", "standard")).toBe("wash");
    expect(paintTypeFromDataset("Metallic Colours Paint Set", "standard")).toBe("metallic");
    expect(paintTypeFromDataset("Speedpaint Set", "standard")).toBe("contrast");
  });

  it("does not let a compound range match an exact category", () => {
    // "Warpaints Air" must not be read as the Citadel "Base"/"Layer" categories.
    expect(paintTypeFromDataset("Warpaints Air", "standard")).toBe("");
  });

  it("falls back to the coarse dataset type", () => {
    expect(paintTypeFromDataset("Model Air", "metallic")).toBe("metallic");
    expect(paintTypeFromDataset("Game Color", "ink")).toBe("wash");
  });

  it("yields an empty type rather than something the schema enum would reject", () => {
    for (const value of ["Dry", "Spray", "Glaze", "Model Color", "", null, undefined]) {
      const out = paintTypeFromDataset(value, "standard");
      expect([...PAINT_TYPES, ""], `range=${value}`).toContain(out);
    }
    expect(paintTypeFromDataset("Dry", "standard")).toBe("");
  });
});

describe("describePaintDetail", () => {
  it("joins the parts that carry information", () => {
    expect(describePaintDetail({ brand: "Vallejo", range: "Model Color", type: "base" })).toBe(
      "Vallejo - Model Color - base",
    );
  });

  // Citadel names its ranges after the type they contain, so a naive join reads
  // "Citadel Colour - Base - base".
  it("drops a type that just repeats the range", () => {
    expect(describePaintDetail({ brand: "Citadel Colour", range: "Base", type: "base" })).toBe("Citadel Colour - Base");
    expect(describePaintDetail({ range: "Layer", type: "layer" })).toBe("Layer");
    expect(describePaintDetail({ range: "Shade", type: "wash" })).toBe("Shade - wash");
  });

  it("skips blanks and trims", () => {
    expect(describePaintDetail({ brand: " Citadel ", range: "", type: "  " })).toBe("Citadel");
    expect(describePaintDetail({})).toBe("");
  });
});
