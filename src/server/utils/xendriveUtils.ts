/**
 * XenDrive upload utilities
 * Chunked uploads to the private GCS bucket, streamed through resumable uploads. A session is kept in
 * Mongo (models/xendriveUploadSession.ts) and belongs to the person who started it.
 */

import https from "https";
import { Types } from "mongoose";
import { privateBucket } from "../config/gcs";
import { formatFileSize } from "./fileUtils";
import { randomToken } from "./tokens";
import { XenDriveFile } from "../models/xendriveFile";
import { XenDriveFolder } from "../models/xendriveFolder";
import { User } from "../models/user";
import { XenDriveUploadSession } from "../models/xendriveUploadSession";
import { FREE_STORAGE_BYTES } from "@shared/monetization";
import { canThumbnail } from "./xendriveThumbPaths";
import { scheduleThumbnails } from "./xendriveThumbs";
import { driveSourceApp } from "./driveSources";

const gcsFileFor = (storagePath: string) => privateBucket.file(storagePath);

/** A unique, storage-safe object name for an uploaded file. Never shown to people. */
export function generateXendriveFilename(originalName: string): string {
  const ext = originalName.split(".").pop()?.toLowerCase() || "bin";
  const baseName = originalName.substring(0, originalName.lastIndexOf(".")) || "file";
  const sanitizedBase = baseName.replace(/[^a-zA-Z0-9-_]/g, "-").substring(0, 50);
  const timestamp = Date.now();
  const random = Math.round(Math.random() * 1e9);
  return `${sanitizedBase}-${timestamp}-${random}.${ext}`;
}

function detectContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "pdf") return "application/pdf";
  if (ext === "zip") return "application/zip";
  return "application/octet-stream";
}

/** Throws unless `folderId` is one of this person's folders. null means the top level. */
export async function assertOwnFolder(userId: string, folderId: string | null | undefined): Promise<void> {
  if (!folderId) return;
  const folder = await XenDriveFolder.exists({ _id: folderId, owner_id: userId });
  if (!folder) throw new Error("Folder not found");
}

/**
 * Start a chunked upload into a folder (null = top level) using a GCS resumable upload.
 * @returns the upload session id
 */
export async function initiateChunkedUpload(
  userId: string,
  name: string,
  totalChunks: number,
  folderId: string | null = null,
  source?: { app: string; ref: string },
): Promise<string> {
  await assertOwnFolder(userId, folderId);
  const uploadId = `xendrive-${Date.now()}-${randomToken(9)}`;
  const storedName = generateXendriveFilename(name);
  const gcsFile = gcsFileFor(`xendrive/${userId}/${storedName}`);

  const [resumableUri] = await gcsFile.createResumableUpload({
    metadata: {
      contentType: detectContentType(storedName),
      cacheControl: "no-cache, no-store, must-revalidate",
    },
  });

  await XenDriveUploadSession.create({
    upload_id: uploadId,
    user_id: userId,
    filename: storedName,
    name,
    folder_id: folderId,
    ...(source ? { source_app: source.app, source_ref: source.ref } : {}),
    total_chunks: totalChunks,
    resumable_uri: resumableUri,
  });
  return uploadId;
}

/** The caller's own session, or null. Another person's session is indistinguishable from a missing one. */
async function ownSession(uploadId: string, userId: string) {
  return XenDriveUploadSession.findOne({ upload_id: uploadId, user_id: userId });
}

