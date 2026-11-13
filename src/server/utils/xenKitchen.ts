import { randomToken } from "./tokens";
import { isSafeUrl } from "@shared/xennote/notes";
import {
  roleOf,
  canView,
  canEdit,
  canManage,
  changeRole,
  removeMember,
  type MemberRole,
  type HasMembers,
  type MemberChange,
} from "./membership";
import {
  KitchenFilters,
  KitchenLayout,
  normalizeIngredientName,
  normalizeTag,
  totalMinutes,
} from "@shared/xenkitchen/kitchen";

/** 128 random bits, URL safe: 22 characters. Unguessable, so a link is the only way in. */
export function generateShareToken(): string {
  return randomToken(16);
}

export const SHARE_TOKEN_PATTERN = /^[A-Za-z0-9_-]{22}$/;

// ---------- book membership ----------
// The role logic is shared with every other sub-app (utils/membership.ts); these are the
// names the kitchen code and tests already use.

export type BookRole = MemberRole;
export interface BookLike extends HasMembers {
  _id: any;
  name?: string;
}
export type { MemberChange };
export const roleIn = roleOf;
export { canView, canEdit, canManage, changeRole, removeMember };

/**
 * Where an item lands when moved to another book: an explicit category of that book, else the
 * one with the same name, else the first with the same layout, else uncategorised.
 */
export function pickTargetCategory(
  targetCategories: CategoryLike[],
  fromCategory: CategoryLike | undefined,
  requested?: string | null,
): string | null {
  if (requested) return targetCategories.some((c) => String(c._id) === requested) ? requested : null;
  if (!fromCategory) return null;
  const sameName = targetCategories.find(
    (c) => (c.name || "").toLowerCase() === (fromCategory.name || "").toLowerCase() && c.layout === fromCategory.layout,
  );
  if (sameName) return String(sameName._id);
  const sameLayout = targetCategories.find((c) => c.layout === fromCategory.layout);
  return sameLayout ? String(sameLayout._id) : null;
}

export interface CategoryLike {
  _id: any;
  layout: KitchenLayout;
  name?: string;
  color?: string;
  icon?: string;
}

export function layoutFor(item: { category_id?: any }, categories: Map<string, CategoryLike>): KitchenLayout {
  const id = item.category_id ? String(item.category_id) : "";
  return categories.get(id)?.layout ?? "recipe";
}

// ---------- input cleaning ----------

const cleanNum = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

/**
 * Turns a validated body into the fields stored on an item. Only keys present in the body
 * are returned, so the same function serves create and partial update.
 */
export function itemFieldsFromBody(body: any): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const copyStr = (k: string) => {
    if (typeof body[k] === "string") out[k] = body[k].trim();
  };
  ["title", "description", "notes", "brand", "storage_note"].forEach(copyStr);
  // The source is a web address or nothing; anything else is dropped rather than stored.
  if (typeof body.source_url === "string")
    out.source_url = isSafeUrl(body.source_url.trim()) ? body.source_url.trim() : "";

  if ("category_id" in body) out.category_id = body.category_id || null;
  if (Array.isArray(body.tags)) {
    out.tags = [...new Set<string>(body.tags.map(normalizeTag).filter(Boolean))].slice(0, 20);
  }
  for (const k of ["servings", "prep_minutes", "cook_minutes"]) {
    if (k in body) out[k] = cleanNum(body[k]);
  }
  if (Array.isArray(body.ingredients)) {
    out.ingredients = body.ingredients
      .map((i: any) => ({
        ...(i._id ? { _id: i._id } : {}),
        name: (i.name || "").trim(),
        name_key: normalizeIngredientName(i.name || ""),
        quantity: (i.quantity || "").trim(),
        unit: (i.unit || "").trim(),
        note: (i.note || "").trim(),
        section: (i.section || "").trim(),
      }))
      .filter((i: any) => i.name || i.quantity);
  }
  if (Array.isArray(body.steps)) {
    out.steps = body.steps
      .map((s: any) => ({
        ...(s._id ? { _id: s._id } : {}),
        text: (s.text || "").trim(),
        timer_minutes: cleanNum(s.timer_minutes) || null,
      }))
      .filter((s: any) => s.text);
  }
  if (Array.isArray(body.methods)) {
    out.methods = body.methods.map((m: any) => ({
      ...(m._id ? { _id: m._id } : {}),
      method: m.method,
      temp: cleanNum(m.temp),
      temp_unit: m.temp_unit === "C" ? "C" : "F",
      power: (m.power || "").trim(),
      minutes_min: cleanNum(m.minutes_min),
      minutes_max: cleanNum(m.minutes_max),
      preheat: !!m.preheat,
      steps: (m.steps || []).map((s: string) => (s || "").trim()).filter(Boolean),
    }));
  }
  return out;
}

