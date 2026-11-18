// XenKitchen photos are XenDrive files tagged `source: { app: "xenkitchen", ref: <itemId> }` (utils/appFiles.ts), kept
// private and shown through signed links, so a shared recipe page serves them too. The ref is the item, not its book,
// because an item can move between books and its photos go with it.

import { Types } from "mongoose";
import { XenKitchenBook, XenKitchenItem } from "../models/xenKitchen";
import { canEdit } from "./membership";
import { registerDriveSource } from "./driveSources";
import { deleteFromStorage } from "./storageUtils";
import { removeAppFiles, signedUrlsFor, thumbnailUrlsFor } from "./appFiles";

export const XENKITCHEN_SOURCE = "xenkitchen";
/** A recipe book's cover picture. The ref is the book, so the file lives in `xenkitchen-book/<bookId>/`. */
export const XENKITCHEN_BOOK_SOURCE = "xenkitchen-book";

const PHOTO_URL_MINUTES = 60;

registerDriveSource(XENKITCHEN_SOURCE, {
  label: "XenKitchen",
  // Exempt from the quota for now, like every app's files. Intended rule: an item in a shared book stays exempt.
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

registerDriveSource(XENKITCHEN_BOOK_SOURCE, {
  label: "XenKitchen covers",
  // May this person change the cover? An editor of the book.
  verify: async (userId, ref) => {
    if (!Types.ObjectId.isValid(ref)) return false;
    const book = await XenKitchenBook.findById(ref, "members").lean();
    return !!book && canEdit(book, userId);
  },
  describe: async (userId, refs) => {
    const valid = refs.filter((r) => Types.ObjectId.isValid(r));
    const books = valid.length
      ? await XenKitchenBook.find({ _id: { $in: valid }, "members.user_id": userId }, "name").lean()
      : [];
    const names = new Map(books.map((b) => [String(b._id), b.name]));
    return new Map(refs.map((ref) => [ref, names.get(ref) ?? "A recipe book you can't see anymore"]));
  },
  // The person deleted the cover from XenDrive: the book goes back to its generated cover.
  onRemoved: async (ref, fileIds) => {
    if (!Types.ObjectId.isValid(ref)) return;
    await XenKitchenBook.updateOne({ _id: ref, "cover.file_id": { $in: fileIds } }, { $unset: { cover: "" } });
  },
});

/** A book's cover as links: a signed one for the picture and a thumbnail, or nulls when it has none. */
export async function coverUrlsFor(
  books: Array<{ _id: unknown; cover?: { file_id?: unknown } | null }>,
): Promise<Map<string, { url: string; thumbUrl: string | null }>> {
  const ids = books.flatMap((b) => (b.cover?.file_id ? [String(b.cover.file_id)] : []));
  if (ids.length === 0) return new Map();
  const [urls, thumbs] = await Promise.all([signedUrlsFor(ids, PHOTO_URL_MINUTES), thumbnailUrlsFor(ids)]);
  const out = new Map<string, { url: string; thumbUrl: string | null }>();
  for (const b of books) {
    const id = b.cover?.file_id ? String(b.cover.file_id) : "";
    const url = id ? urls.get(id) : undefined;
    if (url) out.set(String(b._id), { url, thumbUrl: thumbs.get(id) ?? null });
  }
  return out;
}

type Photo = { file_id?: unknown; gcs_path?: string | null };

/** Delete photos from storage: XenDrive files, and any older photo that hasn't been moved yet (public bucket). */
export async function removeKitchenPhotos(images: Photo[]): Promise<void> {
  const fileIds = images.filter((i) => i.file_id).map((i) => String(i.file_id));
  const legacy = images.filter((i) => !i.file_id && i.gcs_path).map((i) => i.gcs_path as string);
  await Promise.all([
    removeAppFiles(fileIds),
    ...legacy.map((path) => deleteFromStorage(path, false).catch(() => undefined)),
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
  const [urls, thumbs] = await Promise.all([signedUrlsFor(fileIds, PHOTO_URL_MINUTES), thumbnailUrlsFor(fileIds)]);
  return items.map((item) => ({
    ...item,
    images: (item.images ?? [])
      .map((img) =>
        img.file_id
          ? { ...img, url: urls.get(String(img.file_id)), thumbUrl: thumbs.get(String(img.file_id)) ?? null }
          : img,
      )
      .filter((img) => !!img.url),
  }));
}
