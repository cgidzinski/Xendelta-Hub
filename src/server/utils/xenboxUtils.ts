/**
 * Xenbox Utilities
 * Functions for handling chunked uploads to private GCS bucket
 */

import fs from "fs";
import path from "path";
import { uploadToGCS, deleteFromGCS } from "./gcsUtils";
import { XENBOX_CHUNK_SIZE } from "../constants";

// Upload session interface
interface UploadSession {
  userId: string;
  filename: string;
  totalChunks: number;
  receivedChunks: Set<number>;
  tempDir: string;
  createdAt: number;
}

// Store upload sessions in memory (consider Redis for production)
const uploadSessions = new Map<string, UploadSession>();

// Temp directory for xenbox uploads
const xenboxTempDir = path.join(process.cwd(), "temp", "xenbox");

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
 * Initiate a chunked upload session
 * @param userId - User ID
 * @param filename - Original filename
 * @param totalChunks - Total number of chunks
 * @returns Upload session ID
 */
export function initiateChunkedUpload(userId: string, filename: string, totalChunks: number): string {
  const uploadId = `xenbox-${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const sessionTempDir = path.join(xenboxTempDir, uploadId);

  // Create temp directory for this upload session
  if (!fs.existsSync(sessionTempDir)) {
    fs.mkdirSync(sessionTempDir, { recursive: true });
  }

  const session: UploadSession = {
    userId,
    filename,
    totalChunks,
    receivedChunks: new Set(),
    tempDir: sessionTempDir,
    createdAt: Date.now(),
  };

  uploadSessions.set(uploadId, session);
  return uploadId;
}

/**
 * Upload a chunk to temp storage
 * @param uploadId - Upload session ID
 * @param chunkIndex - Index of the chunk (0-based)
 * @param chunkData - Chunk data buffer
 */
export function uploadChunk(uploadId: string, chunkIndex: number, chunkData: Buffer): void {
  const session = uploadSessions.get(uploadId);
  if (!session) {
    throw new Error(`Upload session not found: ${uploadId}`);
  }

  if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
    throw new Error(`Invalid chunk index: ${chunkIndex}`);
  }

  // Save chunk to temp file
  const chunkPath = path.join(session.tempDir, `chunk-${chunkIndex}`);
  fs.writeFileSync(chunkPath, chunkData);

  // Mark chunk as received
  session.receivedChunks.add(chunkIndex);
}

/**
 * Finalize chunked upload: reassemble chunks and upload to GCS
 * @param uploadId - Upload session ID
 * @returns Object with URL, filename, mimeType, and size
 */
export async function finalizeChunkedUpload(uploadId: string): Promise<{ url: string; filename: string; mimeType: string; size: number }> {
  const session = uploadSessions.get(uploadId);
  if (!session) {
    throw new Error(`Upload session not found: ${uploadId}`);
  }

  // Check if all chunks are received
  if (session.receivedChunks.size !== session.totalChunks) {
    throw new Error(`Not all chunks received. Expected: ${session.totalChunks}, Received: ${session.receivedChunks.size}`);
  }

  // Generate final filename
  const finalFilename = generateXenboxFilename(session.filename);
  const finalFilePath = path.join(session.tempDir, finalFilename);

  // Reassemble chunks
  const writeStream = fs.createWriteStream(finalFilePath);
  for (let i = 0; i < session.totalChunks; i++) {
    const chunkPath = path.join(session.tempDir, `chunk-${i}`);
    if (!fs.existsSync(chunkPath)) {
      throw new Error(`Chunk ${i} not found`);
    }
    const chunkData = fs.readFileSync(chunkPath);
    writeStream.write(chunkData);
  }
  writeStream.end();

  // Wait for write stream to finish
  await new Promise<void>((resolve, reject) => {
    writeStream.on("finish", resolve);
    writeStream.on("error", reject);
  });

  // Read the complete file
  const fileBuffer = fs.readFileSync(finalFilePath);
  const fileSize = fileBuffer.length;

  // Detect content type from extension
  const ext = finalFilename.split(".").pop()?.toLowerCase() || "";
  let contentType = "application/octet-stream";
  if (ext === "jpg" || ext === "jpeg") {
    contentType = "image/jpeg";
  } else if (ext === "png") {
    contentType = "image/png";
  } else if (ext === "gif") {
    contentType = "image/gif";
  } else if (ext === "pdf") {
    contentType = "application/pdf";
  } else if (ext === "zip") {
    contentType = "application/zip";
  }

  // Upload to private GCS bucket
  const gcsPath = `xenbox/${session.userId}/${finalFilename}`;
  await uploadToGCS(fileBuffer, gcsPath, contentType, true); // isPrivate = true

  // Cleanup temp files
  cleanupFailedUpload(uploadId);

  // Return metadata (note: private bucket URLs require signed URLs for access)
  return {
    url: gcsPath, // Return GCS path instead of public URL (private bucket)
    filename: finalFilename,
    mimeType: contentType,
    size: fileSize,
  };
}

/**
 * Cleanup failed upload: remove temp chunks and session
 * @param uploadId - Upload session ID
 */
export function cleanupFailedUpload(uploadId: string): void {
  const session = uploadSessions.get(uploadId);
  if (session) {
    // Remove temp directory
    if (fs.existsSync(session.tempDir)) {
      fs.rmSync(session.tempDir, { recursive: true, force: true });
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
export function cleanupOldSessions(): void {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [uploadId, session] of uploadSessions.entries()) {
    if (session.createdAt < oneHourAgo) {
      cleanupFailedUpload(uploadId);
    }
  }
}

// Run cleanup every 30 minutes
setInterval(cleanupOldSessions, 30 * 60 * 1000);
