import mongoose, { Schema, type InferSchemaType } from "mongoose";

// A personal API key (see shared/apiKeys.ts). Only the sha256 of the key is stored; the key itself is shown once
// when it is created. Revoking a key deletes the document.
const apiKeySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  name: { type: String, required: true },
  hash: { type: String, required: true, unique: true },
  preview: { type: String, required: true }, // "xd_AbC1…", enough to tell keys apart in a list
  apps: [{ type: String }], // empty = every app in API_KEY_APPS
  readOnly: { type: Boolean, default: false },
  expiresAt: { type: Date },
  lastUsedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

export type ApiKeyAttrs = InferSchemaType<typeof apiKeySchema>;

export const ApiKey = mongoose.model("ApiKey", apiKeySchema);
