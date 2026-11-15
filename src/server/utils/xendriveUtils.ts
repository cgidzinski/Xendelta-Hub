/**
 * XenDrive upload utilities
 * Chunked uploads to the private bucket as multipart uploads (one part per chunk). A session is kept in
 * Mongo (models/xendriveUploadSession.ts) and belongs to the person who started it.
 */

import { Types } from "mongoose";
import { privateStore } from "../storage";
import { formatFileSize } from "./fileUtils";
import { randomToken } from "./tokens";
import { XenDriveFile } from "../models/xendriveFile";
import { XenDriveFolder } from "../models/xendriveFolder";
import { User } from "../models/user";
import { XenDriveUploadSession } from "../models/xendriveUploadSession";
import { FREE_STORAGE_BYTES } from "@shared/monetization";
import { driveSourceApp } from "./driveSources";
import { thumbStatusFor } from "./xendriveThumbs";
import { payerFor } from "./fileRecords";
import { FileRecord } from "../models/fileRecord";

/** A unique, storage-safe object name for an uploaded file. Never shown to people. */
export function generateXendriveFilename(originalName: string): string {
  const ext = originalName.split(".").pop()?.toLowerCase() || "bin";
  const baseName = originalName.substring(0, originalName.lastIndexOf(".")) || "file";
  const sanitizedBase = baseName.replace(/[^a-zA-Z0-9-_]/g, "-").substring(0, 50);
  const timestamp = Date.now();
  const random = Math.round(Math.random() * 1e9);
  return `${sanitizedBase}-${timestamp}-${random}.${ext}`;
}

/** A source's app and ref become folder names, so only plain names are allowed (an app key, an ObjectId). */
const SAFE_SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Where a stored file lives in the private bucket (docs/storage.md), so the bucket can be audited by folder:
 *   xendrive/<userId>/<name>   uploaded straight to XenDrive
 *   <app>/<ref>/<name>         stored by an app for one of its spaces (chat/<conversationId>, xensplit/<groupId>, ...)
 */
export function storageKeyFor(
  userId: string,
  source: { app: string; ref: string } | null | undefined,
  storedName: string,
) {
  if (!source) return `xendrive/${userId}/${storedName}`;
  if (!SAFE_SEGMENT.test(source.app) || !SAFE_SEGMENT.test(source.ref)) throw new Error("Invalid upload source");
  return `${source.app}/${source.ref}/${storedName}`;
}

function detectContentType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "gif") return "image/gif";
  if (ext === "pdf") return "application/pdf";
  if (ext === "zip") return "application/zip";
  // Audio, so a recording (a chat voice message: .webm or .m4a) is stored as audio.
  const audio: Record<string, string> = {
    webm: "audio/webm",
    m4a: "audio/mp4",
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    wav: "audio/wav",
    aac: "audio/aac",
  };
  return audio[ext] ?? "application/octet-stream";
}

/** Throws unless `folderId` is one of this person's folders. null means the top level. */
export async function assertOwnFolder(userId: string, folderId: string | null | undefined): Promise<void> {
  if (!folderId) return;
  const folder = await XenDriveFolder.exists({ _id: folderId, owner_id: userId });
  if (!folder) throw new Error("Folder not found");
}

/**
 * Start a chunked upload into a folder (null = top level) as a multipart upload.
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
  const storageKey = storageKeyFor(userId, source, storedName);
  const storageUploadId = await privateStore.startMultipart(storageKey, {
    contentType: detectContentType(storedName),
    cacheControl: "no-cache, no-store, must-revalidate",
  });

  await XenDriveUploadSession.create({
    upload_id: uploadId,
    user_id: userId,
    filename: storedName,
    storage_key: storageKey,
    name,
    folder_id: folderId,
    ...(source ? { source_app: source.app, source_ref: source.ref } : {}),
    total_chunks: totalChunks,
    storage_upload_id: storageUploadId,
  });
  return uploadId;
}

/** Where a session's file is going. Sessions started before folders were per app have no key: XenDrive's folder. */
const sessionKey = (session: { storage_key?: string | null; user_id: string; filename: string }) =>
  session.storage_key || `xendrive/${session.user_id}/${session.filename}`;

