import mongoose, { Schema, type HydratedDocument, type InferSchemaType, type Model } from "mongoose";
import { randomToken } from "../utils/tokens";
import { deleteFromGCS } from "../utils/gcsUtils";

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
});

xendriveFileSchema.index({ owner_id: 1, folder_id: 1 });

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
  }
});

const XenDriveFile = mongoose.model("XenDriveFile", xendriveFileSchema) as unknown as Model<
  XenDriveFileAttrs,
  object,
  XenDriveFileMethods
>;

export { XenDriveFile };
