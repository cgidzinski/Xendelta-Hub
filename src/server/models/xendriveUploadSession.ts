import mongoose, { Schema, type InferSchemaType } from "mongoose";

// One in-progress chunked XenDrive upload. Kept in Mongo rather than process memory so a restart
// or deploy in the middle of a big upload does not lose it, and so more than one server process
// could serve the chunks. The scheduled cleanup removes abandoned sessions after an hour and
// deletes their partial file in storage; the TTL index is only a backstop for that job failing.
const xendriveUploadSessionSchema = new Schema({
  upload_id: { type: String, required: true, unique: true },
  user_id: { type: String, required: true },
  filename: { type: String, required: true },
  total_chunks: { type: Number, required: true },
  received_chunks: { type: [Number], default: [] },
  resumable_uri: { type: String, required: true },
  bytes_uploaded: { type: Number, default: 0 },
  created_at: { type: Date, default: Date.now },
});

xendriveUploadSessionSchema.index({ created_at: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

export type XenDriveUploadSessionAttrs = InferSchemaType<typeof xendriveUploadSessionSchema>;
export const XenDriveUploadSession = mongoose.model("XenDriveUploadSession", xendriveUploadSessionSchema);
