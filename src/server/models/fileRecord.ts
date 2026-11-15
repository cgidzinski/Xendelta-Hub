import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from "mongoose";

// One row for every object we keep in a bucket: what it is, where it lives, who uploaded it and who pays to store it
// (docs/storage.md, #380). Private files reuse their XenDriveFile's `_id`, so the photos and attachments that already
// point at a XenDrive file point at the record too. Only the XenDrive item points at its record (`XenDriveFile.file`);
// the record never links back.
const fileRecordSchema = new Schema({
  bucket: { type: String, enum: ["private", "public"], required: true },
  // The object key in that bucket, e.g. "chat/<conversationId>/voice-1.webm" or "avatar/<userId>.jpg".
  key: { type: String, required: true },
  size: { type: Number, default: 0 },
  mimeType: { type: String, default: "application/octet-stream" },
  // What people see (the original file name).
  name: { type: String, default: "" },
  uploadedBy: { type: Schema.Types.ObjectId, ref: "User" },
  createdAt: { type: Date, default: Date.now },
  // Who pays to store it (the storage meter sums sizes per payer). `house` has no id.
  payer: {
    type: new Schema(
      { type: { type: String, enum: ["user", "community", "house"], required: true }, id: { type: String } },
      { _id: false },
    ),
    required: true,
  },
  // The app and space it belongs to; with the app it is also the folder (`<app>/<ref>/`).
  space: {
    type: new Schema({ app: { type: String, required: true }, ref: { type: String } }, { _id: false }),
    required: true,
  },
  // The renditions kept beside the file (object keys in the same bucket), deleted with it. `thumbWidth`/`thumbHeight`
  // say how to lay a grid out; `thumbStatus` tracks the background job (utils/xendriveThumbs.ts): pending until made,
  // ready once stored, none when the kind doesn't get one, failed when generation failed (the file shows its icon).
  thumbKey: { type: String },
  previewKey: { type: String },
  thumbWidth: { type: Number },
  thumbHeight: { type: Number },
  thumbStatus: { type: String, enum: ["pending", "ready", "none", "failed"], default: "none" },
});

fileRecordSchema.index({ bucket: 1, key: 1 }, { unique: true });
// The storage meter: every file one payer pays for.
fileRecordSchema.index({ "payer.type": 1, "payer.id": 1 });
// The storage viewer: one person's files for one app, newest first.
fileRecordSchema.index({ uploadedBy: 1, "space.app": 1, createdAt: -1 });
// The thumbnail job.
fileRecordSchema.index({ thumbStatus: 1 }, { partialFilterExpression: { thumbStatus: "pending" } });

export type FileRecordAttrs = InferSchemaType<typeof fileRecordSchema>;
export type FileRecordDocument = HydratedDocument<FileRecordAttrs>;

const FileRecord = mongoose.model("FileRecord", fileRecordSchema);

export { FileRecord };
