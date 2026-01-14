/**
 * Xenbox Utilities
 * Functions for handling chunked uploads to private GCS bucket
 * Streams chunks directly to GCS using resumable uploads
 */

import https from "https";
import { privateBucket } from "../config/gcs";
import { formatFileSize } from "./fileUtils";
const { XenBoxMedia } = require("../models/xenboxMedia");
const { User } = require("../models/user");

// Upload session interface
interface UploadSession {
  userId: string;
  filename: string;
  totalChunks: number;
  receivedChunks: Set<number>;
  gcsFile: any; // GCS File object
  resumableUri: string; // GCS resumable upload URI
  bytesUploaded: number; // Track total bytes uploaded
  createdAt: number;
}

// Store upload sessions in memory (consider Redis for production)
const uploadSessions = new Map<string, UploadSession>();

/**
 * Generate a unique filename for xenbox files
 */
export function generateXenboxFilename(originalName: string): string {
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
  const uploadId = `xenbox-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const finalFilename = generateXenboxFilename(filename);
  const gcsPath = `xenbox/${userId}/${finalFilename}`;
  
  const gcsFile = privateBucket.file(gcsPath);
  
  // Start resumable upload session
  const contentType = detectContentType(finalFilename);
  const [resumableUri] = await gcsFile.createResumableUpload({
    metadata: {
      contentType,
      cacheControl: "no-cache, no-store, must-revalidate",
    },
  });
  
  const session: UploadSession = {
    userId,
    filename: finalFilename,
    totalChunks,
    receivedChunks: new Set(),
    gcsFile,
    resumableUri,
    bytesUploaded: 0,
    createdAt: Date.now(),
  };
  
  uploadSessions.set(uploadId, session);
  return uploadId;
}

/**
 * Upload a chunk directly to GCS using resumable upload HTTP API
 * @param uploadId - Upload session ID
 * @param chunkIndex - Index of the chunk (0-based)
 * @param chunkData - Chunk data buffer
 */
export async function uploadChunk(uploadId: string, chunkIndex: number, chunkData: Buffer): Promise<void> {
  const session = uploadSessions.get(uploadId);
  if (!session) {
    throw new Error(`Upload session not found: ${uploadId}`);
  }

  if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
    throw new Error(`Invalid chunk index: ${chunkIndex}`);
  }

  // Calculate byte range for this chunk
  const startByte = session.bytesUploaded;
  const endByte = startByte + chunkData.length - 1;
  const isLastChunk = chunkIndex === session.totalChunks - 1;

  // Upload chunk directly to GCS using HTTP PUT to resumable URI
  // The resumable URI from createResumableUpload includes authentication
  await new Promise<void>((resolve, reject) => {
    const url = new URL(session.resumableUri);
    
    // For the last chunk, include total size; otherwise use * for unknown total
    const totalSize = isLastChunk ? (endByte + 1) : "*";
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
  session.bytesUploaded += chunkData.length;
  session.receivedChunks.add(chunkIndex);
}

/**
 * Finalize chunked upload: verify completion and create database record
 * File is already uploaded to GCS via streaming chunks
 * @param uploadId - Upload session ID
 * @returns Object with _id, url, filename, mimeType, and size
 */
export async function finalizeChunkedUpload(uploadId: string): Promise<{ _id: string; url: string; filename: string; mimeType: string; size: number }> {
  const session = uploadSessions.get(uploadId);
  if (!session) {
    throw new Error(`Upload session not found: ${uploadId}`);
  }

  // Check if all chunks are received
  if (session.receivedChunks.size !== session.totalChunks) {
    throw new Error(`Not all chunks received. Expected: ${session.totalChunks}, Received: ${session.receivedChunks.size}`);
  }

  // Get file metadata from GCS (file is already uploaded)
  const [metadata] = await session.gcsFile.getMetadata();
  const fileSize = parseInt(metadata.size || "0", 10);
  const contentType = metadata.contentType || detectContentType(session.filename);

  // Create database record
  const mediaDoc = new XenBoxMedia({
    location: "xenbox",
    filename: session.filename,
    mimeType: contentType,
    size: fileSize,
    uploadedBy: session.userId,
  });
  const savedMedia = await mediaDoc.save();

  // Update user's files array
  await User.findByIdAndUpdate(session.userId, {
    $push: { "xenbox.files": savedMedia._id },
  });

  const gcsPath = `xenbox/${session.userId}/${session.filename}`;

  // Cleanup session (no disk cleanup needed)
  uploadSessions.delete(uploadId);

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
  const session = uploadSessions.get(uploadId);
  if (session) {
    // Delete partial file from GCS if it exists
    const [exists] = await session.gcsFile.exists();
    if (exists) {
      await session.gcsFile.delete().catch(() => {
        // Ignore errors if file doesn't exist or deletion fails
      });
    }
    // Remove session
    uploadSessions.delete(uploadId);
  }
}

/**
 * Get upload session status
 * @param uploadId - Upload session ID
 * @returns Session status or null if not found
 */
export function getUploadSessionStatus(uploadId: string): { totalChunks: number; receivedChunks: number } | null {
  const session = uploadSessions.get(uploadId);
  if (!session) {
    return null;
  }
  return {
    totalChunks: session.totalChunks,
    receivedChunks: session.receivedChunks.size,
  };
}

/**
 * Cleanup old upload sessions (older than 1 hour)
 */
export async function cleanupOldSessions(): Promise<void> {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const cleanupPromises: Promise<void>[] = [];
  for (const [uploadId, session] of uploadSessions.entries()) {
    if (session.createdAt < oneHourAgo) {
      cleanupPromises.push(cleanupFailedUpload(uploadId));
    }
  }
  await Promise.all(cleanupPromises);
}

// Run cleanup every 30 minutes
setInterval(() => {
  cleanupOldSessions().catch((err) => {
    console.error("Error cleaning up old upload sessions:", err);
  });
}, 30 * 60 * 1000);

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

  const spaceAllowed = user.xenbox?.spaceAllowed || 0;
  
  // Calculate current space used by querying XenBoxMedia directly
  // Note: location check is redundant since we're querying XenBoxMedia collection
  const files = await XenBoxMedia.find({ uploadedBy: userId }).exec();
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
