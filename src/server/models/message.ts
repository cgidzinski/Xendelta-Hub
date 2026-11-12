import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from "mongoose";

// One chat message. Messages live in their own collection (not inside the conversation), numbered per conversation by
// `seq`, so history is paged by number and a send writes one small document.
const attachmentSchema = new Schema(
  {
    // A XenDrive file (models/xendriveFile.ts). The name, type and size are a snapshot, so the bubble still renders
    // if the file is later deleted.
    fileId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, default: 0 },
  },
  { _id: false },
);

const reactionSchema = new Schema(
  {
    emoji: { type: String, required: true },
    userIds: [{ type: String }],
  },
  { _id: false },
);

const messageSchema = new Schema({
  conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
  seq: { type: Number, required: true },
  from: { type: String, default: null }, // user id; null for system messages
  kind: { type: String, enum: ["text", "system", "call"], default: "text" },
  body: { type: String, default: "" },
  // For system messages: what happened and to whom, so the client can word it for each reader.
  system: {
    event: { type: String, enum: ["created", "added", "removed", "left", "renamed", "owner"] },
    userIds: [{ type: String }],
    name: { type: String },
  },
  attachments: [attachmentSchema],
  replyTo: { type: Number }, // the seq of the message replied to
  reactions: [reactionSchema],
  // Chosen by the sender's client, so a retried send is stored once.
  clientId: { type: String },
  createdAt: { type: Date, default: Date.now },
  editedAt: { type: Date },
  deletedAt: { type: Date },
});

messageSchema.index({ conversationId: 1, seq: -1 }, { unique: true });
messageSchema.index(
  { conversationId: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: "string" } } },
);

export type MessageAttrs = InferSchemaType<typeof messageSchema>;
export type MessageDocument = HydratedDocument<MessageAttrs>;

export const Message = mongoose.model("Message", messageSchema);
