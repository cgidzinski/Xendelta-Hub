import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from "mongoose";

// One person's read and mute state for one channel of a space. A DM or group chat keeps this on the conversation's
// own member entry; a channel has no member list (everyone in the space who may read it can), so it lives here.
const channelStateSchema = new Schema({
  userId: { type: String, required: true },
  conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
  // The highest message number this person has read. Their unread count is `seq - lastReadSeq`.
  lastReadSeq: { type: Number, default: 0 },
  mutedUntil: { type: Date },
});

channelStateSchema.index({ userId: 1, conversationId: 1 }, { unique: true });
// Clean-up when a channel is deleted.
channelStateSchema.index({ conversationId: 1 });

export type ChannelStateAttrs = InferSchemaType<typeof channelStateSchema>;
export type ChannelStateDocument = HydratedDocument<ChannelStateAttrs>;

export const ChannelState = mongoose.model("ChannelState", channelStateSchema);
