import mongoose, { Schema, type InferSchemaType } from "mongoose";

const kitchenTimerSchema = new Schema({
  _id: { type: String, required: true },
  owner: { type: String, required: true, index: true },
  id: { type: String, required: true },
  label: { type: String, required: true },
  sourceKey: String,
  manualNumber: Number,
  durationSeconds: { type: Number, required: true },
  endAt: { type: Number, default: null },
  halfwayAt: { type: Number, default: null },
  halfwayRemainingMs: { type: Number, default: null },
  pausedMs: { type: Number, default: null },
  version: { type: Number, default: 0 },
  nextEventAt: { type: Number, default: null },
  dismissed: { type: Boolean, default: false },
  expiresAt: Date,
});

kitchenTimerSchema.index({ nextEventAt: 1 });
kitchenTimerSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
kitchenTimerSchema.index(
  { owner: 1, sourceKey: 1 },
  {
    unique: true,
    partialFilterExpression: { sourceKey: { $type: "string" } },
  },
);
kitchenTimerSchema.index(
  { owner: 1, manualNumber: 1 },
  {
    unique: true,
    partialFilterExpression: { manualNumber: { $type: "number" } },
  },
);

export type KitchenTimerRecord = InferSchemaType<typeof kitchenTimerSchema>;
export const XenKitchenTimer = mongoose.model("XenKitchenTimer", kitchenTimerSchema);
