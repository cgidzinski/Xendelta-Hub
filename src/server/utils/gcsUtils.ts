/**
 * Google Cloud Storage Utilities
 * Functions for uploading, downloading, deleting, and streaming files from GCS
 */

import { publicBucket, privateBucket } from "../config/gcs";
import { Readable } from "stream";

export interface FileMetadata {
  exists: boolean;
  contentType: string;
  size: number;
  etag: string;
  updated: Date;
  metadata: {
    [key: string]: string;
  };
}

/**
 * Upload a buffer to Google Cloud Storage (public bucket)
 * Note: Bucket must have uniform bucket-level access enabled and be configured as public
 */
export async function uploadToPublicGCS(
  buffer: Buffer,
  destinationPath: string,
  contentType: string
): Promise<string> {
  const file = publicBucket.file(destinationPath);

  await file.save(buffer, {
    metadata: {
      contentType,
    },
    // Don't set public: true when uniform bucket-level access is enabled
  });

  // Return public URL
  return `https://storage.googleapis.com/${publicBucket.name}/${destinationPath}`;
}

/**
 * Upload a buffer to Google Cloud Storage (private bucket)
 */
export async function uploadToPrivateGCS(
  buffer: Buffer,
  destinationPath: string,
  contentType: string
): Promise<void> {
  const file = privateBucket.file(destinationPath);

  await file.save(buffer, {
    metadata: {
      contentType,
    },
  });
}

/**
 * Delete a file from Google Cloud Storage (public bucket)
 */
export async function deleteFromPublicGCS(filePath: string): Promise<void> {
  const file = publicBucket.file(filePath);
  await file.delete();
}

/**
 * Delete a file from Google Cloud Storage (private bucket)
 */
export async function deleteFromPrivateGCS(filePath: string): Promise<void> {
  const file = privateBucket.file(filePath);
  await file.delete();
}

/**
 * Stream a file from Google Cloud Storage (public bucket)
 * Returns a readable stream
 */
export async function streamFromPublicGCS(filePath: string): Promise<Readable> {
  const file = publicBucket.file(filePath);
  const [exists] = await file.exists();

  if (!exists) {
    throw new Error(`File not found: ${filePath}`);
  }

  return file.createReadStream();
}

/**
 * Stream a file from Google Cloud Storage (private bucket)
 * Returns a readable stream
 */
export async function streamFromPrivateGCS(filePath: string): Promise<Readable> {
  const file = privateBucket.file(filePath);
  const [exists] = await file.exists();

  if (!exists) {
    throw new Error(`File not found: ${filePath}`);
  }

  return file.createReadStream();
}

/**
 * Get file metadata from Google Cloud Storage (public bucket)
 */
export async function getPublicFileMetadata(
  filePath: string
): Promise<FileMetadata | null> {
  const file = publicBucket.file(filePath);
  const [exists] = await file.exists();

  if (!exists) {
    return null;
  }

  const [metadata] = await file.getMetadata();

  // Handle size - it can be string or number
  const sizeValue = metadata.size;
  const size = typeof sizeValue === "string" 
    ? parseInt(sizeValue, 10) 
    : typeof sizeValue === "number" 
    ? sizeValue 
    : 0;

  // Handle metadata - convert all values to strings
  const metadataObj: { [key: string]: string } = {};
  if (metadata.metadata) {
    for (const [key, value] of Object.entries(metadata.metadata)) {
      metadataObj[key] = value != null ? String(value) : "";
    }
  }

  return {
    exists: true,
    contentType: metadata.contentType || "application/octet-stream",
    size,
    etag: metadata.etag || "",
    updated: new Date(metadata.updated || Date.now()),
    metadata: metadataObj,
  };
}

/**
 * Helper to construct GCS path
 */
export function getGcsPath(folder: string, filename: string): string {
  return `${folder}/${filename}`;
}

