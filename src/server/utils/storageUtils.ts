/**
 * Storing and removing single files in the buckets (storage/index.ts). Chunked XenDrive uploads are in xendriveUtils.ts;
 * database backups in storageBackups.ts.
 */

import { privateStore, publicStore, publicUrlFor } from "../storage";

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
): Promise<string | void> {
  await (isPrivate ? privateStore : publicStore).put(destinationPath, buffer, { contentType, cacheControl });
  if (!isPrivate) return publicUrlFor(destinationPath);
}

/** Delete a file; a missing one is not an error. */
export async function deleteFromStorage(filePath: string, isPrivate: boolean = false): Promise<void> {
  await (isPrivate ? privateStore : publicStore).delete(filePath);
}

/**
 * A short-lived download link for a private file.
 * @param expiryMinutes - minutes until the link stops working (default: 15)
 */
export async function generateSignedUrl(
  filePath: string,
  expiryMinutes: number = 15,
  options: { downloadName?: string } = {},
): Promise<string> {
  return privateStore.signedUrl(filePath, expiryMinutes, options);
}
