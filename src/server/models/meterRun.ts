import mongoose, { Schema, type InferSchemaType } from "mongoose";

// One row per metered day of a meter (billing/storageMeter.ts). The unique (meter, day) pair is the claim: whoever
// inserts it first meters that day, so a day is metered at most once even if the job runs twice or on two servers.
const meterRunSchema = new Schema(
  {
    meter: { type: String, required: true }, // e.g. "storage"
    day: { type: String, required: true }, // "2026-11-15", UTC
    accounts: { type: Number, default: 0 }, // how many accounts got usage
    units: { type: Number, default: 0 }, // total units recorded
    finishedAt: { type: Date },
  },
  { timestamps: true },
);

meterRunSchema.index({ meter: 1, day: 1 }, { unique: true });

export type MeterRunAttrs = InferSchemaType<typeof meterRunSchema>;
export const MeterRun = mongoose.model("MeterRun", meterRunSchema);
