// The one place that creates and removes FileRecords (models/fileRecord.ts, docs/storage.md). Bytes and records are
// written together: the callers that store or delete an object call these next to it. A record that can't be written
// never fails the request that stored the file; the migration and `npm run db:stats` find any that were missed.

import type { Types } from "mongoose";
import { FileRecord, type FileRecordAttrs } from "../models/fileRecord";

export type Payer = { type: "user" | "community" | "house"; id?: string };

export interface FileRecordInput {
  _id?: Types.ObjectId | string;
  bucket: "private" | "public";
  key: string;
  size?: number;
  mimeType?: string;
  name?: string;
  uploadedBy?: Types.ObjectId | string | null;
  payer: Payer;
  space: { app: string; ref?: string };
  thumbKey?: string | null;
  previewKey?: string | null;
}

/** Who pays for a private file stored under a source. Today the uploader; community channels and emoji follow in #356. */
export const payerFor = (userId: string, _source?: { app: string; ref: string } | null): Payer => ({
  type: "user",
  id: String(userId),
});

/** The record for a file, created or brought up to date (one per bucket and key). */
export async function saveFileRecord(input: FileRecordInput): Promise<void> {
  const { _id, bucket, key, ...rest } = input;
  const fields: Partial<FileRecordAttrs> = {};
  if (rest.size != null) fields.size = rest.size;
  if (rest.mimeType) fields.mimeType = rest.mimeType;
  if (rest.name) fields.name = rest.name;
  if (rest.uploadedBy) fields.uploadedBy = rest.uploadedBy as Types.ObjectId;
  if (rest.thumbKey) fields.thumbKey = rest.thumbKey;
  if (rest.previewKey) fields.previewKey = rest.previewKey;
  try {
    await FileRecord.updateOne(
      { bucket, key },
      {
        $set: { ...fields, payer: rest.payer, space: rest.space },
        $setOnInsert: { ...(_id ? { _id } : {}), createdAt: new Date() },
      },
      { upsert: true },
    );
  } catch (error) {
    console.error(">>> File record not saved:", bucket, key, error);
  }
}

/** Remove records by id (a private file's record has its XenDriveFile's id). Never throws. */
export async function forgetFileRecords(ids: Array<string | { toString(): string }>): Promise<void> {
  if (ids.length === 0) return;
  await FileRecord.deleteMany({ _id: { $in: ids.map(String) } }).catch((e) =>
    console.error(">>> File records not removed:", e),
  );
}

/** Remove the records for these objects. Never throws. */
export async function forgetFileKeys(bucket: "private" | "public", keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await FileRecord.deleteMany({ bucket, key: { $in: keys } }).catch((e) =>
    console.error(">>> File records not removed:", e),
  );
}

/** Note the renditions stored beside a file. */
export async function setRenditions(
  id: string | { toString(): string },
  renditions: { thumbKey?: string | null; previewKey?: string | null },
): Promise<void> {
  const $set: Record<string, string> = {};
  if (renditions.thumbKey) $set.thumbKey = renditions.thumbKey;
  if (renditions.previewKey) $set.previewKey = renditions.previewKey;
  if (Object.keys($set).length === 0) return;
  await FileRecord.updateOne({ _id: String(id) }, { $set }).catch((e) =>
    console.error(">>> File record renditions not saved:", e),
  );
}

/** The record of a stored XenDrive file (same id), made from the file's own fields. */
export async function recordDriveFile(file: {
  _id: Types.ObjectId | string;
  owner_id: Types.ObjectId | string;
  name: string;
  storage_path: string;
  mimeType: string;
  size?: number | null;
  source?: { app?: string | null; ref?: string | null } | null;
  thumb?: { path?: string | null } | null;
}): Promise<void> {
  const source = file.source?.app ? { app: file.source.app, ref: file.source.ref ?? "" } : null;
  await saveFileRecord({
    _id: file._id,
    bucket: "private",
    key: file.storage_path,
    size: file.size ?? 0,
    mimeType: file.mimeType,
    name: file.name,
    uploadedBy: file.owner_id,
    payer: payerFor(String(file.owner_id), source),
    space: source ?? { app: "xendrive", ref: String(file.owner_id) },
    thumbKey: file.thumb?.path ?? null,
  });
}
