import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { FEEDBACK_STATUSES } from "@shared/feedback";

// Feedback from people using the hub, read by admins (Admin → Feedback). One row per message.
const feedbackSchema = new Schema({
  user_id: { type: String, required: true, index: true },
  // A snapshot, so the inbox still reads correctly after the person renames or leaves.
  username: { type: String, required: true },
  message: { type: String, required: true },
  status: { type: String, enum: FEEDBACK_STATUSES, default: "new" },
  createdAt: { type: Date, default: Date.now },
});

feedbackSchema.index({ status: 1, createdAt: -1 });
feedbackSchema.index({ createdAt: -1 });

export type FeedbackAttrs = InferSchemaType<typeof feedbackSchema>;
export const Feedback = mongoose.model("Feedback", feedbackSchema);
