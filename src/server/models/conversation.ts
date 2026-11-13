import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from "mongoose";
import { memberFields } from "../utils/membership";
import { COMMUNITY_PERMISSIONS } from "@shared/communities";

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

// A channel's allow/deny list for one of the community's roles (shared/communities.ts ChannelOverride).
const channelOverrideSchema = new Schema(
  {
    roleId: { type: String, required: true },
    allow: [{ type: String, enum: COMMUNITY_PERMISSIONS }],
    deny: [{ type: String, enum: COMMUNITY_PERMISSIONS }],
  },
  { _id: false },
);

const conversationSchema = new Schema(
  {
    name: { type: String }, // empty: the client shows the other members' names
    members: [chatMemberSchema],
    // A channel of a community (models/community.ts). A DM or group chat has no `communityId`. A channel has no `members`: who may
    // read and post comes from the community's roles and this channel's `overrides` (communities/policy.ts), and each person's
    // read and mute state is in models/channelState.ts.
    communityId: { type: String },
    channel: {
      position: { type: Number, default: 0 },
      category: { type: String, default: "" },
      topic: { type: String, default: "" },
    },
    overrides: [channelOverrideSchema],
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
// "The channels of this community", in order.
conversationSchema.index({ communityId: 1, "channel.position": 1 }, { sparse: true });

export type ConversationAttrs = InferSchemaType<typeof conversationSchema>;
export type ConversationDocument = HydratedDocument<ConversationAttrs>;

export const Conversation = mongoose.model("Conversation", conversationSchema);
