import type express from "express";
const { Recipe } = require("../models/recipe");

// Open Graph crawlers (Discord, Slack, iMessage, Twitter) do not run JavaScript, so a
// shared /recipaint/:id link previews as nothing unless the tags are already in the HTML
// the server hands back. vite-express's `transformer` hook lets us inject them per request.

/** Only a bare 24-hex Mongo id - never a nested path, never the SPA's other routes. */
export const RECIPAINT_SHARE_PATH = /^\/recipaint\/([a-f0-9]{24})$/i;

const MAX_DESCRIPTION = 200;

/**
 * Escape for use inside a double-quoted HTML attribute. Recipe titles and descriptions are
 * user-written, so without this a title containing a quote could close the attribute and
 * inject markup into every page that shares the recipe.
 */
export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Collapse whitespace and clip, so a multi-paragraph description reads as one preview line. */
export function toPreviewText(value: string | undefined | null, max = MAX_DESCRIPTION): string {
  const flat = (value || "").replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  return `${flat.slice(0, max - 1).trimEnd()}…`;
}

export interface OgRecipe {
  title: string;
  description?: string | null;
  showcase?: string[] | null;
}

export function buildRecipeMetaTags(recipe: OgRecipe, pageUrl: string): string {
  const title = escapeHtmlAttribute(recipe.title || "Recipe");
  const description = escapeHtmlAttribute(
    toPreviewText(recipe.description) || "A step-by-step painting recipe on Xendelta Hub.",
  );
  const image = recipe.showcase?.[0];

  const tags = [
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="Xendelta Hub" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${escapeHtmlAttribute(pageUrl)}" />`,
    `<meta name="description" content="${description}" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
  ];

  if (image) {
    tags.push(`<meta property="og:image" content="${escapeHtmlAttribute(image)}" />`);
    tags.push(`<meta name="twitter:card" content="summary_large_image" />`);
    tags.push(`<meta name="twitter:image" content="${escapeHtmlAttribute(image)}" />`);
  } else {
    tags.push(`<meta name="twitter:card" content="summary" />`);
  }

  return tags.join("\n    ");
}

/**
 * Insert the tags just before </head> and retitle the document. Returns the HTML untouched
 * if there is no head to inject into - serving an untagged page beats serving a broken one.
 */
export function injectMetaTags(html: string, tags: string, title?: string): string {
  const headClose = html.search(/<\/head>/i);
  if (headClose === -1) return html;

  let out = html;
  if (title) {
    out = out.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtmlAttribute(title)}</title>`);
  }
  const at = out.search(/<\/head>/i);
  return `${out.slice(0, at)}    ${tags}\n  ${out.slice(at)}`;
}

export interface OgRecipeRecord extends OgRecipe {
  isPublic: boolean;
}

export type RecipeLoader = (id: string) => Promise<OgRecipeRecord | null>;

/** This hook sits in front of page rendering, so a slow database must not stall the HTML. */
export const OG_LOOKUP_TIMEOUT_MS = 500;

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return Promise.race([work, deadline]).finally(() => clearTimeout(timer));
}

/**
 * Builds the vite-express transformer over a recipe loader. Everything but a public
 * /recipaint/:id share link passes straight through, so the lookup is scoped to the handful
 * of URLs that need it; a miss, a private recipe, a timeout or a throw all fall back to the
 * untransformed page rather than breaking the request.
 */
export function createRecipaintHtmlTransformer(loadRecipe: RecipeLoader) {
  return async function recipaintHtmlTransformer(html: string, req: express.Request): Promise<string> {
    const match = RECIPAINT_SHARE_PATH.exec(req.path);
    if (!match) return html;

    let recipe: OgRecipeRecord | null;
    try {
      recipe = await withDeadline(loadRecipe(match[1]), OG_LOOKUP_TIMEOUT_MS);
    } catch {
      return html;
    }

    // A private recipe leaks nothing: the crawler gets the plain shell, same as a stranger.
    if (!recipe || !recipe.isPublic) return html;

    const base = process.env.PUBLIC_URL || `${req.protocol}://${req.get("host")}`;
    return injectMetaTags(html, buildRecipeMetaTags(recipe, `${base}${req.path}`), recipe.title);
  };
}

const loadPublicRecipe: RecipeLoader = (id) =>
  Recipe.findById(id)
    .select("title description showcase isPublic")
    .maxTimeMS(OG_LOOKUP_TIMEOUT_MS)
    .lean()
    .exec();

export const recipaintHtmlTransformer = createRecipaintHtmlTransformer(loadPublicRecipe);
