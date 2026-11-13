import { normalizeTag, parseIngredientLine } from "@shared/xenkitchen/kitchen";

// Reads a recipe out of a web page. Nearly every recipe site describes its recipe for search engines as schema.org
// "Recipe" data in a <script type="application/ld+json"> block, which is what this reads. A page that doesn't have it
// gives nothing (no guessing from the page's visible text). Everything is cut to the limits an item accepts, so the
// result can be saved as it is.

export interface ImportedIngredient {
  quantity: string;
  unit: string;
  name: string;
  note: string;
  section: string;
}

export interface ImportedRecipe {
  title: string;
  description: string;
  servings: number | null;
  prep_minutes: number | null;
  cook_minutes: number | null;
  ingredients: ImportedIngredient[];
  steps: Array<{ text: string; timer_minutes: null }>;
  tags: string[];
  /** Where the recipe came from (the page's address). */
  source_url: string;
  /** The recipe's main photo, when the page has one. Not fetched here. */
  image_url: string | null;
}

// Limits of an item (utils/validation/core.ts).
const MAX_TITLE = 120;
const MAX_DESCRIPTION = 2000;
const MAX_INGREDIENTS = 100;
const MAX_STEPS = 100;
const MAX_STEP_TEXT = 2000;
const MAX_TAGS = 20;
const MAX_MINUTES = 10_000;
const MAX_SERVINGS = 1000;

// ---------- text ----------

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  deg: "°",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
};

/** Decode the character references that turn up in recipe text (&amp;, &#8217;, &#x2F;). */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code = body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
    }
    return NAMED[body.toLowerCase()] ?? whole;
  });
}

