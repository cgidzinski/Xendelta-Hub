import { ingredientLine, parseIngredientLine, type CookMethod } from "@shared/xenkitchen/kitchen";
import {
  type ImportedKitchenRecipe,
  type KitchenItem,
  type KitchenItemInput,
  type KitchenMethod,
} from "../../../../../hooks/xenkitchen/useKitchen";

// ---------- draft shape ----------

/**
 * An ingredient is edited as one line ("1½ cups flour, sifted") and split into
 * quantity/unit/name/note on save. `parsed` keeps the stored fields of an untouched line, so
 * opening and saving an item never re-parses (and so never reshuffles) what was there.
 */
export type IngredientRow =
  | { key: string; kind: "section"; name: string }
  | { key: string; kind: "ingredient"; _id?: string; text: string; original?: string; parsed?: Parsed };

export interface Parsed {
  quantity: string;
  unit: string;
  name: string;
  note: string;
}

export interface StepRow {
  key: string;
  _id?: string;
  text: string;
  timer: string;
}

export interface MethodRow extends Omit<KitchenMethod, "temp" | "minutes_min" | "minutes_max" | "steps"> {
  key: string;
  temp: string;
  minutes_min: string;
  minutes_max: string;
  stepsText: string;
}

export interface Draft {
  title: string;
  description: string;
  category_id: string | null;
  tags: string[];
  notes: string;
  servings: string;
  prep_minutes: string;
  cook_minutes: string;
  ingredients: IngredientRow[];
  steps: StepRow[];
  brand: string;
  methods: MethodRow[];
  storage_note: string;
  /** Where the recipe was imported from, "" for one written here. */
  source_url: string;
}

export let keySeq = 0;

export const newKey = () => `k${++keySeq}`;

export const numStr = (n: number | null | undefined) => (n || n === 0 ? String(n) : "");

export const strNum = (s: string): number | null => {
  const n = Number(s);
  return s.trim() !== "" && Number.isFinite(n) && n >= 0 ? n : null;
};

export function parseRow(row: Extract<IngredientRow, { kind: "ingredient" }>): Parsed | null {
  if (row.parsed && row.text === row.original) return row.parsed;
  const p = parseIngredientLine(row.text);
  return p && (p.name || p.quantity) ? p : null;
}

export const blankIngredient = (): IngredientRow => ({ key: newKey(), kind: "ingredient", text: "" });

export const blankStep = (): StepRow => ({ key: newKey(), text: "", timer: "" });

export const blankMethod = (method: CookMethod = "oven"): MethodRow => ({
  key: newKey(),
  method,
  temp: "",
  temp_unit: "F",
  power: "",
  minutes_min: "",
  minutes_max: "",
  preheat: method === "oven",
  stepsText: "",
});

export function draftFrom(item: KitchenItem | null | undefined, categoryId: string | null): Draft {
  if (!item) {
    return {
      title: "",
      description: "",
      category_id: categoryId,
      tags: [],
      notes: "",
      servings: "",
      prep_minutes: "",
      cook_minutes: "",
      ingredients: [blankIngredient()],
      steps: [blankStep()],
      brand: "",
      methods: [blankMethod()],
      storage_note: "",
      source_url: "",
    };
  }
  const ingredients: IngredientRow[] = [];
  let section = "";
  for (const ing of item.ingredients) {
    if ((ing.section || "") !== section) {
      section = ing.section || "";
      if (section) ingredients.push({ key: newKey(), kind: "section", name: section });
    }
    const parsed = { quantity: ing.quantity, unit: ing.unit, name: ing.name, note: ing.note };
    const text = ingredientLine(parsed);
    ingredients.push({ key: newKey(), kind: "ingredient", _id: ing._id, text, original: text, parsed });
  }
  return {
    title: item.title,
    description: item.description,
    category_id: item.category_id ?? null,
    tags: item.tags,
    notes: item.notes,
    servings: numStr(item.servings),
    prep_minutes: numStr(item.prep_minutes),
    cook_minutes: numStr(item.cook_minutes),
    ingredients: ingredients.length ? ingredients : [blankIngredient()],
    steps: item.steps.length
      ? item.steps.map((s) => ({ key: newKey(), _id: s._id, text: s.text, timer: numStr(s.timer_minutes) }))
      : [blankStep()],
    brand: item.brand,
    methods: item.methods.length
      ? item.methods.map((m) => ({
          ...m,
          key: newKey(),
          temp: numStr(m.temp),
          minutes_min: numStr(m.minutes_min),
          minutes_max: numStr(m.minutes_max),
          stepsText: m.steps.join("\n"),
        }))
      : [blankMethod()],
    storage_note: item.storage_note,
    source_url: item.source_url ?? "",
  };
}

