import sharp from "sharp";
import { AppError } from "../utils/http";
import { recipeFromParts, type ImportedRecipe, type RecipeParts } from "../utils/recipeImport";
import { receiptFromParts, type ImportedReceipt } from "../utils/receiptImport";

/**
 * Reading a recipe out of a photo (a recipe card, a cookbook page, a screenshot), through Cloudflare Workers AI.
 *
 * One call does the whole job: Llama 4 Scout is sent the picture as an OpenAI-style `image_url` part together with a
 * `guided_json` schema, so it answers with the fields an item has instead of prose that would need parsing. That image
 * part is the only shape Workers AI feeds to the model — an `image` field next to `messages` is accepted and silently
 * ignored, and the model then says it cannot see a picture.
 *
 * The account id and token stay on the server; the browser only ever talks to /api/xenkitchen. Without them the route
 * answers 503 and the app hides the scan button, exactly like GIFs without a GIPHY key.
 */

const API = "https://api.cloudflare.com/client/v4/accounts";
const DEFAULT_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

/** Long side of the picture sent to the model. Bigger costs tokens and adds nothing for reading text. */
const MODEL_IMAGE_MAX_EDGE = 1280;
const MODEL_TIMEOUT_MS = 40_000;

export const photoImportEnabled = () => !!(process.env.CLOUDFLARE_AI_ACCOUNT_ID && process.env.CLOUDFLARE_AI_TOKEN);

// Everything is a string so the schema holds whatever the card says ("4", "4 people", "about 30 minutes"); numbers are
// pulled out afterwards by recipeFromParts, which also splits the ingredient lines.
const RECIPE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    description: { type: "string" },
    servings: { type: "string" },
    prep_minutes: { type: "string" },
    cook_minutes: { type: "string" },
    ingredient_lines: { type: "array", items: { type: "string" } },
    steps: { type: "array", items: { type: "string" } },
  },
  required: ["title", "description", "servings", "prep_minutes", "cook_minutes", "ingredient_lines", "steps"],
};

const STRUCTURE_PROMPT =
  "This picture is a recipe. Copy it into JSON: title, description, servings, prep_minutes, cook_minutes, " +
  "ingredient_lines, steps. Look for a title, a short description, how many it serves, prep and cook times (in " +
  "whole minutes), the ingredient list and the method, and put anything the picture gives into the matching field. " +
  "Use only what the picture says: an empty string, or an empty list, when something is missing. Write one ingredient " +
  "per line as it appears (amount, unit, then the ingredient) and one instruction per step. Do not invent " +
  "ingredients, amounts or times.";

const READ_PROMPT =
  "Read every word in this picture exactly as it is written and keep the line breaks. Copy the text; do not summarise " +
  "it and do not add anything of your own.";

