import { Types } from "mongoose";
import { FileRecord } from "../models/fileRecord";
import { XenDriveFile, withRecord, type XenDriveFileDocument } from "../models/xendriveFile";

/**
 * A stored private file as the app makes it: a FileRecord, plus a XenDrive item (same id) unless an app stored it
 * (`source`). Returns the XenDrive item (the record when an app stored it, typed alike for brevity). Bytes are not stored.
 */
export async function createDriveFile(attrs: {
  owner_id: unknown;
  folder_id?: unknown;
  name: string;
  storage_path: string;
  mimeType: string;
  size?: number;
  source?: { app: string; ref: string };
  counted?: boolean;
  [extra: string]: unknown;
}): Promise<XenDriveFileDocument> {
  const { owner_id, folder_id, name, storage_path, mimeType, size, source, counted, ...extra } = attrs;
  const _id = new Types.ObjectId();
  const record = await FileRecord.create({
    _id,
    bucket: "private",
    key: storage_path,
    size: size ?? 0,
    mimeType,
    name,
    uploadedBy: owner_id,
    payer: { type: "user", id: String(owner_id) },
    space: source ?? { app: "xendrive", ref: String(owner_id) },
    counted: counted !== false,
  });
  if (source) return record as unknown as XenDriveFileDocument;
  const item = (await XenDriveFile.create({
    _id,
    file: _id,
    owner_id,
    folder_id,
    name,
    ...extra,
  })) as unknown as XenDriveFileDocument;
  // The stored file's details are read from its record; tests that read them straight off the item get them here.
  return (await withRecord(item)) as XenDriveFileDocument;
}
