import mongoose, { Schema, type HydratedDocument, type InferSchemaType, type Model } from "mongoose";
import { randomToken } from "../utils/tokens";
import { deleteFromGCS } from "../utils/gcsUtils";
import { removeThumbnails } from "../utils/xendriveThumbPaths";

// One stored file. `storage_path` is where the bytes live in the private bucket and is stored, not
// derived, so a file can be renamed or moved between folders without touching storage.
const xendriveFileSchema = new Schema({
  owner_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
  // The folder this file sits in; null is the top level ("My Drive").
  folder_id: { type: Schema.Types.ObjectId, ref: "XenDriveFolder", default: null },
  name: { type: String, required: true }, // What people see (the original file name)
  storage_path: { type: String, required: true }, // e.g. "xendrive/<user>/<generated name>"
  mimeType: { type: String, required: true },
  size: { type: Number },
  createdAt: { type: Date, default: Date.now },
  password: { type: String }, // Plain text password for the file's own link (optional)
  expiry: { type: Date }, // Expiry date for the file's own link (optional)
  shareToken: { type: String, unique: true, sparse: true }, // Unique token for the file's own link
  // The link only works while this is on. New files start private; turning it on is one switch.
  shareEnabled: { type: Boolean, default: false },
  // A small picture of an image file for the grid (utils/xendriveThumbs.ts): "ready" once it has been made and stored beside
  // the file, "failed" when it can't be (so it isn't retried on every listing). Absent = not tried yet.
  thumbnail: { type: String, enum: ["ready", "failed"] },
  // Set when an app stored the file on the person's behalf (utils/driveSources.ts). Such files have no folder and are
  // kept out of the drive's own lists; they still count toward the quota.
  source: {
    app: { type: String },
    ref: { type: String },
  },
  // Does this file count toward the owner's storage quota? Files uploaded straight to XenDrive do. Files an app stored
  // for the person are tagged but, for now, exempt (docs/storage.md). Rows that predate the flag have none and count.
  counted: { type: Boolean, default: true },
});

xendriveFileSchema.index({ owner_id: 1, folder_id: 1 });
// XenDrive > From apps: one app's files for one person, newest first.
xendriveFileSchema.index({ owner_id: 1, "source.app": 1, createdAt: -1 });

// Every file has a share token ready, so turning its link on is instant. It does nothing until shareEnabled.
xendriveFileSchema.pre("save", function (next) {
  if (!this.shareToken) this.shareToken = randomToken(16);
  next();
});

export type XenDriveFileAttrs = InferSchemaType<typeof xendriveFileSchema>;
export interface XenDriveFileMethods {
  validPassword(password: string): boolean;
  isExpired(): boolean;
}
export type XenDriveFileDocument = HydratedDocument<XenDriveFileAttrs, XenDriveFileMethods>;

xendriveFileSchema.method("validPassword", function (this: XenDriveFileDocument, password: string) {
  if (!this.password) return true; // No password set, allow access
  return this.password === password;
});

xendriveFileSchema.method("isExpired", function (this: XenDriveFileDocument) {
  if (!this.expiry) return false;
  return new Date() > this.expiry;
});

// Deleting a file through a query (findByIdAndDelete, deleteOne) also deletes its bytes.
xendriveFileSchema.pre(["findOneAndDelete", "deleteOne"], async function () {
  const doc = await this.model.findOne(this.getQuery());
  if (doc?.storage_path) {
    await deleteFromGCS(doc.storage_path, true).catch(() => {
      // Ignore errors if the object is already gone
    });
    await removeThumbnails([doc.storage_path]);
  }
});

const XenDriveFile = mongoose.model("XenDriveFile", xendriveFileSchema) as unknown as Model<
  XenDriveFileAttrs,
  object,
  XenDriveFileMethods
>;

export { XenDriveFile };
