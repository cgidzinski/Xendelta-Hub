import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { GEM_ACCOUNT_TYPES } from "./gemTransaction";

// A billing heads-up already sent (billing/settlement.ts), so each one goes out once per account and month.
const billingNoticeSchema = new Schema(
  {
    account: {
      type: { type: String, enum: GEM_ACCOUNT_TYPES, required: true },
      id: { type: Schema.Types.ObjectId, required: true },
    },
    month: { type: String, required: true },
    kind: { type: String, enum: ["free_tier_warning"], required: true },
  },
  { timestamps: true },
);

billingNoticeSchema.index({ "account.type": 1, "account.id": 1, month: 1, kind: 1 }, { unique: true });

export type BillingNoticeAttrs = InferSchemaType<typeof billingNoticeSchema>;
export const BillingNotice = mongoose.model("BillingNotice", billingNoticeSchema);
