import mongoose, { Schema, type InferSchemaType } from "mongoose";

// A folder in a person's drive. Folders nest through `parent_id` (null = top level). A folder can
// have a public link: whoever holds it can browse that folder and everything inside it.
const xendriveFolderSchema = new Schema({
  owner_id: { type: Schema.Types.ObjectId, ref: "User", required: true },
  parent_id: { type: Schema.Types.ObjectId, ref: "XenDriveFolder", default: null },
  name: { type: String, required: true, maxlength: 100 },
  share: {
    enabled: { type: Boolean, default: false },
    token: { type: String, default: undefined },
    // Optional extras on the link: a password (bcrypt hash, never sent out), when it stops working, and a tally of
    // downloads made through it.
    passwordHash: { type: String, default: undefined },
    expiry: { type: Date, default: undefined },
    downloads: { type: Number, default: 0 },
    lastDownloadedAt: { type: Date, default: undefined },
  },
  created_at: { type: Date, default: Date.now },
});

xendriveFolderSchema.index({ owner_id: 1, parent_id: 1 });
xendriveFolderSchema.index({ "share.token": 1 }, { unique: true, sparse: true });

export type XenDriveFolderAttrs = InferSchemaType<typeof xendriveFolderSchema>;
export const XenDriveFolder = mongoose.model("XenDriveFolder", xendriveFolderSchema);
