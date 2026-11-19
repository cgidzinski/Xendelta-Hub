import { XenDriveFile } from "../models/xendriveFile";
import { trashCutoff } from "./softDelete";

/** Remove trashed files for good; each one's stored bytes go with it (the model's delete hook). Returns how many. */
export async function deleteFilesForever(ids: unknown[]): Promise<number> {
  for (const id of ids) await XenDriveFile.findByIdAndDelete(id);
  return ids.length;
}

/** The daily purge: files that have been in the Trash for 30 days. */
export async function purgeExpiredFiles(now = new Date()): Promise<number> {
  const old = await XenDriveFile.find({ deleted_at: { $lte: trashCutoff(now) } }, "_id")
    .setOptions({ includeDeleted: true })
    .limit(500)
    .lean();
  return deleteFilesForever(old.map((f) => f._id));
}
