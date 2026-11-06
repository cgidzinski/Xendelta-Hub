import { describe, it, expect } from "vitest";
import {
  EMPTY_FILTERS, activeFilterCount, filtersFromParams, filtersToParams, formatAmount, formatMinutes,
  ingredientLine, normalizeIngredientName, parseAmount, parseIngredientBlock, parseIngredientLine, scaleQuantity, totalMinutes,
} from "./kitchen";

describe("parseAmount", () => {
  it("reads whole, decimal, fraction, mixed and unicode amounts", () => {
    expect(parseAmount("2")).toBe(2);
    expect(parseAmount("1.5")).toBe(1.5);
    expect(parseAmount("1,5")).toBe(1.5);
    expect(parseAmount("1/2")).toBe(0.5);
    expect(parseAmount("1 1/2")).toBe(1.5);
    expect(parseAmount("½")).toBe(0.5);
    expect(parseAmount("2¼")).toBe(2.25);
  });
  it("returns null for words and divide-by-zero", () => {
    expect(parseAmount("a pinch")).toBeNull();
    expect(parseAmount("1/0")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
});

describe("formatAmount / scaleQuantity", () => {
  it("prefers kitchen fractions", () => {
    expect(formatAmount(1.5)).toBe("1½");
    expect(formatAmount(1 / 3)).toBe("⅓");
    expect(formatAmount(2)).toBe("2");
    expect(formatAmount(2.4)).toBe("2.4");
  });
  it("scales numbers and ranges, leaves words alone", () => {
    expect(scaleQuantity("1/2", 2)).toBe("1");
    expect(scaleQuantity("1 1/2", 2)).toBe("3");
    expect(scaleQuantity("2-3", 2)).toBe("4–6");
    expect(scaleQuantity("to taste", 3)).toBe("to taste");
    expect(scaleQuantity("3", 1)).toBe("3");
  });
});

describe("parseIngredientLine", () => {
  it("splits quantity, unit, name and note", () => {
    expect(parseIngredientLine("1 1/2 cups flour, sifted")).toEqual({ quantity: "1 1/2", unit: "cups", name: "flour", note: "sifted" });
    expect(parseIngredientLine("- 2 tbsp olive oil")).toEqual({ quantity: "2", unit: "tbsp", name: "olive oil", note: "" });
    expect(parseIngredientLine("200g butter (softened)")).toEqual({ quantity: "200", unit: "g", name: "butter", note: "softened" });
    expect(parseIngredientLine("3 eggs")).toEqual({ quantity: "3", unit: "", name: "eggs", note: "" });
    expect(parseIngredientLine("Salt")).toEqual({ quantity: "", unit: "", name: "Salt", note: "" });
  });
  it("does not mistake a word starting with a unit for the unit", () => {
    expect(parseIngredientLine("2 garlic cloves")?.unit).toBe("");
    expect(parseIngredientLine("1 large onion")?.name).toBe("large onion");
  });
  it("skips blank lines in a block", () => {
    expect(parseIngredientBlock("1 cup rice\n\n  \n2 cups water")).toHaveLength(2);
  });
});

describe("normalizeIngredientName", () => {
  it("lowercases and collapses whitespace", () => {
    expect(normalizeIngredientName("  Olive   Oil ")).toBe("olive oil");
  });
});

describe("totalMinutes / formatMinutes", () => {
  it("adds prep and cook for recipes", () => {
    expect(totalMinutes({ prep_minutes: 10, cook_minutes: 25 }, "recipe")).toBe(35);
    expect(totalMinutes({}, "recipe")).toBeNull();
  });
  it("uses the quickest method for instructions", () => {
    expect(totalMinutes({ methods: [{ minutes_min: 18, minutes_max: 20 }, { minutes_min: 5 }] }, "instructions")).toBe(5);
  });
  it("formats hours", () => {
    expect(formatMinutes(90)).toBe("1 h 30 min");
    expect(formatMinutes(45)).toBe("45 min");
  });
});

describe("filters <-> params", () => {
  it("round-trips and only writes non-defaults", () => {
    const f = { ...EMPTY_FILTERS, layout: "instructions" as const, q: "soup", tags: ["quick", "vegan"], favorite: true, method: "oven" as const, maxMinutes: 30, sort: "title" as const };
    const p = filtersToParams(f);
    expect(filtersFromParams(p)).toEqual(f);
    expect(filtersToParams(EMPTY_FILTERS).toString()).toBe("");
    expect(activeFilterCount(f)).toBe(6);
  });
  it("ignores junk values", () => {
    const f = filtersFromParams(new URLSearchParams("method=laser&sort=random&max_minutes=-4"));
    expect(f.method).toBe("");
    expect(f.sort).toBe("updated");
    expect(f.maxMinutes).toBeNull();
    expect(filtersFromParams(new URLSearchParams("type=pasta")).layout).toBe("");
    expect(filtersFromParams(new URLSearchParams("type=recipes")).layout).toBe("recipe");
  });
});

describe("ingredientLine", () => {
  it("joins the parts the way people write them", () => {
    expect(ingredientLine({ quantity: "1 1/2", unit: "cups", name: "flour", note: "sifted" })).toBe("1 1/2 cups flour, sifted");
    expect(ingredientLine({ quantity: "", unit: "", name: "Salt", note: "" })).toBe("Salt");
  });
  it("reads back to the same fields for typical ingredients", () => {
    for (const p of [
      { quantity: "2", unit: "tbsp", name: "olive oil", note: "" },
      { quantity: "1 1/2", unit: "cups", name: "flour", note: "sifted" },
      { quantity: "3", unit: "", name: "eggs", note: "beaten" },
      { quantity: "200", unit: "g", name: "butter", note: "" },
      { quantity: "", unit: "", name: "Salt and pepper", note: "to taste" },
    ]) {
      expect(parseIngredientLine(ingredientLine(p))).toEqual(p);
    }
  });
});
