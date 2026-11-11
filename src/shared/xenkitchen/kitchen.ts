// Shared XenKitchen vocabulary and pure helpers, used by both the server and the client
// so the two ends agree on enums, filters and how quantities scale.

export type KitchenLayout = "recipe" | "instructions";
export const KITCHEN_LAYOUTS: KitchenLayout[] = ["recipe", "instructions"];

export type CookMethod = "oven" | "microwave" | "air_fryer" | "stovetop" | "grill" | "other";
export const COOK_METHODS: CookMethod[] = ["oven", "microwave", "air_fryer", "stovetop", "grill", "other"];
export const COOK_METHOD_LABELS: Record<CookMethod, string> = {
  oven: "Oven",
  microwave: "Microwave",
  air_fryer: "Air fryer",
  stovetop: "Stovetop",
  grill: "Grill",
  other: "Other",
};

export type KitchenSort = "updated" | "created" | "title" | "time";
export const KITCHEN_SORTS: KitchenSort[] = ["updated", "created", "title", "time"];

/** Keys of the icon set a category can use. The client maps each to an MUI icon. */
export const CATEGORY_ICONS = [
  "restaurant",
  "breakfast",
  "lunch",
  "dinner",
  "sides",
  "snack",
  "dessert",
  "baking",
  "drink",
  "frozen",
  "soup",
  "salad",
  "pizza",
  "fish",
  "meat",
  "vegetarian",
  "kids",
  "party",
] as const;
export type CategoryIcon = (typeof CATEGORY_ICONS)[number];

export const CATEGORY_COLORS = [
  "#e57373",
  "#f06292",
  "#ba68c8",
  "#7986cb",
  "#4fc3f7",
  "#4db6ac",
  "#81c784",
  "#dce775",
  "#ffb74d",
  "#ff8a65",
  "#a1887f",
  "#90a4ae",
];

export interface StarterCategory {
  name: string;
  icon: CategoryIcon;
  color: string;
  layout: KitchenLayout;
}

export const STARTER_CATEGORIES: StarterCategory[] = [
  { name: "Appetizers", icon: "party", color: "#ba68c8", layout: "recipe" },
  { name: "Breakfast", icon: "breakfast", color: "#ffb74d", layout: "recipe" },
  { name: "Lunch", icon: "lunch", color: "#81c784", layout: "recipe" },
  { name: "Dinner", icon: "dinner", color: "#e57373", layout: "recipe" },
  { name: "Sides", icon: "sides", color: "#4db6ac", layout: "recipe" },
  { name: "Snacks", icon: "snack", color: "#ff8a65", layout: "recipe" },
  { name: "Desserts", icon: "dessert", color: "#f06292", layout: "recipe" },
  { name: "Baking", icon: "baking", color: "#a1887f", layout: "recipe" },
  { name: "Drinks", icon: "drink", color: "#4fc3f7", layout: "recipe" },
  { name: "Instructions", icon: "frozen", color: "#7986cb", layout: "instructions" },
];

export const MAX_KITCHEN_IMAGES = 10;

/** Case/whitespace-insensitive key for an ingredient name ("  Olive  Oil" → "olive oil"). */
export function normalizeIngredientName(name: string): string {
  return (name || "").trim().replace(/\s+/g, " ").toLowerCase();
}

/** Normalise a tag the same way everywhere: trimmed, single-spaced, lowercase. */
export function normalizeTag(tag: string): string {
  return (tag || "").trim().replace(/\s+/g, " ").toLowerCase().slice(0, 30);
}

// ---------- quantities ----------

const UNICODE_FRACTIONS: Record<string, number> = {
  "½": 1 / 2,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 1 / 4,
  "¾": 3 / 4,
  "⅕": 1 / 5,
  "⅖": 2 / 5,
  "⅗": 3 / 5,
  "⅘": 4 / 5,
  "⅙": 1 / 6,
  "⅚": 5 / 6,
  "⅛": 1 / 8,
  "⅜": 3 / 8,
  "⅝": 5 / 8,
  "⅞": 7 / 8,
};

/** Parse "1", "1.5", "1/2", "1 1/2", "1½", "½" into a number. Returns null if it isn't one. */
export function parseAmount(raw: string): number | null {
  const s = (raw || "").trim();
  if (!s) return null;
  let m = /^(\d+)?\s*([½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])$/.exec(s);
  if (m) return (m[1] ? Number(m[1]) : 0) + UNICODE_FRACTIONS[m[2]];
  m = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s);
  if (m && Number(m[3]) !== 0) return Number(m[1]) + Number(m[2]) / Number(m[3]);
  m = /^(\d+)\/(\d+)$/.exec(s);
  if (m && Number(m[2]) !== 0) return Number(m[1]) / Number(m[2]);
  m = /^\d*[.,]?\d+$/.exec(s);
  if (m) return Number(s.replace(",", "."));
  return null;
}

const NICE_FRACTIONS: Array<[number, string]> = [
  [1 / 8, "⅛"],
  [1 / 4, "¼"],
  [1 / 3, "⅓"],
  [3 / 8, "⅜"],
  [1 / 2, "½"],
  [5 / 8, "⅝"],
  [2 / 3, "⅔"],
  [3 / 4, "¾"],
  [7 / 8, "⅞"],
];