// ---------- listing ----------

function searchableText(item: any): string {
  return [
    item.title,
    item.description,
    item.brand,
    item.notes,
    ...(item.tags || []),
    ...(item.ingredients || []).map((i: any) => i.name),
  ]
    .join(" \n ")
    .toLowerCase();
}

/**
 * Filters and sorts a person's items. A personal kitchen is at most a few hundred items,
 * so this runs in memory rather than as a Mongo query; that keeps "time" (which depends on
 * the category's layout) and free-text search over ingredients simple and exact.
 */
export function applyKitchenFilters(
  items: any[],
  f: KitchenFilters,
  categories: Map<string, CategoryLike>,
  uid = "",
): any[] {
  const words = f.q.toLowerCase().split(/\s+/).filter(Boolean);
  const wantTags = f.tags.map(normalizeTag);
  const wantIngredients = f.ingredients.map(normalizeIngredientName);

  const out = items.filter((item) => {
    const cat = item.category_id ? String(item.category_id) : "";
    if (f.layout && layoutFor(item, categories) !== f.layout) return false;
    if (f.category === "none" ? cat && categories.has(cat) : f.category && cat !== f.category) return false;
    if (f.favorite && !(item.favorited_by || []).includes(uid)) return false;
    if (wantTags.length && !wantTags.every((t) => (item.tags || []).includes(t))) return false;
    if (wantIngredients.length) {
      const keys = (item.ingredients || []).map((i: any) => i.name_key || normalizeIngredientName(i.name));
      if (!wantIngredients.every((w) => keys.some((k: string) => k.includes(w)))) return false;
    }
    if (f.method && !(item.methods || []).some((m: any) => m.method === f.method)) return false;
    if (f.maxMinutes) {
      const t = totalMinutes(item, layoutFor(item, categories));
      if (t === null || t > f.maxMinutes) return false;
    }
    if (words.length) {
      const text = searchableText(item);
      if (!words.every((w) => text.includes(w))) return false;
    }
    return true;
  });

  const time = (i: any) => totalMinutes(i, layoutFor(i, categories)) ?? Number.MAX_SAFE_INTEGER;
  const ts = (d: any) => (d ? new Date(d).getTime() : 0);
  out.sort((a, b) => {
    switch (f.sort) {
      case "title":
        return (a.title || "").localeCompare(b.title || "", undefined, { sensitivity: "base" });
      case "created":
        return ts(b.created_at) - ts(a.created_at);
      case "time":
        return time(a) - time(b) || ts(b.updated_at) - ts(a.updated_at);
      default:
        return ts(b.updated_at) - ts(a.updated_at);
    }
  });
  return out;
}

// ---------- autocomplete ----------

export interface IngredientSuggestion {
  name: string;
  unit: string;
  count: number;
}

/**
 * Every ingredient a person has used, grouped case-insensitively. The display name and unit
 * are whichever spelling/unit they used most; the list is most-used first, with names that
 * start with the query ahead of names that merely contain it.
 */
