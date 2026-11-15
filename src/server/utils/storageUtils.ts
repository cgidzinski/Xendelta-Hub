/**
 * Storing and removing single files in the buckets (storage/index.ts). Chunked XenDrive uploads are in xendriveUtils.ts;
 * database backups in storageBackups.ts.
 */

import { privateStore, publicStore, publicUrlFor } from "../storage";
import { forgetFileKeys, saveFileRecord, type FileRecordInput } from "./fileRecords";

/** What a public file's record needs besides the object itself (the bucket, key, size and type come from the upload). */
export type PublicFileMeta = Pick<FileRecordInput, "name" | "uploadedBy" | "payer" | "space" | "thumbKey">;

/**
 * Upload a buffer.
 * @returns the public URL when it went to the public bucket; nothing for the private bucket
 */
export async function uploadToStorage(
  buffer: Buffer,
  destinationPath: string,
  contentType: string,
  isPrivate: boolean = false,
  // Defaults to the historical no-store behaviour. Callers whose object names are unique
  // per upload (and so never rewritten) can pass an immutable policy instead.
  cacheControl: string = "no-cache, no-store, must-revalidate",
  // A public file's record (models/fileRecord.ts). Private files get theirs from the XenDrive file that owns them.
  record?: PublicFileMeta,
): Promise<string | void> {
  await (isPrivate ? privateStore : publicStore).put(destinationPath, buffer, { contentType, cacheControl });
  if (record && !isPrivate) {
    await saveFileRecord({
      ...record,
      bucket: "public",
      key: destinationPath,
      size: buffer.length,
      mimeType: contentType,
    });
  }
  if (!isPrivate) return publicUrlFor(destinationPath);
}

/** Delete a file and its record; a missing one is not an error. */
export async function deleteFromStorage(filePath: string, isPrivate: boolean = false): Promise<void> {
  await (isPrivate ? privateStore : publicStore).delete(filePath);
  await forgetFileKeys(isPrivate ? "private" : "public", [filePath]);
}

/**
 * A short-lived download link for a private file.
 * @param expiryMinutes - minutes until the link stops working (default: 15)
 * @param options.signingDate - fixes when the signature was made (for cacheable links); defaults to now
 */
export async function generateSignedUrl(
  filePath: string,
  expiryMinutes: number = 15,
  options: { downloadName?: string; signingDate?: Date } = {},
): Promise<string> {
  return privateStore.signedUrl(filePath, expiryMinutes, options);
}
