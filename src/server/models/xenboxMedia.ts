import mongoose, { Schema, type HydratedDocument, type InferSchemaType, type Model } from "mongoose";
import { randomToken } from "../utils/tokens";
import { deleteFromGCS } from "../utils/gcsUtils";

// MEDIA SCHEMA
const xenboxMediaSchema = new Schema({
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
xenboxMediaSchema.pre("save", function (next) {
  if (!this.shareToken) {
    // 128 bits from the OS CSPRNG. Links already issued keep working; only new ones change.
    this.shareToken = randomToken(16);
  }
  next();
});

export type XenBoxMediaAttrs = InferSchemaType<typeof xenboxMediaSchema>;
export interface XenBoxMediaMethods {
  validPassword(password: string): boolean;
  isExpired(): boolean;
}
export type XenBoxMediaDocument = HydratedDocument<XenBoxMediaAttrs, XenBoxMediaMethods>;

// Method for password verification (plain text comparison)
xenboxMediaSchema.method("validPassword", function (this: XenBoxMediaDocument, password: string) {
  if (!this.password) return true; // No password set, allow access
  return this.password === password; // Plain text comparison
});

xenboxMediaSchema.method("isExpired", function (this: XenBoxMediaDocument) {
  if (!this.expiry) return false; // No expiry set, not expired
  return new Date() > this.expiry;
});

// Pre-delete hook: Delete from GCS when Media document is deleted
// This handles findOneAndDelete, findByIdAndDelete, deleteOne, etc.
xenboxMediaSchema.pre(["findOneAndDelete", "deleteOne"], async function () {
  const doc = await this.model.findOne(this.getQuery());
  if (doc && doc.filename && doc.uploadedBy) {
    const userId = doc.uploadedBy.toString();
    const gcsPath = `xenbox/${userId}/${doc.filename}`;
    await deleteFromGCS(gcsPath, true).catch(() => {
      // Ignore errors if file doesn't exist
    });
  }
});

const XenBoxMedia = mongoose.model("XenBoxMedia", xenboxMediaSchema) as unknown as Model<
  XenBoxMediaAttrs,
  object,
  XenBoxMediaMethods
>;

export { XenBoxMedia };