/** A JSON object out of a model's answer, even when it wrapped it in prose or a code fence. */
function jsonObject(value: unknown): Record<string, unknown> | null {
  if (typeof value === "string") {
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return jsonObject(JSON.parse(value.slice(start, end + 1)));
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const node = value as Record<string, unknown>;
  // Workers AI hands the guided answer back both parsed (`response`) and as text (`choices[0].message.content`).
  if (node.response) return jsonObject(node.response);
  const choice = (node.choices as Array<{ message?: { content?: unknown } }> | undefined)?.[0];
  if (choice?.message?.content !== undefined) return jsonObject(choice.message.content);
  return node;
}

/** The model's text, whichever shape the answer uses. */
function plainText(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const node = value as Record<string, unknown>;
  if (typeof node.response === "string") return node.response;
  if (typeof node.answer === "string") return node.answer;
  const choice = (node.choices as Array<{ message?: { content?: unknown } }> | undefined)?.[0];
  return typeof choice?.message?.content === "string" ? choice.message.content : "";
}

export async function runModel(body: Record<string, unknown>): Promise<unknown> {
  const account = process.env.CLOUDFLARE_AI_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_AI_TOKEN;
  if (!account || !token) throw new AppError(503, "Reading a photo isn't set up here");

  const model = process.env.CLOUDFLARE_AI_VISION_MODEL || DEFAULT_MODEL;
  let response: Response;
  try {
    response = await fetch(`${API}/${account}/ai/run/${model}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    });
  } catch (e) {
    // Only the connection can be at fault: the address carries the account id, never the token.
    console.error("Photo scan failed to reach Workers AI:", e instanceof Error ? e.name : "error");
    throw new AppError(502, "Couldn't reach the photo reader. Try again in a moment.");
  }
  if (!response.ok) {
    console.error(`Workers AI answered ${response.status} for ${model}`);
    throw new AppError(502, "The photo reader is busy. Try again in a moment.");
  }

  const payload = (await response.json().catch(() => null)) as { result?: unknown } | null;
  return payload?.result;
}

/** One photo, as the upload gave it. */
export interface RecipePhoto {
  buffer: Buffer;
  mimetype: string;
}

/** What one photo says, plus whether it only came back as plain words (the fallback read). */
interface PhotoParts {
  parts: RecipeParts;
  wordsOnly: boolean;
}

/** A photo shrunk and wrapped as the `image_url` part the model reads. */
async function modelImage({ buffer, mimetype }: RecipePhoto) {
  if (!mimetype.startsWith("image/")) throw new AppError(400, "That file isn't a picture");

  // Downscaled and re-encoded first: the model reads text just as well from this, and this is what the cost is based on.
  let small: Buffer;
  try {
    small = await sharp(buffer)
      .rotate()
      .resize(MODEL_IMAGE_MAX_EDGE, MODEL_IMAGE_MAX_EDGE, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    // Most likely a HEIC this server can't decode. Safari converts to JPEG on upload, so this is rare.
    throw new AppError(400, "Couldn't read that picture. Try a JPEG or PNG.");
  }
  return { type: "image_url", image_url: { url: `data:image/webp;base64,${small.toString("base64")}` } };
}

/** The fields one photo gives, or null when the model saw nothing in it. */
async function partsFromPhoto(photo: RecipePhoto): Promise<PhotoParts | null> {
  const image = await modelImage(photo);

  const structured = await runModel({
    messages: [{ role: "user", content: [{ type: "text", text: STRUCTURE_PROMPT }, image] }],
    guided_json: RECIPE_SCHEMA,
    max_tokens: 2000,
    temperature: 0.1,
  });
  const fields = jsonObject(structured);
  if (fields && (hasList(fields.ingredient_lines) || hasList(fields.steps) || text(fields.title))) {
    return { parts: fields as RecipeParts, wordsOnly: false };
  }

  // The answer didn't come back in a shape we could use: ask once more for the words alone rather than losing the
  // scan. They land as the recipe's steps, so nothing was invented and what was typed out is kept.
  const read = plainText(
    await runModel({
      messages: [{ role: "user", content: [{ type: "text", text: READ_PROMPT }, image] }],
      max_tokens: 2000,
      temperature: 0,
    }),
  ).trim();
  if (!read) return null;
  return { parts: { title: read.split("\n")[0], steps: read }, wordsOnly: true };
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : text(v) ? [v] : []);
const hasList = (v: unknown) => list(v).some((x) => text(x));

/**
 * Pages of one recipe put together, in the order they were taken: the first page that gives a title, servings or a
 * time wins (a properly read page before a words-only one), and ingredients and steps run on from page to page — a
 * cookbook often has the ingredients on one page and the method over the leaf.
 */
export function mergePhotoParts(pages: PhotoParts[]): RecipeParts {
  const ordered = [...pages.filter((p) => !p.wordsOnly), ...pages.filter((p) => p.wordsOnly)];
  const first = (key: keyof RecipeParts) =>
    ordered.map((p) => p.parts[key]).find((v) => text(v) || typeof v === "number");
  return {
    title: first("title"),
    description: first("description"),
    servings: first("servings"),
    prep_minutes: first("prep_minutes"),
    cook_minutes: first("cook_minutes"),
    ingredient_lines: pages.flatMap((p) => list(p.parts.ingredient_lines)),
    steps: pages.flatMap((p) => list(p.parts.steps)),
  };
}

/**
 * A recipe read from one or more photos of it (a card, or the pages of a cookbook), or null when they don't hold one.
 * Each photo is read on its own and the pages are then put together. Nothing is saved: the caller shows the result in
 * the editor for review.
 */
export async function readRecipeFromImages(photos: RecipePhoto[]): Promise<ImportedRecipe | null> {
  const pages = (await Promise.all(photos.map(partsFromPhoto))).filter((p): p is PhotoParts => p !== null);
  if (pages.length === 0) return null;
  return recipeFromParts(mergePhotoParts(pages));
}

const RECEIPT_SCHEMA = {
  type: "object",
  properties: {
    merchant: { type: "string" },
    date: { type: "string" },
    currency: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { name: { type: "string" }, amount: { type: "string" } },
        required: ["name", "amount"],
      },
    },
    tax: { type: "string" },
    tip: { type: "string" },
    total: { type: "string" },
  },
  required: ["merchant", "date", "currency", "items", "tax", "tip", "total"],
};

const RECEIPT_PROMPT =
  "This picture is a receipt. Copy it into JSON: merchant, date (YYYY-MM-DD), currency (a 3-letter code if shown), " +
  "items (every purchased line as a name and its price, as printed), tax, tip and total. Do not list subtotal, tax, " +
  "tip, total, change or payment lines as items. Use only what the picture says: an empty string when something is " +
  "missing. Do not invent items or prices.";

/** A receipt read from a photo of it, or null when the photo holds none. Nothing is saved. */
export async function readReceiptFromImage(photo: RecipePhoto): Promise<ImportedReceipt | null> {
  const image = await modelImage(photo);
  const answer = await runModel({
    messages: [{ role: "user", content: [{ type: "text", text: RECEIPT_PROMPT }, image] }],
    guided_json: RECEIPT_SCHEMA,
    max_tokens: 2000,
    temperature: 0.1,
  });
  return receiptFromParts(jsonObject(answer));
}
