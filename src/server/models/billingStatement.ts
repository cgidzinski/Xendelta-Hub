import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from "mongoose";
import { GEM_ACCOUNT_TYPES } from "./gemTransaction";

// A closed month's bill for one billing account (billing/settlement.ts). One per account and month. The lines keep the
// rates and margin used, so an old statement still reads right after the rates change.
const statementLineSchema = new Schema(
  {
    center: { type: String, required: true },
    label: { type: String, required: true },
    units: { type: Number, required: true },
    quantity: { type: Number, required: true },
    displayUnit: { type: String, required: true },
    rate: { type: Number, required: true }, // gems per display unit, margin included
    gems: { type: Number, required: true }, // exact, a fraction
  },
  { _id: false },
);

const billingStatementSchema = new Schema(
  {
    account: {
      type: { type: String, enum: GEM_ACCOUNT_TYPES, required: true },
      id: { type: Schema.Types.ObjectId, required: true },
    },
    month: { type: String, required: true }, // "2026-11", UTC
    lines: { type: [statementLineSchema], default: [] },
    margin: { type: Number, required: true },
    usageGems: { type: Number, required: true }, // exact
    freeTierGems: { type: Number, required: true },
    freeTierUsed: { type: Number, required: true },
    amountDue: { type: Number, required: true }, // whole gems
    paid: { type: Number, default: 0 },
    unpaid: { type: Number, default: 0 },
    // pending: written, payment not settled yet (a crash here is finished on the next run)
    // free: nothing due; paid; unpaid: the balance couldn't cover it; shadow: due, but billing isn't enforced yet
    status: { type: String, enum: ["pending", "free", "paid", "unpaid", "shadow"], default: "pending" },
    transactionId: { type: Schema.Types.ObjectId },
    notifiedAt: { type: Date },
  },
  { timestamps: true },
);

billingStatementSchema.index({ "account.type": 1, "account.id": 1, month: 1 }, { unique: true });
billingStatementSchema.index({ status: 1 });
billingStatementSchema.index({ month: 1 });

export type BillingStatementAttrs = InferSchemaType<typeof billingStatementSchema>;
export type BillingStatementDocument = HydratedDocument<BillingStatementAttrs>;
export const BillingStatement = mongoose.model("BillingStatement", billingStatementSchema);
