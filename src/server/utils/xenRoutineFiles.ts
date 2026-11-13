// XenRoutine photos are XenDrive files tagged `source: { app: "xenroutine", ref: <routineId> }` (utils/appFiles.ts): the
// pictures taken when a routine is marked done, kept private and shown through signed links. They hang off a history
// entry (`history[].images`). The ref is the routine, so everyone it's shared with can see them.

import { Types } from "mongoose";
import { XenRoutine } from "../models/xenRoutine";
import { registerDriveSource } from "./driveSources";
import { removeAppFiles } from "./appFiles";
import { canAct } from "./xenRoutine";

export const XENROUTINE_SOURCE = "xenroutine";

registerDriveSource(XENROUTINE_SOURCE, {
  label: "XenRoutine",
  // Exempt from the quota for now, like every app's files. Intended rule: a shared routine stays exempt.
  counts: async () => false,
  // May this person add photos to the routine? Anyone on it: owner or a member it's shared with.
  verify: async (userId, ref) => {
    if (!Types.ObjectId.isValid(ref)) return false;
    const routine = await XenRoutine.findById(ref, "owner_id members").lean();
    return !!routine && canAct(routine, userId);
  },
  describe: async (userId, refs) => {
    const valid = refs.filter((r) => Types.ObjectId.isValid(r));
    const routines =
      valid.length > 0 ? await XenRoutine.find({ _id: { $in: valid }, "members.user_id": userId }, "name").lean() : [];
    const names = new Map(routines.map((r) => [String(r._id), r.name]));
    // A routine the person is no longer on (or that was deleted) keeps their photos until they delete them.
    return new Map(refs.map((ref) => [ref, names.get(ref) ?? "A routine you're no longer on"]));
  },
  // The person deleted the photo from XenDrive: take it off the history, so it doesn't show a broken image.
  onRemoved: async (ref, fileIds) => {
    if (!Types.ObjectId.isValid(ref)) return;
    await XenRoutine.updateOne(
      { _id: ref },
      { $pull: { "history.$[].images": { file_id: { $in: fileIds.map((id) => new Types.ObjectId(id)) } } } },
    );
  },
});

type WithImages = { images?: Array<{ file_id?: unknown }> | null };

/** Delete the photos on some history entries from storage (a routine that is deleted, or entries that age out). */
export async function removeHistoryPhotos(entries: WithImages[]): Promise<void> {
  const ids = entries.flatMap((e) => (e.images ?? []).map((i) => i.file_id).filter(Boolean) as unknown[]);
  if (ids.length > 0) await removeAppFiles(ids.map(String));
}
