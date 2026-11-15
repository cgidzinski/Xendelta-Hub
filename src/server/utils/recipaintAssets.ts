// Recipaint images live in the public bucket (recipaint-assets/<file>, with a thumbnail at recipaint-assets/thumbs/).
// The server owns their lifecycle (docs/storage.md): an image is deleted when the last recipe using it lets go of it
// (an edit removes it, or the recipe is deleted), and a clone gets its own copies so recipes never share files.
// Uploads that never make it into a saved recipe are left to the orphan sweep (npm run storage:orphans).

import { Recipe } from "../models/recipe";
import { publicKeyFromUrl, publicStore, publicUrlFor } from "../storage";
import { RECIPAINT_ASSET_FOLDER, thumbGcsPathFor } from "@shared/recipaint/assetUrls";
import { generateUniqueFilename } from "./mediaUtils";

type RecipeImages = {
  showcase?: Array<string | null | undefined> | null;
  steps?: Array<{ images?: Array<string | null | undefined> | null } | null | undefined> | null;
};

/** Every image a recipe uses: its showcase and every step's. */
export function recipeImageUrls(recipe: RecipeImages): string[] {
  const urls = [...(recipe.showcase ?? []), ...(recipe.steps ?? []).flatMap((s) => s?.images ?? [])];
  return [...new Set(urls.filter((u): u is string => typeof u === "string" && u.length > 0))];
}

/** The object behind one of our Recipaint image URLs, or null for anything else (a stranger's URL, another folder). */
function assetKey(url: string): string | null {
  const key = publicKeyFromUrl(url);
  if (!key || !key.startsWith(`${RECIPAINT_ASSET_FOLDER}/`) || key.startsWith(`${RECIPAINT_ASSET_FOLDER}/thumbs/`)) {
    return null;
  }
  return key;
}

const filenameOf = (key: string) => key.slice(key.lastIndexOf("/") + 1);

/**
 * Delete these images (and their thumbnails) unless another recipe still uses them. `except` is the recipe letting go,
 * which has already been changed or is about to be deleted. Never throws: a leftover is the orphan sweep's job.
 */
export async function releaseRecipaintImages(urls: string[], except: unknown): Promise<void> {
  for (const url of urls) {
    const key = assetKey(url);
    if (!key) continue;
    try {
      const stillUsed = await Recipe.exists({
        _id: { $ne: except },
        $or: [{ showcase: url }, { "steps.images": url }],
      });
      if (stillUsed) continue;
      await Promise.all([
        publicStore.delete(key),
        publicStore.delete(thumbGcsPathFor(filenameOf(key))).catch(() => undefined),
      ]);
    } catch (e) {
      console.error(">>> Recipaint image cleanup failed for", url, e);
    }
  }
}

/** The images a recipe had before an edit and no longer has. */
export function droppedImages(before: RecipeImages, after: RecipeImages): string[] {
  const kept = new Set(recipeImageUrls(after));
  return recipeImageUrls(before).filter((u) => !kept.has(u));
}

/**
 * Copies of these images (and their thumbnails) under new names, for a cloned recipe. Returns old URL → new URL; an
 * image that isn't ours or can't be copied keeps its URL (it's then shared, and `releaseRecipaintImages` protects it).
 */
export async function copyRecipaintImages(urls: string[]): Promise<Map<string, string>> {
  const copies = new Map<string, string>();
  for (const url of urls) {
    const key = assetKey(url);
    if (!key) continue;
    const filename = generateUniqueFilename(filenameOf(key));
    const target = `${RECIPAINT_ASSET_FOLDER}/${filename}`;
    try {
      await publicStore.copyFrom(publicStore, key, target);
    } catch (e) {
      console.error(">>> Recipaint image copy failed for", url, e);
      continue;
    }
    await publicStore
      .copyFrom(publicStore, thumbGcsPathFor(filenameOf(key)), thumbGcsPathFor(filename))
      .catch(() => undefined); // an older image may have no thumbnail; the client falls back to the original
    copies.set(url, publicUrlFor(target));
  }
  return copies;
}

/** A recipe's image fields with each URL swapped for its copy. */
export function withCopiedImages<T extends RecipeImages>(recipe: T, copies: Map<string, string>) {
  const swap = (u: string | null | undefined) => (u && copies.get(u)) || u;
  return {
    showcase: (recipe.showcase ?? []).map(swap),
    steps: (recipe.steps ?? []).map((s) => (s ? { ...s, images: (s.images ?? []).map(swap) } : s)),
  };
}
