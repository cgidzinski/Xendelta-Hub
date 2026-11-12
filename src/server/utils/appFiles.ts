/**
 * Files an app stores for a person (photos on an expense, a note, a recipe) are real XenDrive files, tagged with
 * `source: { app, ref }` (utils/driveSources.ts). They live in the private bucket, belong to the uploader, show up
 * under XenDrive > From apps, and are deleted like any file. Apps call these helpers instead of `uploadToGCS`.
 *
 * Whether a file counts toward the owner's quota is the app's call for that `ref` (`DriveSourceApp.counts`).
 */

import { privateBucket, publicBucket } from "../config/gcs";
import { XenDriveFile, type XenDriveFileDocument } from "../models/xendriveFile";
import { AppError } from "./http";
import { assertDriveSource, driveSourceApp, type DriveSource } from "./driveSources";
import { deleteFromGCS, generateSignedUrl, uploadToGCS } from "./gcsUtils";
import { checkQuota, generateXendriveFilename } from "./xendriveUtils";

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
): Promise<XenDriveFileDocument[]> {
  if (files.length === 0) return [];
  await assertDriveSource(userId, source);

  const counted = (await driveSourceApp(source.app)?.counts(source.ref)) ?? true;
  if (counted) {
    const quota = await checkQuota(
      userId,
      files.reduce((n, f) => n + f.buffer.length, 0),
    );
    if (!quota.canUpload) throw new AppError(413, quota.message ?? "Not enough storage");
  }

  const paths = files.map((f) => `xendrive/${userId}/${generateXendriveFilename(f.name)}`);
  const uploads = await Promise.allSettled(files.map((f, i) => uploadToGCS(f.buffer, paths[i], f.mimeType, true)));
  const uploaded = paths.filter((_, i) => uploads[i].status === "fulfilled");
  const failed = uploads.find((u): u is PromiseRejectedResult => u.status === "rejected");
  if (failed) {
    await deleteBytes(uploaded);
    throw failed.reason;
  }

  try {
    return (await Promise.all(
      files.map((f, i) =>
        XenDriveFile.create({
          owner_id: userId,
          folder_id: null,
          name: f.name,
          storage_path: paths[i],
          mimeType: f.mimeType,
          size: f.buffer.length,
          counted,
          source: { app: source.app, ref: source.ref },
        }),
      ),
    )) as unknown as XenDriveFileDocument[];
  } catch (error) {
    await XenDriveFile.deleteMany({ storage_path: { $in: paths } });
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
): Promise<XenDriveFileDocument[]> {
  if (origins.length === 0) return [];
  await assertDriveSource(userId, source);

  const found = await Promise.all(
    origins.map(async (origin) => {
      try {
        if ("fileId" in origin) {
          const doc = await XenDriveFile.findById(origin.fileId, "storage_path name mimeType size").lean();
          if (!doc) return null;
          return {
            file: privateBucket.file(doc.storage_path),
            name: doc.name,
            mimeType: doc.mimeType,
            size: doc.size ?? 0,
          };
        }
        const file = publicBucket.file(origin.publicPath);
        const [metadata] = await file.getMetadata();
        return {
          file,
          name: origin.publicPath.split("/").pop() || "photo",
          mimeType: String(metadata.contentType || "application/octet-stream"),
          size: parseInt(String(metadata.size ?? "0"), 10),
        };
      } catch (error) {
        console.error(">>> App file copy skipped:", origin, error);
        return null;
      }
    }),
  );
  const sources = found.filter((f): f is NonNullable<typeof f> => !!f);

  const counted = (await driveSourceApp(source.app)?.counts(source.ref)) ?? true;
  if (counted) {
    const quota = await checkQuota(
      userId,
      sources.reduce((n, f) => n + f.size, 0),
    );
    if (!quota.canUpload) throw new AppError(413, quota.message ?? "Not enough storage");
  }

  const copies: XenDriveFileDocument[] = [];
  for (const from of sources) {
    const path = `xendrive/${userId}/${generateXendriveFilename(from.name)}`;
    try {
      await from.file.copy(privateBucket.file(path));
    } catch (error) {
      console.error(">>> App file copy failed:", from.name, error);
      continue;
    }
    try {
      copies.push(
        (await XenDriveFile.create({
          owner_id: userId,
          folder_id: null,
          name: from.name,
          storage_path: path,
          mimeType: from.mimeType,
          size: from.size,
          counted,
          source: { app: source.app, ref: source.ref },
        })) as unknown as XenDriveFileDocument,
      );
    } catch (error) {
      await deleteBytes([path]);
      throw error;
    }
  }
  return copies;
}

/** Delete these files and their stored bytes. Ids that no longer exist are ignored. */
export async function removeAppFiles(fileIds: Array<string | { toString(): string }>): Promise<void> {
  const ids = fileIds.map(String);
  if (ids.length === 0) return;
  const files = await XenDriveFile.find({ _id: { $in: ids } }, "storage_path").lean();
  await XenDriveFile.deleteMany({ _id: { $in: ids } });
  await deleteBytes(files.map((f) => f.storage_path));
}

/** Short-lived links for these files, by id. Files that no longer exist are left out. */
export async function signedUrlsFor(
  fileIds: Array<string | { toString(): string }>,
  minutes: number,
): Promise<Map<string, string>> {
  const ids = fileIds.map(String);
  if (ids.length === 0) return new Map();
  const files = await XenDriveFile.find({ _id: { $in: ids } }, "storage_path").lean();
  const urls = await Promise.all(files.map((f) => generateSignedUrl(f.storage_path, minutes)));
  return new Map(files.map((f, i) => [String(f._id), urls[i]]));
}

const deleteBytes = (paths: string[]) =>
  Promise.allSettled(paths.map((p) => deleteFromGCS(p, true))).then(() => undefined);
