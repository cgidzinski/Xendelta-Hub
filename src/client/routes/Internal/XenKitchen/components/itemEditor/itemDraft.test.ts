import { describe, it, expect } from "vitest";
import { draftFromImport, inputFrom } from "./itemDraft";
import type { ImportedKitchenRecipe } from "../../../../../hooks/xenkitchen/useKitchen";

const recipe: ImportedKitchenRecipe = {
  title: "Fluffy Pancakes",
  description: "The best.",
  servings: 4,
  prep_minutes: 10,
  cook_minutes: null,
  ingredients: [
    { quantity: "1 1/2", unit: "cups", name: "flour", note: "sifted", section: "" },
    { quantity: "", unit: "", name: "Salt", note: "", section: "" },
  ],
  steps: [
    { text: "Mix.", timer_minutes: null },
    { text: "Fry.", timer_minutes: null },
  ],
  tags: ["breakfast", "quick"],
  source_url: "https://food.example.com/pancakes",
  image_url: "https://img.example.com/p.jpg",
};

describe("draftFromImport", () => {
  it("fills the editor from the recipe and keeps the chosen category", () => {
    const d = draftFromImport(recipe, "cat1");
    expect(d).toMatchObject({
      title: "Fluffy Pancakes",
      description: "The best.",
      category_id: "cat1",
      servings: "4",
      prep_minutes: "10",
      cook_minutes: "",
      tags: ["breakfast", "quick"],
      source_url: "https://food.example.com/pancakes",
    });
    expect(d.steps.map((s) => s.text)).toEqual(["Mix.", "Fry."]);
    expect(d.ingredients.map((r) => (r.kind === "ingredient" ? r.text : r.name))).toEqual([
      "1 1/2 cups flour, sifted",
      "Salt",
    ]);
  });

  it("saves back to the same quantities, units, names and notes without re-reading them", () => {
    const input = inputFrom(draftFromImport(recipe, null));
    expect(input.ingredients).toEqual([
      { quantity: "1 1/2", unit: "cups", name: "flour", note: "sifted", section: "" },
      { quantity: "", unit: "", name: "Salt", note: "", section: "" },
    ]);
    expect(input.steps).toEqual([
      { text: "Mix.", timer_minutes: null },
      { text: "Fry.", timer_minutes: null },
    ]);
    expect(input).toMatchObject({ title: "Fluffy Pancakes", servings: 4, prep_minutes: 10, cook_minutes: null });
    expect(input.source_url).toBe("https://food.example.com/pancakes");
  });

  it("leaves one blank ingredient and step to type into when the page had none", () => {
    const d = draftFromImport({ ...recipe, ingredients: [], steps: [] }, null);
    expect(d.ingredients).toHaveLength(1);
    expect(d.steps).toHaveLength(1);
  });
});