/** Format a number as a cook would write it: 1.5 → "1½", 0.333 → "⅓", 2.4 → "2.4". */
export function formatAmount(value: number): string {
  if (!isFinite(value) || value <= 0) return "0";
  const whole = Math.floor(value);
  const frac = value - whole;
  if (frac < 0.02) return String(whole);
  if (frac > 0.98) return String(whole + 1);
  for (const [v, glyph] of NICE_FRACTIONS) {
    if (Math.abs(frac - v) < 0.02) return whole ? `${whole}${glyph}` : glyph;
  }
  return String(Math.round(value * 100) / 100);
}

/**
 * Scale a quantity string. Ranges ("2-3") scale both ends; anything that isn't a number
 * ("a pinch", "to taste") is returned unchanged.
 */
export function scaleQuantity(quantity: string, factor: number): string {
  const q = (quantity || "").trim();
  if (!q || factor === 1) return q;
  const range = /^(.+?)\s*[-–]\s*(.+)$/.exec(q);
  if (range) {
    const a = parseAmount(range[1]);
    const b = parseAmount(range[2]);
    if (a !== null && b !== null) return `${formatAmount(a * factor)}–${formatAmount(b * factor)}`;
  }
  const n = parseAmount(q);
  return n === null ? q : formatAmount(n * factor);
}

// ---------- pasted ingredient lines ----------

const KNOWN_UNITS = [
  "teaspoons",
  "teaspoon",
  "tsp",
  "tablespoons",
  "tablespoon",
  "tbsp",
  "tbs",
  "cups",
  "cup",
  "ounces",
  "ounce",
  "oz",
  "pounds",
  "pound",
  "lbs",
  "lb",
  "grams",
  "gram",
  "g",
  "kilograms",
  "kilogram",
  "kg",
  "milliliters",
  "millilitres",
  "milliliter",
  "millilitre",
  "ml",
  "liters",
  "litres",
  "liter",
  "litre",
  "l",
  "pinch",
  "pinches",
  "dash",
  "dashes",
  "cloves",
  "clove",
  "cans",
  "can",
  "packages",
  "package",
  "pkg",
  "slices",
  "slice",
  "sticks",
  "stick",
  "bunch",
  "bunches",
  "handful",
  "handfuls",
  "sprigs",
  "sprig",
  "pieces",
  "piece",
  "quarts",
  "quart",
  "qt",
  "pints",
  "pint",
  "pt",
  "fl oz",
  "stalks",
  "stalk",
  "heads",
  "head",
  "jars",
  "jar",
  "bags",
  "bag",
  "boxes",
  "box",
  "bottles",
  "bottle",
  "sheets",
  "sheet",
  "leaves",
  "leaf",
  "drops",
  "drop",
  "scoops",
  "scoop",
  "packets",
  "packet",
  "dozen",
  "knobs",
  "knob",
  "fillets",
  "fillet",
  "rashers",
  "rasher",
  "strips",
  "strip",
];

export interface ParsedIngredient {
  quantity: string;
  unit: string;
  name: string;
  note: string;
}

/**
 * Split one pasted line like "1 1/2 cups flour, sifted" into quantity/unit/name/note.
 * Bullets and numbering are stripped. Anything it can't make sense of becomes the name.
 */
export function parseIngredientLine(line: string): ParsedIngredient | null {
  let s = (line || "")
    .trim()
    .replace(/^([-*•·▪◦]|\d+[.)])\s+/, "")
    .trim();
  if (!s) return null;

  let quantity = "";
  const qty =
    /^((?:\d+\s+\d+\/\d+)|(?:\d+\/\d+)|(?:\d*[½⅓⅔¼¾⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞])|(?:\d+(?:[.,]\d+)?))(?:\s*[-–]\s*((?:\d+\/\d+)|(?:\d+(?:[.,]\d+)?)))?/.exec(
      s,
    );
  if (qty) {
    quantity = qty[2] ? `${qty[1]}-${qty[2]}` : qty[1];
    s = s.slice(qty[0].length).trim();
  }

  let unit = "";
  const lower = s.toLowerCase();
  for (const u of [...KNOWN_UNITS].sort((a, b) => b.length - a.length)) {
    if (lower === u || lower.startsWith(`${u} `) || lower.startsWith(`${u}.`)) {
      unit = s.slice(0, u.length);
      s = s
        .slice(u.length)
        .replace(/^\.\s*/, "")
        .trim();
      break;
    }
  }
  // "200g flour" — unit glued to the number.
  if (!unit && quantity === "") {
    const glued = /^(\d+(?:[.,]\d+)?)(g|kg|ml|l|oz|lb)\b\s*/i.exec(s);
    if (glued) {
      quantity = glued[1];
      unit = glued[2];
      s = s.slice(glued[0].length);
    }
  }
  if (quantity && !unit) {
    const glued = /^(g|kg|ml|l|oz|lb)\b\s*/i.exec(s);
    if (glued) {
      unit = glued[1];
      s = s.slice(glued[0].length);
    }
  }
  s = s.replace(/^of\s+/i, "");

  let note = "";
  const comma = s.indexOf(",");
  if (comma > 0) {
    note = s.slice(comma + 1).trim();
    s = s.slice(0, comma).trim();
  }
  const paren = /^(.*?)\s*\((.+)\)\s*$/.exec(s);
  if (paren && paren[1]) {
    s = paren[1].trim();
    note = note ? `${paren[2]}, ${note}` : paren[2];
  }

  if (!s && !quantity) return null;
  return { quantity, unit, name: s, note };
}

