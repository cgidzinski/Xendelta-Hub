import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from "mongoose";
import { memberFields } from "../utils/membership";

// A conversation: everything is one, and a conversation with two members is what people call a DM. The messages are
// not stored here (see models/message.ts), so a send never rewrites this document and history can be paged.
//
// Members follow the standard shape (utils/membership.ts) with two roles: one owner and any number of members.
const chatMemberSchema = new Schema(
  {
    user_id: memberFields.user_id,
    role: { type: String, enum: ["owner", "member"], default: "member" },
    joinedAt: { type: Date, default: Date.now },
    // The highest message number this person has read. Their unread count is `seq - lastReadSeq`.
    lastReadSeq: { type: Number, default: 0 },
    mutedUntil: { type: Date },
    // Hidden from this person's list until a new message arrives.
    hiddenAt: { type: Date },
  },
  { _id: false },
);

const conversationSchema = new Schema(
  {
    name: { type: String }, // empty: the client shows the other members' names
    members: [chatMemberSchema],
    // The member ids sorted and joined (shared/chat.ts rosterKeyOf). Finds "the chat with exactly these people".
    rosterKey: { type: String, required: true },
    // The number of the newest message; each send takes the next one with $inc.
    seq: { type: Number, default: 0 },
    lastMessage: {
      seq: { type: Number },
      from: { type: String },
      preview: { type: String },
      at: { type: Date },
    },
  },
  { timestamps: true },
);

// "My conversations", newest activity first.
conversationSchema.index({ "members.user_id": 1, "lastMessage.at": -1 });
conversationSchema.index({ rosterKey: 1 });

export type ConversationAttrs = InferSchemaType<typeof conversationSchema>;
export type ConversationDocument = HydratedDocument<ConversationAttrs>;

export const Conversation = mongoose.model("Conversation", conversationSchema);
