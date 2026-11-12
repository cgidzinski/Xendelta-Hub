/**
 * Xendrive Utilities
 * Functions for handling chunked uploads to private GCS bucket
 * Streams chunks directly to GCS using resumable uploads
 */

import https from "https";
import { privateBucket } from "../config/gcs";
import { formatFileSize } from "./fileUtils";
import { randomToken } from "./tokens";
import { XenDriveMedia } from "../models/xendriveMedia";
import { User } from "../models/user";
import { XenDriveUploadSession } from "../models/xendriveUploadSession";

// Sessions live in Mongo (models/xendriveUploadSession.ts). The storage file handle is rebuilt from
// the owner and filename, so nothing about a session needs to stay in process memory.
const gcsFileFor = (userId: string, filename: string) => privateBucket.file(`xendrive/${userId}/${filename}`);

/**
 * Generate a unique filename for xendrive files
 */
export function generateXendriveFilename(originalName: string): string {
  const ext = originalName.split(".").pop()?.toLowerCase() || "bin";
  const baseName = originalName.substring(0, originalName.lastIndexOf(".")) || "file";
  const sanitizedBase = baseName.replace(/[^a-zA-Z0-9-_]/g, "-").substring(0, 50);
  const timestamp = Date.now();
  const random = Math.round(Math.random() * 1e9);
  return `${sanitizedBase}-${timestamp}-${random}.${ext}`;
}

/**
 * Detect content type from filename extension
 */
function detectContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (ext === "jpg" || ext === "jpeg") {
    return "image/jpeg";
  } else if (ext === "png") {
    return "image/png";
  } else if (ext === "gif") {
    return "image/gif";
  } else if (ext === "pdf") {
    return "application/pdf";
  } else if (ext === "zip") {
    return "application/zip";
  }
  return "application/octet-stream";
}

/**
 * Initiate a chunked upload session with GCS resumable upload
 * @param userId - User ID
 * @param filename - Original filename
 * @param totalChunks - Total number of chunks
 * @returns Upload session ID
 */
export async function initiateChunkedUpload(userId: string, filename: string, totalChunks: number): Promise<string> {
  const uploadId = `xendrive-${Date.now()}-${randomToken(9)}`;
  const finalFilename = generateXendriveFilename(filename);
  const gcsPath = `xendrive/${userId}/${finalFilename}`;

  const gcsFile = privateBucket.file(gcsPath);

  // Start resumable upload session
  const contentType = detectContentType(finalFilename);
  const [resumableUri] = await gcsFile.createResumableUpload({
    metadata: {
      contentType,
      cacheControl: "no-cache, no-store, must-revalidate",
    },
  });

  await XenDriveUploadSession.create({
    upload_id: uploadId,
    user_id: userId,
    filename: finalFilename,
    total_chunks: totalChunks,
    resumable_uri: resumableUri,
  });
  return uploadId;
}

/**
 * Upload a chunk directly to GCS using resumable upload HTTP API
 * @param uploadId - Upload session ID
 * @param chunkIndex - Index of the chunk (0-based)
 * @param chunkData - Chunk data buffer
 */
export async function uploadChunk(uploadId: string, chunkIndex: number, chunkData: Buffer): Promise<void> {
  const session = await XenDriveUploadSession.findOne({ upload_id: uploadId });
  if (!session) {
    throw new Error(`Upload session not found: ${uploadId}`);
  }

  if (chunkIndex < 0 || chunkIndex >= session.total_chunks) {
    throw new Error(`Invalid chunk index: ${chunkIndex}`);
  }

  // Calculate byte range for this chunk
  const startByte = session.bytes_uploaded;
  const endByte = startByte + chunkData.length - 1;
  const isLastChunk = chunkIndex === session.total_chunks - 1;

  // Upload chunk directly to GCS using HTTP PUT to resumable URI
  // The resumable URI from createResumableUpload includes authentication
  await new Promise<void>((resolve, reject) => {
    const url = new URL(session.resumable_uri);

    // For the last chunk, include total size; otherwise use * for unknown total
    const totalSize = isLastChunk ? endByte + 1 : "*";
    const contentRange = `bytes ${startByte}-${endByte}/${totalSize}`;

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": chunkData.length.toString(),
        "Content-Range": contentRange,
      },
    };

    const req = https.request(options, (res) => {
      if (res.statusCode === 308) {
        // 308 Resume Incomplete - chunk uploaded successfully, more chunks expected
        resolve();
      } else if (res.statusCode === 200 || res.statusCode === 201) {
        // Upload complete (usually on last chunk)
        resolve();
      } else {
        let errorBody = "";
        res.on("data", (chunk) => {
          errorBody += chunk.toString();
        });
        res.on("end", () => {
          reject(new Error(`GCS upload failed: ${res.statusCode} ${res.statusMessage} - ${errorBody}`));
        });
      }
    });

    req.on("error", (error) => {
      reject(new Error(`GCS upload request failed: ${error.message}`));
    });

    req.write(chunkData);
    req.end();
  });

  // Update tracking
  await XenDriveUploadSession.updateOne(
    { upload_id: uploadId },
    { $inc: { bytes_uploaded: chunkData.length }, $addToSet: { received_chunks: chunkIndex } },
  );
}

