import mongoose, { Schema, type InferSchemaType } from "mongoose";

// One purchase of a gem pack (a Shop item priced in money). The row is created `pending` before the payment provider is
// called and moves to `completed` exactly once (see payments/fulfil.ts), so it is both the
// idempotency guard for crediting gems and the audit trail of every gem that was bought.
const gemPurchaseSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    itemId: { type: String, required: true }, // the Shop item that was bought
    gems: { type: Number, required: true },
    amountCents: { type: Number, required: true },
    currency: { type: String, required: true },
    provider: { type: String, required: true },
    providerRef: { type: String },
    status: { type: String, enum: ["pending", "completed", "failed"], default: "pending", index: true },
    completedAt: { type: Date },
  },
  { timestamps: true },
);

export type GemPurchaseAttrs = InferSchemaType<typeof gemPurchaseSchema>;
export const GemPurchase = mongoose.model("GemPurchase", gemPurchaseSchema);
