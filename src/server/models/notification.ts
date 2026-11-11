import mongoose, { Schema, type InferSchemaType } from "mongoose";

const notificationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String },
  message: { type: String },
  time: { type: String },
  icon: { type: String },
  unread: { type: Boolean, default: true },
  link: { type: String },
});

notificationSchema.index({ userId: 1, time: -1 });

export type NotificationAttrs = InferSchemaType<typeof notificationSchema>;

export const Notification = mongoose.model("Notification", notificationSchema);
