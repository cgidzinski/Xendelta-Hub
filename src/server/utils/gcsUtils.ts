/**
 * Google Cloud Storage Utilities
 * Functions for uploading and deleting files from GCS
 */

import { publicBucket, privateBucket } from "../config/gcs";

/**
 * Upload a buffer to Google Cloud Storage
 * @param buffer - File buffer to upload
 * @param destinationPath - Path in the bucket
 * @param contentType - MIME type of the file
 * @param isPrivate - Whether to use private bucket (default: false for public)
 * @returns Public URL if public bucket, void if private bucket
 */
export async function uploadToGCS(
  buffer: Buffer,
  destinationPath: string,
  contentType: string,
  isPrivate: boolean = false
): Promise<string | void> {
  const bucket = isPrivate ? privateBucket : publicBucket;
  const file = bucket.file(destinationPath);

  await file.save(buffer, {
    metadata: {
      contentType,
      cacheControl: "no-cache, no-store, must-revalidate",
    },
  });

  // Return public URL only for public bucket
  if (!isPrivate) {
    return `https://storage.googleapis.com/${bucket.name}/${destinationPath}`;
  }
}

/**
 * Delete a file from Google Cloud Storage
 * @param filePath - Path to the file in the bucket
 * @param isPrivate - Whether to use private bucket (default: false for public)
 */
export async function deleteFromGCS(filePath: string, isPrivate: boolean = false): Promise<void> {
  const bucket = isPrivate ? privateBucket : publicBucket;
  const file = bucket.file(filePath);
  await file.delete();
}

/**
 * Helper to construct GCS path
 */
export function getGcsPath(folder: string, filename: string): string {
  return `${folder}/${filename}`;
}

/**
 * Generate a signed URL for a private GCS file
 * @param filePath - Path to the file in the private bucket
 * @param expiryMinutes - Number of minutes until the URL expires (default: 15)
 * @returns Signed URL string
 */
export async function generateSignedUrl(filePath: string, expiryMinutes: number = 15): Promise<string> {
  const file = privateBucket.file(filePath);
  const [url] = await file.getSignedUrl({
    action: "read",
    expires: Date.now() + expiryMinutes * 60 * 1000,
  });
  return url;
}
