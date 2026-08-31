// A step's paints are the most useful thing in a paint recipe: they drive the swatches on
// each step, the "Paints used" shopping list on the recipe, and search-by-paint. Shared so
// the server's validation and the client's editor agree on the shape.

export const PAINT_TYPES = ["base", "layer", "wash", "contrast", "metallic", "technical"] as const;

export type PaintType = (typeof PAINT_TYPES)[number];

export interface RecipePaint {
  brand: string;
  name: string;
  /** "#RRGGBB", or "" when the painter hasn't picked a swatch colour. */
  hex: string;
  /** One of PAINT_TYPES, or "" for unspecified. */
  type: PaintType | "";
}

export const EMPTY_PAINT: RecipePaint = { brand: "", name: "", hex: "", type: "" };

/** "Citadel: Nuln Oil", or just the name when no brand is recorded. */
export function formatPaint(paint: RecipePaint): string {
  const name = paint.name.trim();
  const brand = paint.brand.trim();
  if (brand && name) return `${brand}: ${name}`;
  return name || brand;
}

/** Identity for de-duplication: the same paint typed with different casing is one paint. */
export function paintKey(paint: RecipePaint): string {
  return `${paint.brand.trim().toLowerCase()}\u0000${paint.name.trim().toLowerCase()}`;
}

/** A paint with neither a brand nor a name is an empty editor row, not data. */
export function isBlankPaint(paint: RecipePaint): boolean {
  return !paint.brand.trim() && !paint.name.trim();
}

/**
 * Collapse the paints across every step into the recipe's palette, in first-use order.
 * Later mentions fill in a swatch colour or type that an earlier one left blank, so a paint
 * entered fully in step 4 still shows its colour in the list.
 */
export function aggregatePaints(steps: { paints?: RecipePaint[] | null }[]): RecipePaint[] {
  const byKey = new Map<string, RecipePaint>();

  for (const step of steps || []) {
    for (const paint of step?.paints || []) {
      if (!paint || isBlankPaint(paint)) continue;
      const key = paintKey(paint);
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, { ...paint, brand: paint.brand.trim(), name: paint.name.trim() });
        continue;
      }
      if (!existing.hex && paint.hex) existing.hex = paint.hex;
      if (!existing.type && paint.type) existing.type = paint.type;
    }
  }

  return [...byKey.values()];
}

/** Drop empty editor rows and trim, so blank rows never reach the database. */
export function cleanPaints(paints: RecipePaint[] | null | undefined): RecipePaint[] {
  return (paints || [])
    .filter((paint) => paint && !isBlankPaint(paint))
    .map((paint) => ({
      brand: paint.brand.trim(),
      name: paint.name.trim(),
      hex: (paint.hex || "").trim(),
      type: paint.type || "",
    }));
}

// Common miniature-painting techniques, offered as suggestions on a step's `method`.
// The field stays free text - this is a starting point, not a closed set.
export const PAINT_METHODS = [
  "Prime",
  "Basecoat",
  "Layer",
  "Wash",
  "Shade",
  "Drybrush",
  "Edge highlight",
  "Glaze",
  "Stipple",
  "Blend",
  "Sponge",
  "Contrast",
  "Varnish",
  "Zenithal",
] as const;

export interface PaintInput {
  brand?: string | null;
  name?: string | null;
  /** The commercial range, e.g. "Warpaints Air". Part of a paint's identity. */
  range?: string | null;
  hex?: string | null;
  type?: string | null;
  quantity?: number | null;
  /** Set when the paint came from the shared catalogue; absent for a custom colour. */
  catalogueKey?: string | null;
}

export interface NormalizedPaint {
  brand: string;
  name: string;
  range: string;
  hex: string;
  type: PaintType | "";
  quantity: number;
  catalogueKey: string;
  /**
   * Dedupe identity, matching catalogueKey(). The library's unique index is built on this.
   * Includes the range because ranges reuse names: a painter can own Army Painter's "Warlock
   * Purple" in both Warpaints and Warpaints Air, and they are different colours.
   */
  key: string;
}