export function suggestIngredients(items: any[], query: string, limit = 15): IngredientSuggestion[] {
  const q = normalizeIngredientName(query);
  const groups = new Map<string, { count: number; names: Map<string, number>; units: Map<string, number> }>();
  for (const item of items) {
    for (const ing of item.ingredients || []) {
      const key = ing.name_key || normalizeIngredientName(ing.name);
      if (!key || (q && !key.includes(q))) continue;
      const g = groups.get(key) ?? { count: 0, names: new Map(), units: new Map() };
      g.count++;
      g.names.set(ing.name.trim(), (g.names.get(ing.name.trim()) ?? 0) + 1);
      if (ing.unit) g.units.set(ing.unit, (g.units.get(ing.unit) ?? 0) + 1);
      groups.set(key, g);
    }
  }
  const top = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  return [...groups.entries()]
    .map(([key, g]) => ({ key, name: top(g.names), unit: top(g.units), count: g.count }))
    .sort(
      (a, b) =>
        (q ? Number(b.key.startsWith(q)) - Number(a.key.startsWith(q)) : 0) ||
        b.count - a.count ||
        a.key.localeCompare(b.key),
    )
    .slice(0, limit)
    .map(({ name, unit, count }) => ({ name, unit, count }));
}

export function collectTags(items: any[]): Array<{ tag: string; count: number }> {
  const counts = new Map<string, number>();
  for (const item of items) for (const t of item.tags || []) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

// ---------- serializing ----------

const pick = (sub: any[] | undefined) =>
  (sub || []).map((s: any) => {
    const o = s.toObject ? s.toObject() : { ...s };
    delete o.name_key;
    return o;
  });

export interface SerializeOpts {
  isPublic?: boolean;
  /** The viewer: decides `favorite` and `my_role`. */
  uid?: string;
  books?: Map<string, BookLike>;
  usernames?: Map<string, string>;
}

/** The item as the client sees it. `isPublic` strips anything that identifies people. */
export function serializeItem(raw: any, categories: Map<string, CategoryLike>, opts: SerializeOpts = {}) {
  const item = raw.toObject ? raw.toObject() : raw;
  const catId = item.category_id ? String(item.category_id) : null;
  const cat = catId ? categories.get(catId) : undefined;
  const base = {
    _id: String(item._id),
    title: item.title || "",
    description: item.description || "",
    category: cat
      ? { _id: String(cat._id), name: cat.name, color: cat.color, icon: cat.icon, layout: cat.layout }
      : null,
    layout: cat?.layout ?? "recipe",
    tags: item.tags || [],
    notes: item.notes || "",
    images: (item.images || []).map((i: any) => ({ _id: String(i._id), url: i.url })),
    servings: item.servings ?? null,
    prep_minutes: item.prep_minutes ?? null,
    cook_minutes: item.cook_minutes ?? null,
    ingredients: pick(item.ingredients).map((i: any) => ({ ...i, _id: String(i._id) })),
    steps: pick(item.steps).map((s: any) => ({ ...s, _id: String(s._id) })),
    brand: item.brand || "",
    methods: pick(item.methods).map((m: any) => ({ ...m, _id: String(m._id) })),
    storage_note: item.storage_note || "",
    source_url: item.source_url || "",
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
  if (opts.isPublic) return base;
  const book = opts.books?.get(String(item.book_id));
  const name = (id: string | null | undefined) => (id ? (opts.usernames?.get(id) ?? null) : null);
  return {
    ...base,
    book_id: String(item.book_id),
    book: book ? { _id: String(book._id), name: book.name ?? "" } : null,
    my_role: book && opts.uid ? roleIn(book, opts.uid) : null,
    created_by: name(item.created_by),
    updated_by: name(item.updated_by),
    category_id: catId && cat ? catId : null,
    favorite: !!opts.uid && (item.favorited_by || []).includes(opts.uid),
    share: { enabled: !!item.share?.enabled, token: item.share?.enabled ? (item.share.token ?? null) : null },
  };
}
