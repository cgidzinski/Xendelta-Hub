import mongoose, { Schema, type InferSchemaType } from "mongoose";

// What a provider (Cloud Storage, Cloudflare Realtime, Workers AI, Resend) actually billed for a month, entered by an
// admin from the provider's invoice. The admin billing report sets it beside what the meters say, to check the rates.
const providerCostSchema = new Schema(
  {
    month: { type: String, required: true }, // "2026-11"
    provider: { type: String, required: true },
    amountCents: { type: Number, required: true }, // US cents
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

providerCostSchema.index({ month: 1, provider: 1 }, { unique: true });

export type ProviderCostAttrs = InferSchemaType<typeof providerCostSchema>;
export const ProviderCost = mongoose.model("ProviderCost", providerCostSchema);
