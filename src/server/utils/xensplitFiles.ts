// XenSplit expense photos are XenDrive files tagged `source: { app: "xensplit", ref: <groupId> }` (utils/appFiles.ts).
// This registers the source and holds the helpers for finding and removing a group's photos.

import { Types } from "mongoose";
import { XenSplit } from "../models/xenSplit";
import { SocketManager } from "../infrastructure/SocketManager";
import { registerDriveSource } from "./driveSources";
import { deleteFromStorage } from "./storageUtils";
import { removeAppFiles } from "./appFiles";
import { publicKeyFromUrl } from "../storage";

export const XENSPLIT_SOURCE = "xensplit";

registerDriveSource(XENSPLIT_SOURCE, {
  label: "XenSplit",
  // Exempt from the quota for now, like every app's files. Intended rule: a group's photos stay exempt.
  verify: async (userId, ref) =>
    Types.ObjectId.isValid(ref) && !!(await XenSplit.exists({ _id: ref, members: userId })),
  describe: async (userId, refs) => {
    const valid = refs.filter((r) => Types.ObjectId.isValid(r));
    const groups = valid.length > 0 ? await XenSplit.find({ _id: { $in: valid }, members: userId }, "name").lean() : [];
    const names = new Map(groups.map((g) => [String(g._id), g.name]));
    // A group the person has left (or that was deleted) keeps its photos until they delete them.
    return new Map(refs.map((ref) => [ref, names.get(ref) ?? "A group you're no longer in"]));
  },
  // The person deleted the photo from XenDrive: take it off the expense, so it doesn't show a broken image.
  onRemoved: async (ref, fileIds) => {
    if (!Types.ObjectId.isValid(ref)) return;
    const group = await XenSplit.findOneAndUpdate(
      { _id: ref },
      { $pull: { "expenses.$[].images": { file_id: { $in: fileIds.map((id) => new Types.ObjectId(id)) } } } },
      { projection: { members: 1 } },
    ).lean();
    if (group) {
      SocketManager.getInstance().notifyXenSplitGroupUpdate(
        ref,
        (group.members ?? []).map((m) => String(m)),
      );
    }
  },
});

type Photo = { file_id?: unknown; gcs_path?: string | null };

/** Delete photos from storage: XenDrive files, and any older photo that hasn't been migrated yet. */
export async function removeExpensePhotos(images: Photo[]): Promise<void> {
  const fileIds = images.filter((i) => i.file_id).map((i) => String(i.file_id));
  const legacy = images.filter((i) => !i.file_id && i.gcs_path).map((i) => i.gcs_path as string);
  await Promise.all([
    removeAppFiles(fileIds),
    ...legacy.map((path) => deleteFromStorage(path, true).catch(() => undefined)),
  ]);
}

/** Delete every photo of a group and its group picture, when the group itself is deleted. */
export async function removeGroupPhotos(group: {
  expenses: Array<{ images?: Photo[] }>;
  image_url?: string | null;
}): Promise<void> {
  const picture = publicKeyFromUrl(group.image_url);
  await Promise.all([
    removeExpensePhotos(group.expenses.flatMap((e) => e.images ?? [])),
    picture ? deleteFromStorage(picture).catch(() => undefined) : undefined,
  ]);
}

/** How long a deleted expense keeps its photos, so restoring it soon after brings them back. */
export const DELETED_EXPENSE_PHOTO_DAYS = 30;

/**
 * Remove the photos of expenses deleted more than DELETED_EXPENSE_PHOTO_DAYS ago (daily job). The expense itself stays
 * restorable, without its photos. Returns how many photos went.
 */
export async function purgeDeletedExpensePhotos(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - DELETED_EXPENSE_PHOTO_DAYS * 24 * 60 * 60 * 1000);
  const old = { deleted_at: { $ne: null, $lt: cutoff }, "images.0": { $exists: true } };
  let removed = 0;
  for await (const group of XenSplit.find(
    { expenses: { $elemMatch: old } },
    "expenses._id expenses.deleted_at expenses.images",
  )) {
    const expenses = group.expenses.filter((e) => e.deleted_at && e.deleted_at < cutoff && (e.images?.length ?? 0) > 0);
    const photos = expenses.flatMap((e) => (e.images ?? []) as Photo[]);
    await XenSplit.updateOne(
      { _id: group._id },
      { $set: { "expenses.$[e].images": [] } },
      { arrayFilters: [{ "e._id": { $in: expenses.map((e) => e._id) } }] },
    );
    await removeExpensePhotos(photos);
    removed += photos.length;
  }
  return removed;
}