/** Upload one chunk straight to GCS over the resumable-upload HTTP API. */
export async function uploadChunk(
  uploadId: string,
  userId: string,
  chunkIndex: number,
  chunkData: Buffer,
): Promise<void> {
  const session = await ownSession(uploadId, userId);
  if (!session) {
    throw new Error(`Upload session not found: ${uploadId}`);
  }

  if (chunkIndex < 0 || chunkIndex >= session.total_chunks) {
    throw new Error(`Invalid chunk index: ${chunkIndex}`);
  }

  const startByte = session.bytes_uploaded;
  const endByte = startByte + chunkData.length - 1;
  const isLastChunk = chunkIndex === session.total_chunks - 1;

  await new Promise<void>((resolve, reject) => {
    const url = new URL(session.resumable_uri);

    // For the last chunk, include the total size; otherwise `*` for unknown total
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
      if (res.statusCode === 308 || res.statusCode === 200 || res.statusCode === 201) {
        // 308 Resume Incomplete: stored, more chunks expected. 200/201: complete.
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

  await XenDriveUploadSession.updateOne(
    { upload_id: uploadId },
    { $inc: { bytes_uploaded: chunkData.length }, $addToSet: { received_chunks: chunkIndex } },
  );
}

/** Verify every chunk arrived and create the file record. */
export async function finalizeChunkedUpload(
  uploadId: string,
  userId: string,
): Promise<{
  _id: string;
  name: string;
  folder_id: string | null;
  mimeType: string;
  size: number;
}> {
  const session = await ownSession(uploadId, userId);
  if (!session) {
    throw new Error(`Upload session not found: ${uploadId}`);
  }

  if (session.received_chunks.length !== session.total_chunks) {
    throw new Error(
      `Not all chunks received. Expected: ${session.total_chunks}, Received: ${session.received_chunks.length}`,
    );
  }

  const storagePath = `xendrive/${session.user_id}/${session.filename}`;
  const [metadata] = await gcsFileFor(storagePath).getMetadata();
  const fileSize = parseInt(String(metadata.size ?? "0"), 10);
  const contentType = metadata.contentType || detectContentType(session.filename);

  // An app's file counts only if that app says so for this ref (utils/driveSources.ts). Direct uploads always count.
  const counted = session.source_app
    ? ((await driveSourceApp(session.source_app)?.counts(session.source_ref ?? "")) ?? true)
    : true;

  const saved = await new XenDriveFile({
    owner_id: session.user_id,
    folder_id: session.folder_id || null,
    name: session.name,
    storage_path: storagePath,
    mimeType: contentType,
    size: fileSize,
    counted,
    ...(session.source_app ? { source: { app: session.source_app, ref: session.source_ref } } : {}),
  }).save();

  await XenDriveUploadSession.deleteOne({ upload_id: uploadId });
  // A picture gets its grid thumbnail made in the background; the upload doesn't wait for it.
  if (canThumbnail({ mimeType: contentType, size: fileSize })) scheduleThumbnails([saved]);

  return {
    _id: saved._id.toString(),
    name: saved.name,
    folder_id: saved.folder_id ? saved.folder_id.toString() : null,
    mimeType: contentType,
    size: fileSize,
  };
}

/** Cancel an upload: delete the partial object and the session. Only the owner's session is touched. */
export async function cleanupFailedUpload(uploadId: string, userId?: string): Promise<void> {
  const session = await XenDriveUploadSession.findOne(
    userId ? { upload_id: uploadId, user_id: userId } : { upload_id: uploadId },
  );
  if (session) {
    const gcsFile = gcsFileFor(`xendrive/${session.user_id}/${session.filename}`);
    const [exists] = await gcsFile.exists();
    if (exists) {
      await gcsFile.delete().catch(() => {
        // Ignore errors if the object doesn't exist or deletion fails
      });
    }
    await XenDriveUploadSession.deleteOne({ upload_id: uploadId });
  }
}

export async function getUploadSessionStatus(
  uploadId: string,
  userId: string,
): Promise<{ totalChunks: number; receivedChunks: number } | null> {
  const session = await XenDriveUploadSession.findOne({ upload_id: uploadId, user_id: userId }).lean();
  if (!session) {
    return null;
  }
  return {
    totalChunks: session.total_chunks,
    receivedChunks: session.received_chunks.length,
  };
}

/** Cleanup old upload sessions (older than 1 hour). Run by the scheduler. */
export async function cleanupOldSessions(): Promise<void> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const stale = await XenDriveUploadSession.find({ created_at: { $lt: oneHourAgo } }, "upload_id").lean();
  await Promise.all(stale.map((s) => cleanupFailedUpload(s.upload_id)));
}

/** Only files that count toward storage. Files an app stored for the person may be exempt (`counted: false`). */
const countedOnly = { counted: { $ne: false } } as const;

/** How much space and how many files a person's drive holds. */
export async function usageFor(userId: string): Promise<{ fileCount: number; spaceUsed: number }> {
  const [row] = await XenDriveFile.aggregate<{ _id: null; fileCount: number; spaceUsed: number }>([
    { $match: { owner_id: new Types.ObjectId(userId), ...countedOnly } },
    { $group: { _id: null, fileCount: { $sum: 1 }, spaceUsed: { $sum: { $ifNull: ["$size", 0] } } } },
  ]);
  return { fileCount: row?.fileCount ?? 0, spaceUsed: row?.spaceUsed ?? 0 };
}

/** Usage for every owner in one pass (the admin user list). */
export async function usageForAll(): Promise<Map<string, { fileCount: number; spaceUsed: number }>> {
  const rows = await XenDriveFile.aggregate<{ _id: Types.ObjectId; fileCount: number; spaceUsed: number }>([
    { $match: countedOnly },
    { $group: { _id: "$owner_id", fileCount: { $sum: 1 }, spaceUsed: { $sum: { $ifNull: ["$size", 0] } } } },
  ]);
  return new Map(rows.map((r) => [r._id.toString(), { fileCount: r.fileCount, spaceUsed: r.spaceUsed }]));
}

/** Everything a person may store: the free tier plus whatever they were granted or redeemed. */
export function totalSpaceAllowed(granted: number | null | undefined): number {
  return FREE_STORAGE_BYTES + (granted || 0);
}

/** Check whether a person has room for `fileSize` more bytes. */
export async function checkQuota(userId: string, fileSize: number): Promise<{ canUpload: boolean; message?: string }> {
  const user = await User.findById(userId).exec();
  if (!user) {
    return { canUpload: false, message: "User not found" };
  }

  const spaceAllowed = totalSpaceAllowed(user.xendrive?.spaceAllowed);
  const { spaceUsed } = await usageFor(userId);

  if (spaceUsed + fileSize > spaceAllowed) {
    const availableSpace = Math.max(0, spaceAllowed - spaceUsed);
    return {
      canUpload: false,
      message: `Quota exceeded. Available space: ${formatFileSize(availableSpace)}, File size: ${formatFileSize(fileSize)}`,
    };
  }

  return { canUpload: true };
}
