import { describe, it, expect } from "vitest";
import { buildShoppingList, shoppingLineText, type PlannedMeal } from "./shopping";

const meal = (
  title: string,
  ingredients: Array<[string, string, string]>,
  servings: number | null = null,
  recipeServings: number | null = null,
): PlannedMeal => ({
  title,
  servings,
  recipeServings,
  ingredients: ingredients.map(([quantity, unit, name]) => ({ quantity, unit, name })),
});
const texts = (meals: PlannedMeal[]) => buildShoppingList(meals).map(shoppingLineText);

describe("buildShoppingList", () => {
  it("adds the same ingredient in the same unit across meals, and sorts by name", () => {
    const list = texts([
      meal("Pancakes", [
        ["1 1/2", "cups", "flour"],
        ["2", "", "eggs"],
      ]),
      meal("Bread", [
        ["2", "cups", "Flour"],
        ["1", "tsp", "salt"],
      ]),
    ]);
    expect(list).toEqual(["2 eggs", "3½ cups flour", "1 tsp salt"]);
  });

  it("scales a recipe to the servings planned", () => {
    expect(
      texts([
        meal(
          "Soup",
          [
            ["2", "cups", "stock"],
            ["1", "", "onion"],
          ],
          8,
          4,
        ),
      ]),
    ).toEqual(["2 onion", "4 cups stock"]);
    expect(texts([meal("Soup", [["2", "cups", "stock"]], 2, 4)])).toEqual(["1 cup stock"]);
  });

  it("uses the recipe as written when either servings figure is missing", () => {
    expect(texts([meal("A", [["3", "", "eggs"]], 6, null)])).toEqual(["3 eggs"]);
    expect(texts([meal("B", [["3", "", "eggs"]], null, 4)])).toEqual(["3 eggs"]);
    expect(texts([meal("C", [["3", "", "eggs"]], 0, 4)])).toEqual(["3 eggs"]);
  });

  it("counts a recipe planned twice twice", () => {
    expect(texts([meal("Pasta", [["200", "g", "pasta"]]), meal("Pasta", [["200", "g", "pasta"]])])).toEqual([
      "400 g pasta",
    ]);
  });

  it("treats unit spellings as the same, but different units as different lines", () => {
    expect(
      texts([
        meal("A", [["1", "cup", "milk"]]),
        meal("B", [["2", "cups", "milk"]]),
        meal("C", [["1", "Tablespoons", "sugar"]]),
        meal("D", [["2", "tbsp", "sugar"]]),
      ]),
    ).toEqual(["3 cups milk", "3 tbsp sugar"]);
    expect(texts([meal("A", [["1", "cup", "milk"]]), meal("B", [["200", "ml", "milk"]])])).toEqual([
      "1 cup milk",
      "200 ml milk",
    ]);
  });

  it("adds fractions, and takes the larger end of a range so there's enough", () => {
    expect(texts([meal("A", [["1/2", "cup", "oil"]]), meal("B", [["¼", "cup", "oil"]])])).toEqual(["¾ cup oil"]);
    expect(texts([meal("A", [["2-3", "", "carrots"]])])).toEqual(["3 carrots"]);
  });

  it("keeps an ingredient with no amount, and doesn't let it spoil one that has", () => {
    expect(
      texts([
        meal("A", [
          ["", "", "salt"],
          ["a pinch", "", "pepper"],
        ]),
      ]),
    ).toEqual(["pepper", "salt"]);
    expect(texts([meal("A", [["2", "", "eggs"]]), meal("B", [["", "", "eggs"]])])).toEqual(["2 eggs"]);
  });

  it("lists which recipes each line is for, once each", () => {
    const list = buildShoppingList([
      meal("Pancakes", [
        ["1", "cup", "flour"],
        ["1", "cup", "flour"],
      ]),
      meal("Bread", [["2", "cup", "flour"]]),
      meal("Pancakes", [["1", "cup", "flour"]]),
    ]);
    expect(list).toEqual([{ name: "flour", quantity: "5", unit: "cups", sources: ["Pancakes", "Bread"] }]);
  });

  it("skips blank ingredients, and gives nothing for no meals", () => {
    expect(
      texts([
        meal("A", [
          ["1", "cup", "  "],
          ["", "", ""],
        ]),
      ]),
    ).toEqual([]);
    expect(buildShoppingList([])).toEqual([]);
  });
});
