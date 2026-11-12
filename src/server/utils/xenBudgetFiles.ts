// XenBudget item photos are XenDrive files tagged `source: { app: "xenbudget", ref: <bookId> }` (utils/appFiles.ts).
// This registers the source and holds the helpers for finding and removing a book's photos.

import { Types } from "mongoose";
import { XenBudgetBook, XenBudgetItem } from "../models/xenBudget";
import { SocketManager } from "../infrastructure/SocketManager";
import { registerDriveSource } from "./driveSources";
import { deleteFromGCS } from "./gcsUtils";
import { removeAppFiles } from "./appFiles";

export const XENBUDGET_SOURCE = "xenbudget";

registerDriveSource(XENBUDGET_SOURCE, {
  label: "XenBudget",
  // Exempt from the quota for now, like every app's files. Intended rule: a shared book's photos stay exempt.
  counts: async () => false,
  verify: async (userId, ref) =>
    Types.ObjectId.isValid(ref) && !!(await XenBudgetBook.exists({ _id: ref, members: userId })),
  describe: async (userId, refs) => {
    const valid = refs.filter((r) => Types.ObjectId.isValid(r));
    const books =
      valid.length > 0 ? await XenBudgetBook.find({ _id: { $in: valid }, members: userId }, "name").lean() : [];
    const names = new Map(books.map((b) => [String(b._id), b.name]));
    // A book the person has left (or that was deleted) keeps its photos until they delete them.
    return new Map(refs.map((ref) => [ref, names.get(ref) ?? "A book you're no longer in"]));
  },
  // The person deleted the photo from XenDrive: take it off the item, so it doesn't show a broken image.
  onRemoved: async (ref, fileIds) => {
    if (!Types.ObjectId.isValid(ref)) return;
    await XenBudgetItem.updateMany(
      { book_id: ref, "images.file_id": { $in: fileIds.map((id) => new Types.ObjectId(id)) } },
      { $pull: { images: { file_id: { $in: fileIds.map((id) => new Types.ObjectId(id)) } } } },
    );
    const book = await XenBudgetBook.findById(ref, "members").lean();
    if (book) SocketManager.getInstance().notifyXenBudgetBookUpdate(ref, (book.members ?? []).map(String));
  },
});

type Photo = { file_id?: unknown; gcs_path?: string | null };

/** Delete photos from storage: XenDrive files, and any older photo that hasn't been migrated yet. */
export async function removeItemPhotos(images: Photo[]): Promise<void> {
  const fileIds = images.filter((i) => i.file_id).map((i) => String(i.file_id));
  const legacy = images.filter((i) => !i.file_id && i.gcs_path).map((i) => i.gcs_path as string);
  await Promise.all([
    removeAppFiles(fileIds),
    ...legacy.map((path) => deleteFromGCS(path, true).catch(() => undefined)),
  ]);
}
