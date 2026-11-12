// XenKitchen photos are XenDrive files tagged `source: { app: "xenkitchen", ref: <itemId> }` (utils/appFiles.ts), kept
// private and shown through signed links, so a shared recipe page serves them too. The ref is the item, not its book,
// because an item can move between books and its photos go with it.

import { Types } from "mongoose";
import { XenKitchenBook, XenKitchenItem } from "../models/xenKitchen";
import { canEdit } from "./membership";
import { registerDriveSource } from "./driveSources";
import { deleteFromGCS } from "./gcsUtils";
import { removeAppFiles, signedUrlsFor } from "./appFiles";

export const XENKITCHEN_SOURCE = "xenkitchen";

const PHOTO_URL_MINUTES = 60;

registerDriveSource(XENKITCHEN_SOURCE, {
  label: "XenKitchen",
  // Exempt from the quota for now, like every app's files. Intended rule: an item in a shared book stays exempt.
  counts: async () => false,
  // May this person add photos to the item? An editor of its book.
  verify: async (userId, ref) => {
    if (!Types.ObjectId.isValid(ref)) return false;
    const item = await XenKitchenItem.findById(ref, "book_id").lean();
    const book = item ? await XenKitchenBook.findById(item.book_id, "members").lean() : null;
    return !!book && canEdit(book, userId);
  },
  describe: async (userId, refs) => {
    const valid = refs.filter((r) => Types.ObjectId.isValid(r));
    const items = valid.length > 0 ? await XenKitchenItem.find({ _id: { $in: valid } }, "book_id title").lean() : [];
    const books = await XenKitchenBook.find(
      { _id: { $in: items.map((i) => i.book_id) }, "members.user_id": userId },
      "_id",
    ).lean();
    const visibleBooks = new Set(books.map((b) => String(b._id)));
    const names = new Map(
      items
        .filter((i) => visibleBooks.has(String(i.book_id)))
        .map((i) => [String(i._id), i.title?.trim() || "Untitled"]),
    );
    // An item the person can no longer see (or that was deleted) keeps its photos until they delete them.
    return new Map(refs.map((ref) => [ref, names.get(ref) ?? "A recipe you can't see anymore"]));
  },
  // The person deleted the photo from XenDrive: take it off the item, so it doesn't show a broken image.
  onRemoved: async (ref, fileIds) => {
    if (!Types.ObjectId.isValid(ref)) return;
    await XenKitchenItem.updateOne(
      { _id: ref },
      { $pull: { images: { file_id: { $in: fileIds.map((id) => new Types.ObjectId(id)) } } } },
    );
  },
});

type Photo = { file_id?: unknown; gcs_path?: string | null };

/** Delete photos from storage: XenDrive files, and any older photo that hasn't been moved yet (public bucket). */
export async function removeKitchenPhotos(images: Photo[]): Promise<void> {
  const fileIds = images.filter((i) => i.file_id).map((i) => String(i.file_id));
  const legacy = images.filter((i) => !i.file_id && i.gcs_path).map((i) => i.gcs_path as string);
  await Promise.all([
    removeAppFiles(fileIds),
    ...legacy.map((path) => deleteFromGCS(path, false).catch(() => undefined)),
  ]);
}

type WithImages = { images?: Array<{ _id?: unknown; file_id?: unknown; url?: string | null }> };

/**
 * Items with each photo's `url` filled in: a short-lived signed link for a XenDrive file, or the stored public link of
 * an older photo. One lookup covers every item, so lists don't cost a query per item.
 */
export async function withPhotoUrls<T extends WithImages>(items: T[]): Promise<T[]> {
  const fileIds = items.flatMap((i) => (i.images ?? []).filter((img) => img.file_id).map((img) => String(img.file_id)));
  if (fileIds.length === 0) return items;
  const urls = await signedUrlsFor(fileIds, PHOTO_URL_MINUTES);
  return items.map((item) => ({
    ...item,
    images: (item.images ?? [])
      .map((img) => (img.file_id ? { ...img, url: urls.get(String(img.file_id)) } : img))
      .filter((img) => !!img.url),
  }));
}