export function inputFrom(d: Draft): KitchenItemInput {
  let section = "";
  const ingredients: KitchenItemInput["ingredients"] = [];
  for (const row of d.ingredients) {
    if (row.kind === "section") {
      section = row.name.trim();
      continue;
    }
    const p = parseRow(row);
    if (!p) continue;
    ingredients.push({ ...(row._id ? { _id: row._id } : {}), ...p, section });
  }
  return {
    title: d.title.trim() || "Untitled",
    description: d.description,
    category_id: d.category_id,
    tags: d.tags,
    notes: d.notes,
    servings: strNum(d.servings),
    prep_minutes: strNum(d.prep_minutes),
    cook_minutes: strNum(d.cook_minutes),
    ingredients,
    steps: d.steps
      .filter((s) => s.text.trim())
      .map((s) => ({ ...(s._id ? { _id: s._id } : {}), text: s.text, timer_minutes: strNum(s.timer) })),
    brand: d.brand,
    methods: d.methods
      .filter((m) => m.temp || m.minutes_min || m.minutes_max || m.power || m.stepsText.trim())
      .map(({ key: _k, stepsText, ...m }) => ({
        ...m,
        temp: strNum(m.temp),
        minutes_min: strNum(m.minutes_min),
        minutes_max: strNum(m.minutes_max),
        steps: stepsText
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean),
      })),
    storage_note: d.storage_note,
    source_url: d.source_url,
  };
}

/**
 * A new item's draft filled from an imported recipe, for the person to review and change before saving. Keeps the
 * category they had chosen, and any title they had typed is replaced (they asked for this recipe).
 */
export function draftFromImport(recipe: ImportedKitchenRecipe, categoryId: string | null): Draft {
  const base = draftFrom(null, categoryId);
  const ingredients: IngredientRow[] = recipe.ingredients.map((ing) => {
    const text = ingredientLine(ing);
    return { key: newKey(), kind: "ingredient", text, original: text, parsed: { ...ing } };
  });
  return {
    ...base,
    title: recipe.title,
    description: recipe.description,
    tags: recipe.tags,
    servings: numStr(recipe.servings),
    prep_minutes: numStr(recipe.prep_minutes),
    cook_minutes: numStr(recipe.cook_minutes),
    ingredients: ingredients.length ? ingredients : base.ingredients,
    steps: recipe.steps.length ? recipe.steps.map((s) => ({ key: newKey(), text: s.text, timer: "" })) : base.steps,
    source_url: recipe.source_url,
  };
}

export function moveIn<T>(list: T[], i: number, d: number): T[] {
  const j = i + d;
  if (j < 0 || j >= list.length) return list;
  const next = [...list];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// Optional fields, hidden behind "+ …" chips until used.
export type Extra = "description" | "tags" | "times" | "brand" | "storage" | "notes";

export function filledExtras(d: Draft): Set<Extra> {
  const s = new Set<Extra>();
  if (d.description.trim()) s.add("description");
  if (d.tags.length) s.add("tags");
  if (d.servings || d.prep_minutes || d.cook_minutes) s.add("times");
  if (d.brand.trim()) s.add("brand");
  if (d.storage_note.trim()) s.add("storage");
  if (d.notes.trim()) s.add("notes");
  return s;
}
