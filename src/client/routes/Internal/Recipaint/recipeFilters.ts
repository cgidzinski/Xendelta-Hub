import { RecipeSummary } from "../../../types/Recipe";

export type RecipeFilter = "all" | "private" | "public" | "cloned";
export type RecipeSort = "updated" | "created" | "title";

export const RECIPE_FILTERS: { value: RecipeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "private", label: "Private" },
  { value: "public", label: "Public" },
  { value: "cloned", label: "Cloned" },
];

export const RECIPE_SORTS: { value: RecipeSort; label: string }[] = [
  { value: "updated", label: "Recently updated" },
  { value: "created", label: "Recently created" },
  { value: "title", label: "Title (A-Z)" },
];

export function matchesFilter(recipe: RecipeSummary, filter: RecipeFilter): boolean {
  switch (filter) {
    case "private":
      return !recipe.isPublic;
    case "public":
      return recipe.isPublic;
    case "cloned":
      return recipe.originalRecipeId != null;
    case "all":
      return true;
  }
}

const timeOf = (iso: string): number => {
  const t = new Date(iso).getTime();
  // A missing or unparseable date sorts last rather than poisoning the comparison with NaN.
  return Number.isNaN(t) ? -Infinity : t;
};

export function sortRecipes(recipes: RecipeSummary[], sort: RecipeSort): RecipeSummary[] {
  const sorted = [...recipes];
  switch (sort) {
    case "updated":
      return sorted.sort((a, b) => timeOf(b.dateUpdated) - timeOf(a.dateUpdated));
    case "created":
      return sorted.sort((a, b) => timeOf(b.dateCreated) - timeOf(a.dateCreated));
    case "title":
      return sorted.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
  }
}

/** Filter then sort. Both are cheap and run over the already-fetched page. */
export function applyRecipeFilters(
  recipes: RecipeSummary[],
  filter: RecipeFilter,
  sort: RecipeSort,
): RecipeSummary[] {
  return sortRecipes(
    recipes.filter((recipe) => matchesFilter(recipe, filter)),
    sort,
  );
}
