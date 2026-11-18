import mongoose, { Schema, type HydratedDocument, type InferSchemaType } from "mongoose";

// One movement of gems between two accounts: a person, a community (its fund) or the house (where bought gems come from
// and bills go to). Every gem movement in the app is one of these, applied by billing/ledger.ts, which makes each side
// happen exactly once without database transactions. docs/billing.md has the whole design.
export const GEM_ACCOUNT_TYPES = ["user", "community", "house"] as const;

export const GEM_TRANSACTION_KINDS = [
  "gem_purchase", // a gem pack was paid for
  "shop_purchase", // an item bought with gems
  "shop_refund", // a Shop purchase that failed after it was paid
  "voucher_redeem", // a held gem voucher was redeemed
  "feedback_reward", // an admin rewarded feedback
  "admin_adjustment", // an admin correction or refund
  "donation", // a member chipped in to a community's fund
  "gift", // a person gave gems to another person
  "bill", // a monthly bill paid to the house
] as const;

const accountSchema = new Schema(
  {
    type: { type: String, enum: GEM_ACCOUNT_TYPES, required: true },
    // The user or community id; absent for the house.
    id: { type: Schema.Types.ObjectId },
  },
  { _id: false },
);

const gemTransactionSchema = new Schema(
  {
    from: { type: accountSchema, required: true },
    to: { type: accountSchema, required: true },
    // Whole gems. Fractions only exist in usage and statements; what is paid is rounded up first.
    amount: { type: Number, required: true, min: 1 },
    kind: { type: String, enum: GEM_TRANSACTION_KINDS, required: true },
    status: { type: String, enum: ["pending", "applied", "failed"], default: "pending" },
    // A retry with the same key finds this row instead of moving the gems again.
    idempotencyKey: { type: String, required: true, unique: true },
    // Values pushed onto the payer's arrays in the same write as the debit (the item a purchase adds to the inventory),
    // kept here so the sweep that finishes an interrupted transfer pushes them too.
    debitPush: { type: Schema.Types.Mixed },
    failureReason: { type: String },
    appliedAt: { type: Date },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

// The sweep finds interrupted transfers; histories list an account's movements newest first.
gemTransactionSchema.index({ status: 1, createdAt: 1 });
gemTransactionSchema.index({ "from.type": 1, "from.id": 1, createdAt: -1 });
gemTransactionSchema.index({ "to.type": 1, "to.id": 1, createdAt: -1 });

export type GemTransactionAttrs = InferSchemaType<typeof gemTransactionSchema>;
export type GemTransactionDocument = HydratedDocument<GemTransactionAttrs>;
export type GemTransactionKind = (typeof GEM_TRANSACTION_KINDS)[number];

export const GemTransaction = mongoose.model("GemTransaction", gemTransactionSchema);