/** Plain text from a string that may contain tags and entities. Line breaks and block tags become spaces. */
function plain(value: unknown): string {
  if (typeof value !== "string") return "";
  return decodeEntities(value.replace(/<\s*(br|\/p|\/li|\/div)\b[^>]*>/gi, " ").replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

// ---------- finding the Recipe ----------

/** Every JSON-LD block in the page, parsed; blocks that aren't valid JSON are skipped. */
function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;
  for (const match of html.matchAll(re)) {
    const raw = match[1]
      .trim()
      .replace(/^<!--/, "")
      .replace(/-->$/, "")
      .replace(/^\s*\/\/\s*<!\[CDATA\[|\/\/\s*\]\]>\s*$/g, "")
      .trim();
    try {
      out.push(JSON.parse(raw));
    } catch {
      /* some sites emit broken JSON: ignore that block */
    }
  }
  return out;
}

const isRecipeType = (type: unknown) =>
  (Array.isArray(type) ? type : [type]).some((t) => typeof t === "string" && /(^|[/#])Recipe$/i.test(t));

/** The first Recipe node in a JSON-LD value: a node itself, a list of them, or inside an "@graph". Depth-limited. */
function findRecipe(value: unknown, depth = 0): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || depth > 6) return null;
  if (Array.isArray(value)) {
    for (const v of value) {
      const found = findRecipe(v, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const node = value as Record<string, unknown>;
  if (isRecipeType(node["@type"])) return node;
  for (const key of ["@graph", "mainEntity", "mainEntityOfPage", "itemListElement", "item"]) {
    const found = findRecipe(node[key], depth + 1);
    if (found) return found;
  }
  return null;
}

// ---------- fields ----------

const asArray = (v: unknown): unknown[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

/** "PT1H30M", "P0DT45M", "PT90S" → minutes (rounded), or null. */
export function durationMinutes(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const m =
    /^P(?:(\d+(?:\.\d+)?)W)?(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(
      value.trim(),
    );
  if (!m || m.slice(1).every((x) => x === undefined)) return null;
  const [w, d, h, min, s] = m.slice(1).map((x) => (x === undefined ? 0 : Number(x)));
  const minutes = Math.round(w * 7 * 1440 + d * 1440 + h * 60 + min + s / 60);
  return minutes > 0 && minutes <= MAX_MINUTES ? minutes : null;
}

/** "4", "4 servings", ["4", "4 servings"], "Makes 12 cookies" → the first number. */
export function servingsFrom(value: unknown): number | null {
  for (const v of asArray(value)) {
    const n = typeof v === "number" ? v : Number(/\d+(?:\.\d+)?/.exec(String(v))?.[0]);
    if (Number.isFinite(n) && n > 0 && n <= MAX_SERVINGS) return Math.round(n * 100) / 100;
  }
  return null;
}

function ingredientsFrom(value: unknown): ImportedIngredient[] {
  const out: ImportedIngredient[] = [];
  for (const raw of asArray(value)) {
    const line = plain(raw);
    if (!line) continue;
    const p = parseIngredientLine(line);
    out.push(
      p && p.name
        ? {
            quantity: clip(p.quantity, 20),
            unit: clip(p.unit, 30),
            name: clip(p.name, 120),
            note: clip(p.note, 120),
            section: "",
          }
        : // Couldn't split it: keep the whole line as the name rather than lose it.
          { quantity: "", unit: "", name: clip(line, 120), note: "", section: "" },
    );
    if (out.length === MAX_INGREDIENTS) break;
  }
  return out;
}

/** Instructions come as one string, a list of strings, HowToStep objects, or HowToSection objects holding steps. */
function stepsFrom(value: unknown): string[] {
  const out: string[] = [];
  const visit = (v: unknown, depth: number) => {
    if (out.length >= MAX_STEPS || depth > 4 || v === null || v === undefined) return;
    if (Array.isArray(v)) return void v.forEach((x) => visit(x, depth + 1));
    if (typeof v === "string") {
      // One block of text: a step per line when it has lines, else the one step.
      const lines = decodeEntities(v.replace(/<\s*(br|\/p|\/li)\b[^>]*>/gi, "\n").replace(/<[^>]*>/g, "")).split(
        /\r?\n/,
      );
      for (const line of lines) {
        const text = line.replace(/\s+/g, " ").trim();
        if (text) out.push(clip(text, MAX_STEP_TEXT));
      }
      return;
    }
    if (typeof v === "object") {
      const node = v as Record<string, unknown>;
      if (node.itemListElement) return visit(node.itemListElement, depth + 1); // a HowToSection
      const text = plain(node.text) || plain(node.name);
      if (text) out.push(clip(text, MAX_STEP_TEXT));
    }
  };
  visit(value, 0);
  return out.slice(0, MAX_STEPS);
}

function tagsFrom(node: Record<string, unknown>): string[] {
  const parts: string[] = [];
  for (const key of ["recipeCategory", "recipeCuisine", "keywords"]) {
    for (const v of asArray(node[key])) {
      if (typeof v === "string") parts.push(...v.split(","));
    }
  }
  const tags = parts.map((p) => normalizeTag(plain(p))).filter((t) => t.length > 0);
  return [...new Set(tags)].slice(0, MAX_TAGS);
}

/** The first usable picture address (an http(s) URL), resolved against the page for a relative one. */
function imageFrom(value: unknown, pageUrl: string): string | null {
  for (const v of asArray(value)) {
    const candidate =
      typeof v === "string"
        ? v
        : v && typeof v === "object"
          ? ((v as Record<string, unknown>).url ?? (v as Record<string, unknown>).contentUrl)
          : null;
    if (typeof candidate !== "string" || !candidate.trim()) continue;
    try {
      const url = new URL(candidate.trim(), pageUrl);
      if ((url.protocol === "http:" || url.protocol === "https:") && url.toString().length <= 2000)
        return url.toString();
    } catch {
      /* not an address */
    }
  }
  return null;
}

/**
 * The recipe on a page, or null when it has none (or none with a name and something to cook with).
 * `pageUrl` is the address the page was fetched from, kept as the recipe's source.
 */
export function extractRecipe(html: string, pageUrl: string): ImportedRecipe | null {
  let node: Record<string, unknown> | null = null;
  for (const block of jsonLdBlocks(html)) {
    node = findRecipe(block);
    if (node) break;
  }
  if (!node) return null;

  const title = clip(plain(node.name) || plain(node.headline), MAX_TITLE);
  const ingredients = ingredientsFrom(node.recipeIngredient ?? node.ingredients);
  const steps = stepsFrom(node.recipeInstructions);
  if (!title || (ingredients.length === 0 && steps.length === 0)) return null;

  const prep = durationMinutes(node.prepTime);
  const cook = durationMinutes(node.cookTime);
  // Only a total given: it is the time to make it, so show it as the cooking time rather than losing it.
  const total = durationMinutes(node.totalTime);

  return {
    title,
    description: clip(plain(node.description), MAX_DESCRIPTION),
    servings: servingsFrom(node.recipeYield),
    prep_minutes: prep,
    cook_minutes: cook ?? (prep === null ? total : null),
    ingredients,
    steps: steps.map((text) => ({ text, timer_minutes: null })),
    tags: tagsFrom(node),
    source_url: pageUrl.slice(0, 2000),
    image_url: imageFrom(node.image, pageUrl),
  };
}
