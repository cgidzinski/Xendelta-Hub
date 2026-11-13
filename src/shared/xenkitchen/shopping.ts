import { formatAmount, normalizeIngredientName, parseAmount } from "./kitchen";

// A shopping list from planned meals: every ingredient of every planned recipe, scaled to the servings planned, with the
// same ingredient in the same unit added together. Pure, so the server (which builds it) and the tests share one set of rules.

export interface PlannedMeal {
  title: string;
  /** Servings planned for this meal; null or 0 means "as the recipe is written". */
  servings: number | null;
  /** Servings the recipe is written for, when it says. */
  recipeServings: number | null;
  ingredients: Array<{ name: string; quantity: string; unit: string }>;
}

export interface ShoppingLine {
  name: string;
  /** The total, as a cook would write it ("2½"), or "" when no amount was given (salt, "a pinch"). */
  quantity: string;
  unit: string;
  /** The recipes it is for, once each, in the order they were planned. */
  sources: string[];
}

// Spellings of a unit that mean the same, so "2 cups" and "1 cup" add up. Anything else is kept as written (lower-cased).
const UNIT_ALIASES: Record<string, string> = {
  teaspoon: "tsp",
  teaspoons: "tsp",
  tsps: "tsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tbs: "tbsp",
  tbsps: "tbsp",
  cups: "cup",
  ounce: "oz",
  ounces: "oz",
  pound: "lb",
  pounds: "lb",
  lbs: "lb",
  gram: "g",
  grams: "g",
  kilogram: "kg",
  kilograms: "kg",
  milliliter: "ml",
  milliliters: "ml",
  millilitre: "ml",
  millilitres: "ml",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
  clove: "clove",
  cloves: "clove",
  can: "can",
  cans: "can",
  slice: "slice",
  slices: "slice",
  stick: "stick",
  sticks: "stick",
  bunch: "bunch",
  bunches: "bunch",
  package: "package",
  packages: "package",
  pkg: "package",
};
const unitKey = (unit: string) => {
  const u = unit.trim().toLowerCase().replace(/\.$/, "");
  return UNIT_ALIASES[u] ?? u;
};
// Units that are words get an "s" for more than one ("cups"); abbreviations (tsp, g, oz) never do.
const PLURALS: Record<string, string> = {
  cup: "cups",
  clove: "cloves",
  can: "cans",
  slice: "slices",
  stick: "sticks",
  bunch: "bunches",
  package: "packages",
};
/** How to print a unit for a total: a spelling we know is printed the one way, anything else as it was first written. */
const unitLabel = (written: string, total: number) => {
  const key = unitKey(written);
  const known = key in PLURALS || Object.values(UNIT_ALIASES).includes(key);
  if (!known) return written;
  return total > 1 && PLURALS[key] ? PLURALS[key] : key;
};

/** The number in a quantity: "2", "1 1/2", "½", or a range ("2-3", where the larger end is taken so there's enough). */
function amountOf(quantity: string): number | null {
  const q = quantity.trim();
  if (!q) return null;
  const range = /^(.+?)\s*[-–]\s*(.+)$/.exec(q);
  if (range) {
    const [a, b] = [parseAmount(range[1]), parseAmount(range[2])];
    if (a !== null && b !== null) return Math.max(a, b);
  }
  return parseAmount(q);
}

/** Merge the ingredients of planned meals into one list, sorted by name. */
export function buildShoppingList(meals: PlannedMeal[]): ShoppingLine[] {
  const merged = new Map<string, { name: string; unit: string; total: number; sources: string[] }>();
  for (const meal of meals) {
    const factor =
      meal.servings && meal.servings > 0 && meal.recipeServings && meal.recipeServings > 0
        ? meal.servings / meal.recipeServings
        : 1;
    for (const ing of meal.ingredients) {
      const name = ing.name.trim();
      if (!name) continue;
      const key = `${normalizeIngredientName(name)}|${unitKey(ing.unit)}`;
      const line = merged.get(key) ?? { name, unit: ing.unit.trim(), total: 0, sources: [] };
      const amount = amountOf(ing.quantity);
      // An amount that can't be read ("a pinch") adds nothing to the total, but the ingredient is still on the list.
      if (amount !== null) line.total += amount * factor;
      if (!line.sources.includes(meal.title)) line.sources.push(meal.title);
      merged.set(key, line);
    }
  }
  return [...merged.values()]
    .map((l) => ({
      name: l.name,
      quantity: l.total > 0 ? formatAmount(l.total) : "",
      unit: l.total > 0 ? unitLabel(l.unit, l.total) : "",
      sources: l.sources,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** One line of the list as text: "2½ cups flour", "salt". */
export const shoppingLineText = (line: Pick<ShoppingLine, "name" | "quantity" | "unit">) =>
  [line.quantity, line.quantity ? line.unit : "", line.name].filter(Boolean).join(" ");
