import mongoose, { Schema, type HydratedDocument, type InferSchemaType, type Model } from "mongoose";
import { randomToken } from "../utils/tokens";
import { deleteFromStorage } from "../utils/storageUtils";
import { checkSharePassword } from "../utils/sharePasswords";
import { FileRecord } from "./fileRecord";
import { softDeleteFields, softDeletePlugin } from "../utils/softDelete";

// A file in XenDrive: what XenDrive shows (owner, folder, name) and the file's own link. The stored file itself is the
// FileRecord it points at, so a file can be renamed or moved between folders without touching storage.
const xendriveFileSchema = new Schema({
  owner_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
  // The folder this file sits in; null is the top level ("My Drive").
  folder_id: { type: Schema.Types.ObjectId, ref: "XenDriveFolder", default: null },
  name: { type: String, required: true }, // What people see (the original file name)
  // The FileRecord behind the file (models/fileRecord.ts), with the same id as this item: where the bytes live, how big
  // and what type it is, its thumbnail and who pays. Only this item points at the record, never the other way.
  file: { type: Schema.Types.ObjectId, ref: "FileRecord", index: true },
  createdAt: { type: Date, default: Date.now },
  // The password for the file's own link (optional), as a bcrypt hash. `password` is the old plain-text field, emptied
  // by migrations/1794900000000-xendrive-password-hash.ts; nothing writes it any more and it is never sent out.
  passwordHash: { type: String },
  password: { type: String },
  expiry: { type: Date }, // Expiry date for the file's own link (optional)
  shareToken: { type: String, unique: true, sparse: true }, // Unique token for the file's own link
  // The link only works while this is on. New files start private; turning it on is one switch.
  shareEnabled: { type: Boolean, default: false },
  // Public downloads through the file's own link or through a shared folder's.
  downloads: { type: Number, default: 0 },
  lastDownloadedAt: { type: Date },
  ...softDeleteFields,
});

xendriveFileSchema.index({ owner_id: 1, folder_id: 1 });
// Deleting a file moves it to the Trash for 30 days (utils/softDelete.ts); its stored bytes stay (and count toward storage).
xendriveFileSchema.plugin(softDeletePlugin);

// Every file has a share token ready, so turning its link on is instant. It does nothing until shareEnabled.
xendriveFileSchema.pre("save", function (next) {
  if (!this.shareToken) this.shareToken = randomToken(16);
  next();
});

export type XenDriveFileAttrs = InferSchemaType<typeof xendriveFileSchema>;
export interface XenDriveFileMethods {
  hasPassword(): boolean;
  checkPassword(password: string): Promise<boolean>;
  isExpired(): boolean;
}
export type XenDriveFileDocument = HydratedDocument<XenDriveFileAttrs, XenDriveFileMethods>;

xendriveFileSchema.method("hasPassword", function (this: XenDriveFileDocument) {
  return !!(this.passwordHash || this.password);
});

xendriveFileSchema.method("checkPassword", function (this: XenDriveFileDocument, attempt: string) {
  return checkSharePassword(attempt, { hash: this.passwordHash, legacyPlain: this.password });
});

xendriveFileSchema.method("isExpired", function (this: XenDriveFileDocument) {
  if (!this.expiry) return false;
  return new Date() > this.expiry;
});

// Deleting a file through a query (findByIdAndDelete, deleteOne) also deletes its record and its stored objects.
xendriveFileSchema.pre(["findOneAndDelete", "deleteOne"], async function () {
  const doc = await this.model.findOne(this.getQuery()).setOptions({ includeDeleted: true });
  if (!doc) return;
  const record = await FileRecord.findByIdAndDelete(doc.file ?? doc._id).lean();
  if (!record) return;
  const keys = [record.key, record.thumbKey, record.previewKey].filter((k): k is string => !!k);
  await Promise.allSettled(keys.map((k) => deleteFromStorage(k, true))); // an object already gone is fine
});

const XenDriveFile = mongoose.model("XenDriveFile", xendriveFileSchema) as unknown as Model<
  XenDriveFileAttrs,
  object,
  XenDriveFileMethods
>;

/** The stored file's details, read from its record, that a XenDrive item no longer holds itself. */
export interface DriveFileDetails {
  storage_path: string;
  mimeType: string;
  size: number;
  /** The thumbnail's object key, once it is made. */
  thumb: { path: string } | null;
}

/**
 * Give each item the details of its stored file (one query for all of them). The details are plain properties on the
 * document, not saved fields. An item whose record is missing gets an empty path and a generic type.
 */
export async function withRecords<T extends { _id: unknown; file?: unknown }>(
  items: T[],
): Promise<Array<T & DriveFileDetails>> {
  if (items.length === 0) return [];
  const records = await FileRecord.find(
    { _id: { $in: items.map((i) => i.file ?? i._id) } },
    "key mimeType size thumbKey",
  ).lean();
  const byId = new Map(records.map((r) => [String(r._id), r]));
  return items.map((item) => {
    const r = byId.get(String(item.file ?? item._id));
    return Object.assign(item, {
      storage_path: r?.key ?? "",
      mimeType: r?.mimeType ?? "application/octet-stream",
      size: r?.size ?? 0,
      thumb: r?.thumbKey ? { path: r.thumbKey } : null,
    });
  });
}

/** One item with its stored file's details, or null. */
export async function withRecord<T extends { _id: unknown; file?: unknown }>(
  item: T | null,
): Promise<(T & DriveFileDetails) | null> {
  return item ? (await withRecords([item]))[0] : null;
}

export { XenDriveFile };
