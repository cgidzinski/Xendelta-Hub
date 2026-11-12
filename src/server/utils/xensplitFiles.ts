// XenSplit expense photos are XenDrive files tagged `source: { app: "xensplit", ref: <groupId> }` (utils/appFiles.ts).
// This registers the source and holds the helpers for finding and removing a group's photos.

import { Types } from "mongoose";
import { XenSplit } from "../models/xenSplit";
import { SocketManager } from "../infrastructure/SocketManager";
import { registerDriveSource } from "./driveSources";
import { deleteFromGCS } from "./gcsUtils";
import { removeAppFiles } from "./appFiles";

export const XENSPLIT_SOURCE = "xensplit";

registerDriveSource(XENSPLIT_SOURCE, {
  label: "XenSplit",
  // Exempt from the quota for now, like every app's files. Intended rule: a group's photos stay exempt.
  counts: async () => false,
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
    ...legacy.map((path) => deleteFromGCS(path, true).catch(() => undefined)),
  ]);
}

/** Delete every photo of a group (when the group itself is deleted). Soft-deleted expenses keep theirs until now. */
export const removeGroupPhotos = (group: { expenses: Array<{ images?: Photo[] }> }) =>
  removeExpensePhotos(group.expenses.flatMap((e) => e.images ?? []));
