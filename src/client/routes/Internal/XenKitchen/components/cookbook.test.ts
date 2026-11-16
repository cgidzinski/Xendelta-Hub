import { describe, it, expect } from "vitest";
import type { KitchenItem } from "../../../../hooks/xenkitchen/useKitchen";
import { buildCookbook, cookbookOptionsFromParams, cookbookParams, DEFAULT_COOKBOOK_OPTIONS } from "./cookbook";

const item = (title: string, category: string | null, favorite = false) =>
  ({
    _id: title,
    title,
    favorite,
    category: category ? { _id: category, name: category, color: "", icon: "", layout: "recipe" } : null,
  }) as unknown as KitchenItem;

const categories = [
  { _id: "dinner", name: "Dinners" },
  { _id: "dessert", name: "Desserts" },
];
const items = [
  item("Pie", "dessert"),
  item("Curry", "dinner", true),
  item("Chilli", "dinner"),
  item("Toast", null, true),
];

describe("the cookbook's contents", () => {
  it("groups recipes by category in the book's order, alphabetical inside, with uncategorised last", () => {
    const sections = buildCookbook(items, categories, DEFAULT_COOKBOOK_OPTIONS);
    expect(sections.map((s) => [s.name, s.items.map((i) => i.title)])).toEqual([
      ["Dinners", ["Chilli", "Curry"]],
      ["Desserts", ["Pie"]],
      ["Other recipes", ["Toast"]],
    ]);
  });

  it("keeps only the chosen categories, including recipes without one", () => {
    const sections = buildCookbook(items, categories, { ...DEFAULT_COOKBOOK_OPTIONS, categories: ["dessert", "none"] });
    expect(sections.map((s) => s.name)).toEqual(["Desserts", "Other recipes"]);
  });

  it("keeps only favourites when asked, and drops categories left empty", () => {
    const sections = buildCookbook(items, categories, { ...DEFAULT_COOKBOOK_OPTIONS, favouritesOnly: true });
    expect(sections.map((s) => [s.name, s.items.map((i) => i.title)])).toEqual([
      ["Dinners", ["Curry"]],
      ["Other recipes", ["Toast"]],
    ]);
  });

  it("round-trips the options through the address", () => {
    const options = { categories: ["dinner", "none"], photos: false, favouritesOnly: true };
    expect(cookbookOptionsFromParams(cookbookParams(options))).toEqual(options);
    expect(cookbookParams(DEFAULT_COOKBOOK_OPTIONS).toString()).toBe("");
    expect(cookbookOptionsFromParams(new URLSearchParams(""))).toEqual(DEFAULT_COOKBOOK_OPTIONS);
  });
});
