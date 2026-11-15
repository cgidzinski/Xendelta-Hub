/**
 * Files an app stores for a person (photos on an expense, a note, a recipe, a chat attachment) are FileRecords in the
 * private bucket (models/fileRecord.ts): `space: { app, ref }` (utils/driveSources.ts), uploaded by and paid for by the
 * person, listed in the storage viewer and deleted like any file. They are not XenDrive items. Apps call these helpers
 * instead of `uploadToStorage`.
 */

import { privateStore, publicStore, type ObjectStore } from "../storage";
import { FileRecord, type FileRecordDocument } from "../models/fileRecord";
import { assertDriveSource, type DriveSource } from "./driveSources";
import { deleteFromStorage, generateSignedUrl, uploadToStorage } from "./storageUtils";
import { generateXendriveFilename, storageKeyFor } from "./xendriveUtils";
import { thumbKey, thumbStatusFor, thumbnailUrlFor } from "./xendriveThumbs";
import { payerFor } from "./fileRecords";
import { assertCanStore } from "../billing/storageMeter";

export interface AppFileInput {
  buffer: Buffer;
  /** What people see in XenDrive (the original file name). */
  name: string;
  mimeType: string;
}

/**
 * Store files for `userId` under `source`. All or nothing: if any upload or record fails, what was stored is removed
 * and the error is thrown, so a retry doesn't leave orphans. Refuses (413) when the files count and don't fit.
 */
export async function storeAppFiles(
  userId: string,
  source: DriveSource,
  files: AppFileInput[],
): Promise<FileRecordDocument[]> {
  if (files.length === 0) return [];
  await assertDriveSource(userId, source);
  await assertCanStore(userId, source);

  const paths = files.map((f) => storageKeyFor(userId, source, generateXendriveFilename(f.name)));
  const uploads = await Promise.allSettled(files.map((f, i) => uploadToStorage(f.buffer, paths[i], f.mimeType, true)));
  const uploaded = paths.filter((_, i) => uploads[i].status === "fulfilled");
  const failed = uploads.find((u): u is PromiseRejectedResult => u.status === "rejected");
  if (failed) {
    await deleteBytes(uploaded);
    throw failed.reason;
  }

  try {
    const payer = await payerFor(userId, source);
    return await Promise.all(
      files.map((f, i) =>
        FileRecord.create({
          bucket: "private",
          key: paths[i],
          size: f.buffer.length,
          mimeType: f.mimeType,
          name: f.name,
          uploadedBy: userId,
          payer,
          space: { app: source.app, ref: source.ref },
          thumbStatus: thumbStatusFor(f.mimeType),
        }),
      ),
    );
  } catch (error) {
    await FileRecord.deleteMany({ bucket: "private", key: { $in: paths } });
    await deleteBytes(paths);
    throw error;
  }
}

/** Something to copy: an existing XenDrive file, or a photo from before apps used XenDrive (public bucket path). */
export type AppFileOrigin = { fileId: string } | { publicPath: string };

/**
 * Give `userId` their own tagged copy of each origin, copied inside storage (nothing is downloaded). Each copy is its
 * own file, so deleting one never affects another. A photo that can't be found or copied is skipped, so one broken
 * photo doesn't stop an item from being duplicated. Refuses (413) when the copies count and don't fit.
 */
