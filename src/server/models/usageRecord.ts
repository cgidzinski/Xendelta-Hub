import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { COST_CENTER_IDS } from "@shared/billing";
import { GEM_ACCOUNT_TYPES } from "./gemTransaction";

// How much of one cost center a billing account used in one month (billing/usage.ts). One row per account, month and
// center, upserted with `$inc`, so "so far this month" is a single small read. Units are whole numbers (bytes,
// byte-days, scans): gems are worked out from them (src/shared/billing.ts), never summed as fractions.
const usageRecordSchema = new Schema(
  {
    account: {
      type: { type: String, enum: GEM_ACCOUNT_TYPES, required: true },
      // The user or community id; absent for the house.
      id: { type: Schema.Types.ObjectId },
    },
    month: { type: String, required: true }, // "2026-11", UTC
    center: { type: String, enum: COST_CENTER_IDS, required: true },
    units: { type: Number, default: 0 },
  },
  { timestamps: true },
);

usageRecordSchema.index({ "account.type": 1, "account.id": 1, month: 1, center: 1 }, { unique: true });
// Settlement and the admin report read a whole month at once.
usageRecordSchema.index({ month: 1, center: 1 });

export type UsageRecordAttrs = InferSchemaType<typeof usageRecordSchema>;
export const UsageRecord = mongoose.model("UsageRecord", usageRecordSchema);
