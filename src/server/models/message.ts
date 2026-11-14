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

// What a page a message links to says about itself (chat/linkPreview.ts). No picture is kept: loading another site's
// image in a reader's browser would tell that site who is reading.
const embedSchema = new Schema(
  {
    url: { type: String, required: true },
    title: { type: String, default: "" },
    description: { type: String, default: "" },
    siteName: { type: String, default: "" },
  },
  { _id: false },
);

const messageSchema = new Schema({
  conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
  seq: { type: Number, required: true },
  from: { type: String, default: null }, // user id; null for system messages
  kind: { type: String, enum: ["text", "system", "call", "poll"], default: "text" },
  body: { type: String, default: "" },
  // For system messages: what happened and to whom, so the client can word it for each reader.
  system: {
    event: { type: String, enum: ["created", "added", "removed", "left", "renamed", "owner", "pinned"] },
    userIds: [{ type: String }],
    name: { type: String },
  },
  attachments: [attachmentSchema],
  // A poll (kind "poll"): the question is the body. One option holds the people who chose it.
  poll: {
    multiple: { type: Boolean },
    endsAt: { type: Date },
    closedAt: { type: Date },
    options: {
      type: [
        new Schema(
          {
            id: { type: String, required: true },
            text: { type: String, required: true },
            userIds: { type: [String], default: [] },
          },
          { _id: false },
        ),
      ],
      default: undefined,
    },
  },
  // A voice message: how long it is and its loudness bars. The audio is the message's one attachment.
  voice: {
    duration: { type: Number },
    waveform: { type: [Number], default: undefined },
  },
  // A GIF picked from the picker (shared/gif.ts): where the provider hosts it, a still frame, and its size.
  gif: {
    url: { type: String },
    stillUrl: { type: String },
    width: { type: Number },
    height: { type: Number },
    title: { type: String },
  },
  embeds: [embedSchema],
  // Who the body mentions (people who could read the chat when it was sent), and whether it pings everyone or whoever is
  // online. See chat/mentions.ts.
  mentions: [{ type: String }],
  mentionsEveryone: { type: Boolean, default: false },
  mentionsHere: { type: Boolean, default: false },
  // The sender took the previews off, so editing the message doesn't bring them back.
  embedsOff: { type: Boolean, default: false },
  replyTo: { type: Number }, // the seq of the message replied to
  reactions: [reactionSchema],
  // Chosen by the sender's client, so a retried send is stored once.
  clientId: { type: String },
  createdAt: { type: Date, default: Date.now },
  editedAt: { type: Date },
  deletedAt: { type: Date },
  // A reply in a thread: the number of the message the thread hangs off. Replies are kept out of the chat's main history.
  threadRoot: { type: Number },
  // On the message that starts a thread: how many replies it has, when and by whom the last came, and who follows it.
  thread: {
    count: { type: Number, default: 0 },
    lastAt: { type: Date },
    lastBy: { type: String },
    followers: { type: [String], default: [] },
  },
  // Pinned to the top of the chat: when, and by whom. Cleared when it is unpinned or deleted.
  pinnedAt: { type: Date },
  pinnedBy: { type: String },
});

messageSchema.index({ conversationId: 1, seq: -1 }, { unique: true });
// "The replies of this thread", oldest first, and "the threads of this chat", most recently active first.
messageSchema.index(
  { conversationId: 1, threadRoot: 1, seq: 1 },
  { partialFilterExpression: { threadRoot: { $type: "number" } } },
);
messageSchema.index(
  { conversationId: 1, "thread.lastAt": -1 },
  { partialFilterExpression: { "thread.lastAt": { $type: "date" } } },
);
// Word search (chat/search.ts). The search first narrows to the conversations the caller can read.
messageSchema.index({ body: "text" }, { name: "body_text" });
// "The pinned messages of this chat", newest pin first.
messageSchema.index({ conversationId: 1, pinnedAt: -1 }, { partialFilterExpression: { pinnedAt: { $type: "date" } } });
messageSchema.index(
  { conversationId: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: "string" } } },
);

export type MessageAttrs = InferSchemaType<typeof messageSchema>;
export type MessageDocument = HydratedDocument<MessageAttrs>;

export const Message = mongoose.model("Message", messageSchema);
