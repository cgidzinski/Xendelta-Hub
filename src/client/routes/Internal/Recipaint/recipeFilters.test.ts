import { describe, it, expect } from "vitest";
import { RecipeSummary } from "../../../types/Recipe";
import { applyRecipeFilters, matchesFilter, sortRecipes } from "./recipeFilters";

const recipe = (over: Partial<RecipeSummary>): RecipeSummary => ({
  _id: "1",
  showcase: [],
  title: "Untitled",
  description: "",
  dateCreated: "2026-01-01T00:00:00.000Z",
  dateUpdated: "2026-01-01T00:00:00.000Z",
  isPublic: false,
  author: null,
  owner: null,
  originalRecipeId: null,
  stepCount: 0,
  ...over,
});

describe("matchesFilter", () => {
  it("keeps everything under 'all'", () => {
    expect(matchesFilter(recipe({ isPublic: true }), "all")).toBe(true);
    expect(matchesFilter(recipe({ isPublic: false }), "all")).toBe(true);
  });

  it("splits public from private", () => {
    expect(matchesFilter(recipe({ isPublic: true }), "public")).toBe(true);
    expect(matchesFilter(recipe({ isPublic: true }), "private")).toBe(false);
    expect(matchesFilter(recipe({ isPublic: false }), "private")).toBe(true);
  });

  it("treats a recipe as cloned only when it points at an original", () => {
    expect(matchesFilter(recipe({ originalRecipeId: "abc" }), "cloned")).toBe(true);
    expect(matchesFilter(recipe({ originalRecipeId: null }), "cloned")).toBe(false);
  });
});

describe("sortRecipes", () => {
  const older = recipe({ _id: "older", dateUpdated: "2026-01-01T00:00:00.000Z", dateCreated: "2026-06-01T00:00:00.000Z", title: "Zealot" });
  const newer = recipe({ _id: "newer", dateUpdated: "2026-08-01T00:00:00.000Z", dateCreated: "2026-02-01T00:00:00.000Z", title: "Aspirant" });

  it("puts the most recently updated first", () => {
    expect(sortRecipes([older, newer], "updated").map((r) => r._id)).toEqual(["newer", "older"]);
  });

  it("sorts by creation date independently of update date", () => {
    expect(sortRecipes([newer, older], "created").map((r) => r._id)).toEqual(["older", "newer"]);
  });

  it("sorts titles case-insensitively", () => {
    const lower = recipe({ _id: "lower", title: "apprentice" });
    expect(sortRecipes([older, newer, lower], "title").map((r) => r._id)).toEqual(["lower", "newer", "older"]);
  });

  it("does not mutate the input array", () => {
    const input = [older, newer];
    sortRecipes(input, "updated");
    expect(input.map((r) => r._id)).toEqual(["older", "newer"]);
  });

  it("sorts an unparseable date last instead of scrambling the order", () => {
    const broken = recipe({ _id: "broken", dateUpdated: "not-a-date" });
    expect(sortRecipes([broken, newer, older], "updated").map((r) => r._id)).toEqual(["newer", "older", "broken"]);
  });
});

describe("applyRecipeFilters", () => {
  it("filters before sorting", () => {
    const recipes = [
      recipe({ _id: "a", isPublic: true, dateUpdated: "2026-01-01T00:00:00.000Z" }),
      recipe({ _id: "b", isPublic: false, dateUpdated: "2026-09-01T00:00:00.000Z" }),
      recipe({ _id: "c", isPublic: true, dateUpdated: "2026-05-01T00:00:00.000Z" }),
    ];
    expect(applyRecipeFilters(recipes, "public", "updated").map((r) => r._id)).toEqual(["c", "a"]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(applyRecipeFilters([recipe({ isPublic: true })], "cloned", "updated")).toEqual([]);
  });
});