/** The one-line form the editor shows: "1½ cups flour, sifted". parseIngredientLine reads it back. */
export function ingredientLine(p: { quantity?: string; unit?: string; name?: string; note?: string }): string {
  return [p.quantity, p.unit, p.name].filter(Boolean).join(" ") + (p.note ? `, ${p.note}` : "");
}

export function parseIngredientBlock(text: string): ParsedIngredient[] {
  return (text || "")
    .split(/\r?\n/)
    .map(parseIngredientLine)
    .filter((x): x is ParsedIngredient => !!x && !!x.name);
}

// ---------- summaries ----------

export interface TimedItem {
  prep_minutes?: number | null;
  cook_minutes?: number | null;
  methods?: Array<{ minutes_min?: number | null; minutes_max?: number | null }>;
}

/** Total time for sorting/filtering: prep + cook, or the quickest cooking method. */
export function totalMinutes(item: TimedItem, layout: KitchenLayout): number | null {
  if (layout === "instructions") {
    const times = (item.methods || [])
      .map((m) => m.minutes_max ?? m.minutes_min)
      .filter((n): n is number => typeof n === "number" && n > 0);
    return times.length ? Math.min(...times) : null;
  }
  const t = (item.prep_minutes || 0) + (item.cook_minutes || 0);
  return t > 0 ? t : null;
}

export function formatMinutes(min: number | null | undefined): string {
  if (!min || min <= 0) return "";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function formatMinuteRange(a?: number | null, b?: number | null): string {
  if (a && b && a !== b) return `${a}–${b} min`;
  const one = a || b;
  return one ? `${one} min` : "";
}

// ---------- list filters (shared by the URL on the client and the API query) ----------

export interface KitchenFilters {
  q: string;
  /** Recipes or box instructions only; "" for both. */
  layout: KitchenLayout | "";
  /** Category id, "none" for uncategorised, "" for all. */
  category: string;
  tags: string[];
  ingredients: string[];
  favorite: boolean;
  method: CookMethod | "";
  maxMinutes: number | null;
  sort: KitchenSort;
}

export const EMPTY_FILTERS: KitchenFilters = {
  q: "",
  layout: "",
  category: "",
  tags: [],
  ingredients: [],
  favorite: false,
  method: "",
  maxMinutes: null,
  sort: "updated",
};

interface ParamsLike {
  get(name: string): string | null;
  getAll(name: string): string[];
}

export function filtersFromParams(p: ParamsLike, defaultSort: KitchenSort = "updated"): KitchenFilters {
  const method = p.get("method") || "";
  const sort = p.get("sort") || "";
  const max = Number(p.get("max_minutes"));
  const type = p.get("type");
  return {
    q: (p.get("q") || "").slice(0, 100),
    layout: type === "recipes" ? "recipe" : type === "instructions" ? "instructions" : "",
    category: p.get("category") || "",
    tags: p.getAll("tag").filter(Boolean).slice(0, 10),
    ingredients: p.getAll("ingredient").filter(Boolean).slice(0, 10),
    favorite: p.get("favorite") === "1",
    method: (COOK_METHODS as string[]).includes(method) ? (method as CookMethod) : "",
    maxMinutes: Number.isFinite(max) && max > 0 ? Math.min(max, 100000) : null,
    sort: (KITCHEN_SORTS as string[]).includes(sort) ? (sort as KitchenSort) : defaultSort,
  };
}

/** Only non-default values are written, so a plain list has a clean URL. */
export function filtersToParams(f: KitchenFilters, defaultSort: KitchenSort = "updated"): URLSearchParams {
  const p = new URLSearchParams();
  if (f.layout) p.set("type", f.layout === "recipe" ? "recipes" : "instructions");
  if (f.q) p.set("q", f.q);
  if (f.category) p.set("category", f.category);
  f.tags.forEach((t) => p.append("tag", t));
  f.ingredients.forEach((i) => p.append("ingredient", i));
  if (f.favorite) p.set("favorite", "1");
  if (f.method) p.set("method", f.method);
  if (f.maxMinutes) p.set("max_minutes", String(f.maxMinutes));
  if (f.sort !== defaultSort) p.set("sort", f.sort);
  return p;
}

/** Number of active filters (search and sort excluded), for the Filters button badge. */
export function activeFilterCount(f: KitchenFilters): number {
  return (
    (f.layout ? 1 : 0) +
    f.tags.length +
    f.ingredients.length +
    (f.favorite ? 1 : 0) +
    (f.method ? 1 : 0) +
    (f.maxMinutes ? 1 : 0)
  );
}
