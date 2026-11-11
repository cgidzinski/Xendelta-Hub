import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from "mongoose";

// MESSAGE SCHEMA (within conversation/group)
const messageSchema = new Schema({
  from: { type: String }, // user ID
  message: { type: String },
  time: { type: Date, default: () => new Date() },
  parentMessageId: { type: String }, // optional - for threaded replies
});

// CONVERSATION/GROUP SCHEMA
const conversationSchema = new Schema({
  participants: [{ type: String }], // array of user IDs
  name: { type: String }, // optional group name
  createdBy: { type: String }, // user ID of the conversation creator
  updatedAt: { type: Date, default: () => new Date() },
  messages: [messageSchema], // array of messages in this conversation/group
});

// "My conversations" is find({ participants: userId }).
conversationSchema.index({ participants: 1 });

export type ConversationAttrs = InferSchemaType<typeof conversationSchema>;
export type ConversationMessage = ConversationAttrs["messages"][number];
export type ConversationDocument = HydratedDocument<ConversationAttrs>;

export const Conversation = mongoose.model("Conversation", conversationSchema);