/**
 * Normalise one collection paint: trim, bound the quantity, drop an unrecognised type, and
 * derive the dedupe key. Returns null when there is no name, which is the one required field
 * - "Citadel" alone isn't a paint.
 */
export function normalizePaintInput(input: PaintInput | null | undefined): NormalizedPaint | null {
  if (!input) return null;

  const brand = (input.brand || "").trim();
  const name = (input.name || "").trim();
  const range = (input.range || "").trim();
  if (!name) return null;

  const type = PAINT_TYPES.includes(input.type as PaintType) ? (input.type as PaintType) : "";

  const rawQuantity = Number(input.quantity);
  const quantity = Number.isFinite(rawQuantity) && rawQuantity > 0 ? Math.floor(rawQuantity) : 0;

  return {
    brand,
    name,
    range,
    hex: (input.hex || "").trim(),
    type,
    quantity,
    catalogueKey: (input.catalogueKey || "").trim(),
    key: catalogueKey({ brand, range, name }),
  };
}

// --- Catalogue identity -----------------------------------------------------------------
//
// A paint's identity in the catalogue (and in a user's library) is brand + range + name, not
// brand + name. Ranges genuinely reuse names for different colours - Army Painter's "Warlock
// Purple" exists in both Warpaints and Warpaints Air with different hex values - and keying
// without the range collapses 437 of the 2,176 catalogue paints into each other.
//
// Deliberately NOT the same thing as paintKey(). A recipe step stores no range and does not
// need one: it only asks "do I own something called this?".

export interface CataloguePaintIdentity {
  brand: string;
  range: string;
  name: string;
}

export function catalogueKey(paint: CataloguePaintIdentity): string {
  const part = (value: string) => (value || "").trim().toLowerCase();
  // Same NUL separator as paintKey, and for the same reason: it cannot occur in a brand or
  // range, so "a b"/"c" can never collide with "a"/"b c".
  return [part(paint.brand), part(paint.range), part(paint.name)].join("\u0000");
}

/**
 * Map the source dataset's vocabulary onto our narrower PAINT_TYPES.
 *
 * The dataset carries both a `set` (the commercial range: Base, Layer, Warpaints Air) and a
 * coarse `type` ("standard" | "metallic" | "ink" | "wash" | "other"). The range is the more
 * specific signal where it names a Citadel-style category, so it wins; the coarse type is the
 * fallback. Anything unrecognised yields "" rather than a value the schema enum would reject.
 */
export function paintTypeFromDataset(set: string | null | undefined, datasetType?: string | null): PaintType | "" {
  const range = (set || "").trim().toLowerCase();

  if (range.includes("contrast") || range.includes("speedpaint")) return "contrast";
  if (range.includes("technical")) return "technical";
  if (range.includes("shade") || range.includes("wash")) return "wash";
  if (range.includes("metallic")) return "metallic";
  // Exact matches, checked last so a compound range like "Warpaints Air" does not match here.
  if (range === "base") return "base";
  if (range === "layer") return "layer";

  const coarse = (datasetType || "").trim().toLowerCase();
  if (coarse === "metallic") return "metallic";
  if (coarse === "wash" || coarse === "ink") return "wash";

  return "";
}

/**
 * The secondary line under a paint's name: brand, range and type, joined and de-duplicated.
 *
 * Citadel's ranges are named after the type they contain, so a naive join reads
 * "Citadel Colour - Base - base". Anything that repeats a part already shown is dropped.
 */
export function describePaintDetail(parts: { brand?: string; range?: string; type?: string }): string {
  const seen = new Set<string>();
  const kept: string[] = [];

  for (const part of [parts.brand, parts.range, parts.type]) {
    const value = (part || "").trim();
    if (!value) continue;
    const normalised = value.toLowerCase();
    if (seen.has(normalised)) continue;
    seen.add(normalised);
    kept.push(value);
  }

  return kept.join(" - ");
}