/**
 * Finalize chunked upload: verify completion and create database record
 * File is already uploaded to GCS via streaming chunks
 * @param uploadId - Upload session ID
 * @returns Object with _id, url, filename, mimeType, and size
 */
export async function finalizeChunkedUpload(
  uploadId: string,
): Promise<{ _id: string; url: string; filename: string; mimeType: string; size: number }> {
  const session = await XenDriveUploadSession.findOne({ upload_id: uploadId });
  if (!session) {
    throw new Error(`Upload session not found: ${uploadId}`);
  }

  // Check if all chunks are received
  if (session.received_chunks.length !== session.total_chunks) {
    throw new Error(
      `Not all chunks received. Expected: ${session.total_chunks}, Received: ${session.received_chunks.length}`,
    );
  }
  const gcsFile = gcsFileFor(session.user_id, session.filename);

  // Get file metadata from GCS (file is already uploaded)
  const [metadata] = await gcsFile.getMetadata();
  const fileSize = parseInt(String(metadata.size ?? "0"), 10);
  const contentType = metadata.contentType || detectContentType(session.filename);

  // Create database record
  const mediaDoc = new XenDriveMedia({
    location: "xendrive",
    filename: session.filename,
    mimeType: contentType,
    size: fileSize,
    uploadedBy: session.user_id,
  });
  const savedMedia = await mediaDoc.save();

  // Update user's files array
  await User.findByIdAndUpdate(session.user_id, {
    $push: { "xendrive.files": savedMedia._id },
  });

  const gcsPath = `xendrive/${session.user_id}/${session.filename}`;

  await XenDriveUploadSession.deleteOne({ upload_id: uploadId });

  // Return metadata including _id
  return {
    _id: savedMedia._id.toString(),
    url: gcsPath, // Return GCS path instead of public URL (private bucket)
    filename: session.filename,
    mimeType: contentType,
    size: fileSize,
  };
}

/**
 * Cleanup failed upload: delete partial GCS file and remove session
 * @param uploadId - Upload session ID
 */
export async function cleanupFailedUpload(uploadId: string): Promise<void> {
  const session = await XenDriveUploadSession.findOne({ upload_id: uploadId });
  if (session) {
    // Delete partial file from GCS if it exists
    const gcsFile = gcsFileFor(session.user_id, session.filename);
    const [exists] = await gcsFile.exists();
    if (exists) {
      await gcsFile.delete().catch(() => {
        // Ignore errors if file doesn't exist or deletion fails
      });
    }
    await XenDriveUploadSession.deleteOne({ upload_id: uploadId });
  }
}

/**
 * Get upload session status
 * @param uploadId - Upload session ID
 * @returns Session status or null if not found
 */
export async function getUploadSessionStatus(
  uploadId: string,
): Promise<{ totalChunks: number; receivedChunks: number } | null> {
  const session = await XenDriveUploadSession.findOne({ upload_id: uploadId }).lean();
  if (!session) {
    return null;
  }
  return {
    totalChunks: session.total_chunks,
    receivedChunks: session.received_chunks.length,
  };
}

/**
 * Cleanup old upload sessions (older than 1 hour)
 */
export async function cleanupOldSessions(): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const stale = await XenDriveUploadSession.find({ created_at: { $lt: oneHourAgo } }, "upload_id").lean();
  await Promise.all(stale.map((s) => cleanupFailedUpload(s.upload_id)));
}
// Periodic cleanup is registered as a Scheduler job in server.ts

/**
 * Check if user has enough quota for a file upload
 * @param userId - User ID
 * @param fileSize - Size of file to upload in bytes
 * @returns Object with canUpload boolean and message
 */
export async function checkQuota(userId: string, fileSize: number): Promise<{ canUpload: boolean; message?: string }> {
  const user = await User.findById(userId).exec();
  if (!user) {
    return { canUpload: false, message: "User not found" };
  }

  const spaceAllowed = user.xendrive?.spaceAllowed || 0;

  // Calculate current space used by querying XenDriveMedia directly
  // Note: location check is redundant since we're querying XenDriveMedia collection
  const files = await XenDriveMedia.find({ uploadedBy: userId }).exec();
  const currentSpaceUsed = files.reduce((acc: number, file: any) => acc + (file.size || 0), 0);
  const newSpaceUsed = currentSpaceUsed + fileSize;

  if (newSpaceUsed > spaceAllowed) {
    const availableSpace = spaceAllowed - currentSpaceUsed;
    return {
      canUpload: false,
      message: `Quota exceeded. Available space: ${formatFileSize(availableSpace)}, File size: ${formatFileSize(fileSize)}`,
    };
  }

  return { canUpload: true };
}