/** The caller's own session, or null. Another person's session is indistinguishable from a missing one. */
async function ownSession(uploadId: string, userId: string) {
  return XenDriveUploadSession.findOne({ upload_id: uploadId, user_id: userId });
}

/** Upload one chunk as one part of the multipart upload (part numbers start at 1). */
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

  const partNumber = chunkIndex + 1;
  const etag = await privateStore.uploadPart(sessionKey(session), session.storage_upload_id, partNumber, chunkData);

  // A resent chunk replaces its earlier part, so only the newest ETag is kept and its bytes are counted once.
  const previous = session.parts.find((p) => p.partNumber === partNumber);
  await XenDriveUploadSession.updateOne(
    { upload_id: uploadId },
    {
      $inc: { bytes_uploaded: previous ? 0 : chunkData.length },
      $addToSet: { received_chunks: chunkIndex },
      $pull: { parts: { partNumber } },
    },
  );
  await XenDriveUploadSession.updateOne({ upload_id: uploadId }, { $push: { parts: { partNumber, etag } } });
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

  const storagePath = sessionKey(session);
  await privateStore.completeMultipart(
    storagePath,
    session.storage_upload_id,
    session.parts.map((p) => ({ partNumber: p.partNumber ?? 0, etag: p.etag ?? "" })),
  );
  const stored = await privateStore.head(storagePath);
  if (!stored) throw new Error("The uploaded file wasn't found in storage");
  const fileSize = stored.size;
  const contentType = stored.contentType || detectContentType(session.filename);

  // An app's file counts only if that app says so for this ref (utils/driveSources.ts). Direct uploads always count.
  const counted = session.source_app
    ? ((await driveSourceApp(session.source_app)?.counts(session.source_ref ?? "")) ?? true)
    : true;

  // An app's file (a chat attachment) is only a record. A file uploaded straight to XenDrive is a XenDrive item that
  // points at its record; both share one id.
  const source = session.source_app ? { app: session.source_app, ref: session.source_ref ?? "" } : null;
  const id = new Types.ObjectId();
  await FileRecord.create({
    _id: id,
    bucket: "private",
    key: storagePath,
    size: fileSize,
    mimeType: contentType,
    name: session.name,
    uploadedBy: session.user_id,
    payer: await payerFor(String(session.user_id), source),
    space: source ?? { app: "xendrive", ref: String(session.user_id) },
    counted,
    thumbStatus: thumbStatusFor(contentType),
  });
  if (!source) {
    await new XenDriveFile({
      _id: id,
      file: id,
      owner_id: session.user_id,
      folder_id: session.folder_id || null,
      name: session.name,
    }).save();
  }
  const saved = { _id: id, name: session.name, folder_id: source ? null : session.folder_id || null };

  await XenDriveUploadSession.deleteOne({ upload_id: uploadId });

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
    const key = sessionKey(session);
    // Abandon the multipart upload (its parts are stored, and billed, until then) and any object it already made.
    await privateStore.abortMultipart(key, session.storage_upload_id).catch(() => undefined);
    await privateStore.delete(key).catch(() => undefined);
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
const countedOnly = { bucket: "private", "payer.type": "user", counted: { $ne: false } } as const;

/** How much space and how many files a person's storage holds, from the file records they pay for. */
export async function usageFor(userId: string): Promise<{ fileCount: number; spaceUsed: number }> {
  const [row] = await FileRecord.aggregate<{ _id: null; fileCount: number; spaceUsed: number }>([
    { $match: { ...countedOnly, "payer.id": userId } },
    { $group: { _id: null, fileCount: { $sum: 1 }, spaceUsed: { $sum: { $ifNull: ["$size", 0] } } } },
  ]);
  return { fileCount: row?.fileCount ?? 0, spaceUsed: row?.spaceUsed ?? 0 };
}

/** Usage for every owner in one pass (the admin user list). */
export async function usageForAll(): Promise<Map<string, { fileCount: number; spaceUsed: number }>> {
  const rows = await FileRecord.aggregate<{ _id: string; fileCount: number; spaceUsed: number }>([
    { $match: countedOnly },
    { $group: { _id: "$payer.id", fileCount: { $sum: 1 }, spaceUsed: { $sum: { $ifNull: ["$size", 0] } } } },
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
