import mongoose, { Schema, type InferSchemaType } from "mongoose";

// One thing that happened, for the people who should hear about it. The feed on Home reads these.
//
// Only structured data is stored (who, which verb, which thing, which space). The wording lives in the verb registry
// (shared/activity.ts), so it can change without rewriting rows. `audienceIds` is a snapshot of who could see it
// when it happened; reading it again checks the person is still in the space, so removed members lose access.
const activitySchema = new Schema({
  // null for something the system did
  actor: { type: String, default: null },
  app: { type: String, required: true },
  verb: { type: String, required: true },
  object: {
    type: { type: String, required: true },
    id: { type: String, required: true },
    label: { type: String },
  },
  space: {
    app: { type: String },
    id: { type: String },
    label: { type: String },
  },
  audienceIds: { type: [String], default: [] },
  data: { type: Schema.Types.Mixed, default: {} },
  // Events with the same key by the same person close together read as one feed entry.
  groupKey: { type: String },
  createdAt: { type: Date, default: Date.now },
});

// "My feed, newest first".
activitySchema.index({ audienceIds: 1, createdAt: -1 });
// Old events are dropped by Mongo itself.
export const ACTIVITY_TTL_SECONDS = 180 * 24 * 60 * 60;
activitySchema.index({ createdAt: 1 }, { expireAfterSeconds: ACTIVITY_TTL_SECONDS });

export type ActivityAttrs = InferSchemaType<typeof activitySchema>;

export const Activity = mongoose.model("Activity", activitySchema);