export async function copyAppFiles(
  userId: string,
  source: DriveSource,
  origins: AppFileOrigin[],
): Promise<FileRecordDocument[]> {
  if (origins.length === 0) return [];
  await assertDriveSource(userId, source);
  await assertCanStore(userId, source);

  const found = await Promise.all(
    origins.map(async (origin) => {
      try {
        if ("fileId" in origin) {
          const doc = await FileRecord.findById(origin.fileId).lean();
          if (!doc || doc.bucket !== "private") return null;
          return {
            store: privateStore as ObjectStore,
            key: doc.key,
            name: doc.name,
            mimeType: doc.mimeType,
            size: doc.size ?? 0,
            thumb: doc.thumbKey
              ? { path: doc.thumbKey, width: doc.thumbWidth ?? 0, height: doc.thumbHeight ?? 0 }
              : null,
          };
        }
        const info = await publicStore.head(origin.publicPath);
        if (!info) return null;
        return {
          store: publicStore,
          key: origin.publicPath,
          name: origin.publicPath.split("/").pop() || "photo",
          mimeType: info.contentType || "application/octet-stream",
          size: info.size,
          thumb: null,
        };
      } catch (error) {
        console.error(">>> App file copy skipped:", origin, error);
        return null;
      }
    }),
  );
  const sources = found.filter((f): f is NonNullable<typeof f> => !!f);

  const copies: FileRecordDocument[] = [];
  for (const from of sources) {
    const path = storageKeyFor(userId, source, generateXendriveFilename(from.name));
    try {
      await privateStore.copyFrom(from.store, from.key, path);
    } catch (error) {
      console.error(">>> App file copy failed:", from.name, error);
      continue;
    }
    // A copy owns its thumbnail too: copy the original's when there is one, else the background job makes it.
    let thumb: { path: string; width: number; height: number } | null = null;
    let thumbStatus: "pending" | "ready" | "none" = thumbStatusFor(from.mimeType);
    if (from.thumb?.path) {
      const copyThumbPath = thumbKey(path);
      try {
        await privateStore.copyFrom(from.store, from.thumb.path, copyThumbPath);
        thumb = { path: copyThumbPath, width: from.thumb.width ?? 0, height: from.thumb.height ?? 0 };
        thumbStatus = "ready";
      } catch (error) {
        console.error(">>> App thumbnail copy failed:", from.name, error);
        thumbStatus = "pending";
      }
    }

    try {
      const copy = await FileRecord.create({
        bucket: "private",
        key: path,
        size: from.size,
        mimeType: from.mimeType,
        name: from.name,
        uploadedBy: userId,
        payer: await payerFor(userId, source),
        space: { app: source.app, ref: source.ref },
        thumbKey: thumb?.path,
        thumbWidth: thumb?.width,
        thumbHeight: thumb?.height,
        thumbStatus,
      });
      copies.push(copy);
    } catch (error) {
      await deleteBytes([path]);
      if (thumb?.path) await deleteFromStorage(thumb.path, true).catch(() => undefined);
      throw error;
    }
  }
  return copies;
}

/** Delete these files and their stored bytes (thumbnails included). Ids that no longer exist are ignored. */
export async function removeAppFiles(fileIds: Array<string | { toString(): string }>): Promise<void> {
  const ids = fileIds.map(String);
  if (ids.length === 0) return;
  const files = await FileRecord.find({ _id: { $in: ids } }).lean();
  await FileRecord.deleteMany({ _id: { $in: ids } });
  await deleteBytes(files.flatMap((f) => [f.key, f.thumbKey, f.previewKey].filter((p): p is string => !!p)));
}

/** Short-lived links for these files, by id. Files that no longer exist are left out. */
export async function signedUrlsFor(
  fileIds: Array<string | { toString(): string }>,
  minutes: number,
): Promise<Map<string, string>> {
  const ids = fileIds.map(String);
  if (ids.length === 0) return new Map();
  const files = await FileRecord.find({ _id: { $in: ids } }, "key").lean();
  const urls = await Promise.all(files.map((f) => generateSignedUrl(f.key, minutes)));
  return new Map(files.map((f, i) => [String(f._id), urls[i]]));
}

/** Cacheable thumbnail links for these files, by id. Files without a thumbnail yet are left out. */
export async function thumbnailUrlsFor(fileIds: Array<string | { toString(): string }>): Promise<Map<string, string>> {
  const ids = fileIds.map(String);
  if (ids.length === 0) return new Map();
  const files = await FileRecord.find({ _id: { $in: ids } }, "key thumbKey").lean();
  const urls = await Promise.all(files.map((f) => (f.thumbKey ? thumbnailUrlFor(f.key) : null)));
  return new Map(files.map((f, i) => [String(f._id), urls[i]]).filter(([, u]) => u != null) as Array<[string, string]>);
}

const deleteBytes = (paths: string[]) =>
  Promise.allSettled(paths.map((p) => deleteFromStorage(p, true))).then(() => undefined);
