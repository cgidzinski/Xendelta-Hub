// Every stored file a person owns, removed when an admin deletes their account (docs/storage.md): their XenDrive files
// (app photos and chat attachments included, each app told so it drops its references), their folders, their profile
// picture, and their Recipaint recipes with the recipes' images.

import { XenDriveFile } from "../models/xendriveFile";
import { FileRecord } from "../models/fileRecord";
import { XenDriveFolder } from "../models/xendriveFolder";
import { Recipe } from "../models/recipe";
import { RecipeProgress } from "../models/recipeProgress";
import { privateStore, publicKeyFromUrl, publicStore } from "../storage";
import { driveSourceApp } from "./driveSources";
import { recipeImageUrls, releaseRecipaintImages } from "./recipaintAssets";

/** Delete a profile picture we stored (not the built-in default, not someone else's URL). */
export async function deleteStoredAvatar(avatarUrl: string | null | undefined): Promise<void> {
  const key = publicKeyFromUrl(avatarUrl);
  if (key && key.startsWith("avatar/")) await publicStore.delete(key).catch(() => undefined);
}

/** Remove everything this person stored. Returns how many files went (XenDrive files and app files). */
export async function removeAccountFiles(userId: string, avatarUrl?: string | null): Promise<number> {
  const files = await FileRecord.find({ bucket: "private", uploadedBy: userId }).lean();
  for (const file of files) {
    for (const key of [file.key, file.thumbKey, file.previewKey]) {
      if (key) await privateStore.delete(key).catch(() => undefined);
    }
  }
  await XenDriveFile.deleteMany({ owner_id: userId });
  await FileRecord.deleteMany({ _id: { $in: files.map((f) => f._id) } });
  await XenDriveFolder.deleteMany({ owner_id: userId });

  // Each app lets go of the photos it showed (an expense's receipt, a note's picture), so nothing shows a broken image.
  const bySource = new Map<string, { app: string; ref: string; ids: string[] }>();
  for (const f of files) {
    if (f.space.app === "xendrive") continue;
    const key = `${f.space.app}:${f.space.ref}`;
    const entry = bySource.get(key) ?? { app: f.space.app, ref: f.space.ref ?? "", ids: [] };
    entry.ids.push(String(f._id));
    bySource.set(key, entry);
  }
  for (const { app, ref, ids } of bySource.values()) {
    await driveSourceApp(app)
      ?.onRemoved?.(ref, ids)
      .catch((e) => console.error(">>> Account cleanup: app couldn't drop removed files", app, ref, e));
  }

  const recipes = await Recipe.find({ owner: userId }).lean();
  for (const recipe of recipes) {
    await Recipe.deleteOne({ _id: recipe._id });
    await RecipeProgress.deleteMany({ recipe: recipe._id });
    await releaseRecipaintImages(recipeImageUrls(recipe as Parameters<typeof recipeImageUrls>[0]), recipe._id);
  }

  await deleteStoredAvatar(avatarUrl);
  return files.length;
}
