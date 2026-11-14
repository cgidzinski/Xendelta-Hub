import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from "mongoose";

// A custom emoji belongs to one community or to one group chat (exactly one of `communityId` and `conversationId`).
// The picture is in the public bucket under a name of its own, so its address never changes and can be cached for good.
const customEmojiSchema = new Schema(
  {
    communityId: { type: String },
    conversationId: { type: String },
    name: { type: String, required: true },
    url: { type: String, required: true },
    storagePath: { type: String, required: true },
    animated: { type: Boolean, default: false },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);

// A name is unique within its owner (the partial filters keep the two kinds apart).
customEmojiSchema.index(
  { communityId: 1, name: 1 },
  { unique: true, partialFilterExpression: { communityId: { $type: "string" } } },
);
customEmojiSchema.index(
  { conversationId: 1, name: 1 },
  { unique: true, partialFilterExpression: { conversationId: { $type: "string" } } },
);

export type CustomEmojiAttrs = InferSchemaType<typeof customEmojiSchema>;
export type CustomEmojiDocument = HydratedDocument<CustomEmojiAttrs>;

export const CustomEmojiModel = mongoose.model("CustomEmoji", customEmojiSchema);
