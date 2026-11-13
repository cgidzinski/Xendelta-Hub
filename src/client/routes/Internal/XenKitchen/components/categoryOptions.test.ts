import { describe, expect, it } from "vitest";
import type { KitchenCategory } from "../../../../hooks/xenkitchen/useKitchen";
import { categoryOptions } from "./categoryOptions";

const cat = (id: string, name: string, layout: "recipe" | "instructions", count: number): KitchenCategory => ({
  _id: id,
  book_id: "b",
  name,
  icon: "restaurant",
  color: "#e57373",
  layout,
  order: 0,
  count,
});

const categories = [
  cat("d", "Dinner", "recipe", 12),
  cat("s", "Sides", "recipe", 3),
  cat("i", "Instructions", "instructions", 6),
];

describe("categoryOptions", () => {
  it("offers All, every category, then Uncategorised", () => {
    const o = categoryOptions({ categories, total: 24, uncategorised: 3, layout: "" });
    expect(o.map((x) => [x.id, x.label, x.count])).toEqual([
      ["", "All", 24],
      ["d", "Dinner", 12],
      ["s", "Sides", 3],
      ["i", "Instructions", 6],
      ["none", "Uncategorised", 3],
    ]);
    expect(o[0].color).toBeUndefined();
    expect(o[1].color).toBe("#e57373");
  });

  it("omits Uncategorised when nothing is uncategorised", () => {
    const o = categoryOptions({ categories, total: 21, uncategorised: 0, layout: "" });
    expect(o.some((x) => x.id === "none")).toBe(false);
  });

  it("with the recipes type: only recipe categories, and All counts them plus the uncategorised", () => {
    const o = categoryOptions({ categories, total: 24, uncategorised: 3, layout: "recipe" });
    expect(o.map((x) => x.label)).toEqual(["All", "Dinner", "Sides", "Uncategorised"]);
    expect(o[0].count).toBe(12 + 3 + 3);
  });

  it("with the instructions type: only those categories, All counts just them, no Uncategorised", () => {
    const o = categoryOptions({ categories, total: 24, uncategorised: 3, layout: "instructions" });
    expect(o.map((x) => [x.label, x.count])).toEqual([
      ["All", 6],
      ["Instructions", 6],
    ]);
  });
});
