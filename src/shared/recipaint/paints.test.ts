import { describe, it, expect } from "vitest";
import { RecipePaint, aggregatePaints, cleanPaints, formatPaint, isBlankPaint, paintKey } from "./paints";

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
