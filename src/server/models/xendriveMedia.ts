import mongoose, { Schema, type HydratedDocument, type InferSchemaType, type Model } from "mongoose";
import { randomToken } from "../utils/tokens";
import { deleteFromGCS } from "../utils/gcsUtils";

// MEDIA SCHEMA
const xendriveMediaSchema = new Schema({
  location: { type: String, required: true }, // Folder location (e.g., "blog", "avatar")
  filename: { type: String, required: true }, // Filename with extension (e.g., "image-1234567890.jpg")
  mimeType: { type: String, required: true }, // MIME type (e.g., "image/jpeg", "application/pdf")
  size: { type: Number }, // File size in bytes
  uploadedBy: { type: Schema.Types.ObjectId, ref: "User" }, // User who uploaded (optional)
  createdAt: { type: Date, default: Date.now },
  password: { type: String }, // Plain text password for file access (optional)
  expiry: { type: Date }, // Expiry date for file access (optional)
  shareToken: { type: String, unique: true, sparse: true }, // Unique token for sharing
});

// Pre-save hook: Generate share token if not exists
xendriveMediaSchema.pre("save", function (next) {
  if (!this.shareToken) {
    // 128 bits from the OS CSPRNG. Links already issued keep working; only new ones change.
    this.shareToken = randomToken(16);
  }
  next();
});

export type XenDriveMediaAttrs = InferSchemaType<typeof xendriveMediaSchema>;
export interface XenDriveMediaMethods {
  validPassword(password: string): boolean;
  isExpired(): boolean;
}
export type XenDriveMediaDocument = HydratedDocument<XenDriveMediaAttrs, XenDriveMediaMethods>;

// Method for password verification (plain text comparison)
xendriveMediaSchema.method("validPassword", function (this: XenDriveMediaDocument, password: string) {
  if (!this.password) return true; // No password set, allow access
  return this.password === password; // Plain text comparison
});

xendriveMediaSchema.method("isExpired", function (this: XenDriveMediaDocument) {
  if (!this.expiry) return false; // No expiry set, not expired
  return new Date() > this.expiry;
});

// Pre-delete hook: Delete from GCS when Media document is deleted
// This handles findOneAndDelete, findByIdAndDelete, deleteOne, etc.
xendriveMediaSchema.pre(["findOneAndDelete", "deleteOne"], async function () {
  const doc = await this.model.findOne(this.getQuery());
  if (doc && doc.filename && doc.uploadedBy) {
    const userId = doc.uploadedBy.toString();
    const gcsPath = `xendrive/${userId}/${doc.filename}`;
    await deleteFromGCS(gcsPath, true).catch(() => {
      // Ignore errors if file doesn't exist
    });
  }
});

const XenDriveMedia = mongoose.model("XenDriveMedia", xendriveMediaSchema) as unknown as Model<
  XenDriveMediaAttrs,
  object,
  XenDriveMediaMethods
>;

export { XenDriveMedia };
