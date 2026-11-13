import { Types } from "mongoose";
import { XenDriveFile } from "../models/xendriveFile";
import { XenDriveFolder } from "../models/xendriveFolder";
import { deleteFromGCS } from "./gcsUtils";
import { removeThumbnails } from "./xendriveThumbPaths";

// Folder tree helpers. Folders nest through parent_id; these walk that tree. Nothing here trusts the
// caller: every function that takes a folder id either filters by owner or is given an already-verified id.

/** Deepest nesting allowed. Keeps tree walks bounded and breadcrumbs readable. */
export const MAX_FOLDER_DEPTH = 20;

export interface Crumb {
  _id: string;
  name: string;
}

/**
 * The path from the top level down to `folderId` (inclusive), nearest ancestor last.
 * Stops at `stopAtId` (inclusive) when given, which is how a public folder link hides everything above it.
 */
export async function breadcrumbOf(folderId: string, ownerId: string, stopAtId?: string): Promise<Crumb[]> {
  const crumbs: Crumb[] = [];
  let current: string | null = folderId;
  for (let i = 0; current && i <= MAX_FOLDER_DEPTH; i++) {
    const folder: { _id: Types.ObjectId; name: string; parent_id?: Types.ObjectId | null } | null =
      await XenDriveFolder.findOne({ _id: current, owner_id: ownerId }, "name parent_id").lean();
    if (!folder) break;
    crumbs.unshift({ _id: folder._id.toString(), name: folder.name });
    if (stopAtId && folder._id.toString() === stopAtId) break;
    current = folder.parent_id ? folder.parent_id.toString() : null;
  }
  return crumbs;
}

/** True when `folderId` is `rootId` or sits somewhere beneath it. */
export async function isInside(folderId: string, rootId: string): Promise<boolean> {
  let current: string | null = folderId;
  for (let i = 0; current && i <= MAX_FOLDER_DEPTH + 1; i++) {
    if (current === rootId) return true;
    const folder: { parent_id?: Types.ObjectId | null } | null = await XenDriveFolder.findById(
      current,
      "parent_id",
    ).lean();
    current = folder?.parent_id ? folder.parent_id.toString() : null;
  }
  return false;
}

/** How deep `folderId` is (a top-level folder is 1). */
export async function depthOf(folderId: string | null): Promise<number> {
  let depth = 0;
  let current: string | null = folderId;
  while (current && depth <= MAX_FOLDER_DEPTH + 1) {
    const folder: { parent_id?: Types.ObjectId | null } | null = await XenDriveFolder.findById(
      current,
      "parent_id",
    ).lean();
    if (!folder) break;
    depth++;
    current = folder.parent_id ? folder.parent_id.toString() : null;
  }
  return depth;
}

/** `rootId` and the ids of every folder beneath it. */
export async function subtreeIds(rootId: string): Promise<string[]> {
  const all = [rootId];
  let frontier = [rootId];
  for (let i = 0; frontier.length > 0 && i < MAX_FOLDER_DEPTH + 1; i++) {
    const children = await XenDriveFolder.find({ parent_id: { $in: frontier } }, "_id").lean();
    frontier = children.map((c) => c._id.toString());
    all.push(...frontier);
  }
  return all;
}

export async function folderStats(rootId: string): Promise<{ folders: number; files: number; size: number }> {
  const ids = await subtreeIds(rootId);
  const [row] = await XenDriveFile.aggregate<{ files: number; size: number }>([
    { $match: { folder_id: { $in: ids.map((id) => new Types.ObjectId(id)) } } },
    { $group: { _id: null, files: { $sum: 1 }, size: { $sum: { $ifNull: ["$size", 0] } } } },
  ]);
  return { folders: ids.length - 1, files: row?.files ?? 0, size: row?.size ?? 0 };
}

/** Delete a folder, everything inside it, and the stored bytes of every file. */
export async function deleteFolderTree(rootId: string): Promise<void> {
  const ids = await subtreeIds(rootId);
  const files = await XenDriveFile.find({ folder_id: { $in: ids } }, "storage_path").lean();
  for (const file of files) {
    await deleteFromGCS(file.storage_path, true).catch(() => {
      // already gone
    });
  }
  await removeThumbnails(files.map((f) => f.storage_path));
  await XenDriveFile.deleteMany({ folder_id: { $in: ids } });
  await XenDriveFolder.deleteMany({ _id: { $in: ids } });
}
