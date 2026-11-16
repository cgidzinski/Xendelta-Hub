import type { KitchenItem } from "../../../../hooks/xenkitchen/useKitchen";
import type { KitchenLayout } from "@shared/xenkitchen/kitchen";

/** What goes into the cookbook PDF. `categories` null means all of them; "none" stands for recipes without a category. */
export interface CookbookOptions {
  categories: string[] | null;
  photos: boolean;
  favouritesOnly: boolean;
}

export const NO_CATEGORY = "none";

export interface CookbookCategory {
  _id: string;
  name: string;
  layout?: KitchenLayout;
}

export interface CookbookSection {
  id: string;
  name: string;
  items: KitchenItem[];
}

export const DEFAULT_COOKBOOK_OPTIONS: CookbookOptions = { categories: null, photos: true, favouritesOnly: false };

/** The options as the print page's query string, leaving out what is the default. */
export function cookbookParams(o: CookbookOptions): URLSearchParams {
  const p = new URLSearchParams();
  if (o.categories) p.set("cats", o.categories.join(","));
  if (!o.photos) p.set("photos", "0");
  if (o.favouritesOnly) p.set("fav", "1");
  return p;
}

export function cookbookOptionsFromParams(p: URLSearchParams): CookbookOptions {
  const cats = p.get("cats");
  return {
    categories: cats === null ? null : cats.split(",").filter(Boolean),
    photos: p.get("photos") !== "0",
    favouritesOnly: p.get("fav") === "1",
  };
}

const byTitle = (a: KitchenItem, b: KitchenItem) =>
  (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" });

/**
 * The recipes of a book grouped by category, in the order the categories are kept in, with the recipes without one last.
 * Empty groups are left out. Recipes inside a group are alphabetical, so the contents is easy to scan.
 */
export function buildCookbook(
  items: KitchenItem[],
  categories: CookbookCategory[],
  options: CookbookOptions,
): CookbookSection[] {
  const wanted = options.categories ? new Set(options.categories) : null;
  const chosen = items.filter((i) => {
    if (options.favouritesOnly && !i.favorite) return false;
    return !wanted || wanted.has(i.category?._id ?? NO_CATEGORY);
  });
  const sections: CookbookSection[] = categories.map((c) => ({
    id: c._id,
    name: c.name,
    items: chosen.filter((i) => i.category?._id === c._id).sort(byTitle),
  }));
  sections.push({ id: NO_CATEGORY, name: "Other recipes", items: chosen.filter((i) => !i.category).sort(byTitle) });
  return sections.filter((s) => s.items.length > 0);
}
