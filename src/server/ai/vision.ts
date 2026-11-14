import sharp from "sharp";
import { AppError } from "../utils/http";
import { recipeFromParts, type ImportedRecipe } from "../utils/recipeImport";

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

async function runModel(body: Record<string, unknown>): Promise<unknown> {
  const account = process.env.CLOUDFLARE_AI_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_AI_TOKEN;
  if (!account || !token) throw new AppError(503, "Reading a recipe from a photo isn't set up here");

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
    console.error("Recipe scan failed to reach Workers AI:", e instanceof Error ? e.name : "error");
    throw new AppError(502, "Couldn't reach the recipe reader. Try again in a moment.");
  }
  if (!response.ok) {
    console.error(`Workers AI answered ${response.status} for ${model}`);
    throw new AppError(502, "The recipe reader is busy. Try again in a moment.");
  }

  const payload = (await response.json().catch(() => null)) as { result?: unknown } | null;
  return payload?.result;
}

/**
 * A recipe read from a photo, or null when the picture doesn't hold one. Nothing is saved: the caller shows the result
 * in the editor for review.
 */
export async function readRecipeFromImage(buffer: Buffer, mimetype: string): Promise<ImportedRecipe | null> {
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
  const image = { type: "image_url", image_url: { url: `data:image/webp;base64,${small.toString("base64")}` } };

  const structured = await runModel({
    messages: [{ role: "user", content: [{ type: "text", text: STRUCTURE_PROMPT }, image] }],
    guided_json: RECIPE_SCHEMA,
    max_tokens: 2000,
    temperature: 0.1,
  });

  const fields = jsonObject(structured);
  const recipe = fields ? recipeFromParts(fields) : null;
  if (recipe) return recipe;

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

  return recipeFromParts({ title: read.split("\n")[0], steps: read });
}
