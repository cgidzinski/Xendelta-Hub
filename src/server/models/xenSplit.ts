import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { memberSchema, rosterSync } from "../utils/membership";

const splitSchema = new Schema(
  {
    user_id: { type: String, required: true },
    amount_owed: { type: Number },
    percentage: { type: Number },
  },
  { _id: false },
);

const expenseImageSchema = new Schema(
  {
    // The photo is a XenDriveFile owned by whoever uploaded it (source `xensplit`, ref = the group id).
    file_id: { type: Schema.Types.ObjectId, ref: "XenDriveFile" },
    uploaded_by: { type: String },
    // Photos from before they became XenDrive files; the migration fills `file_id` and these go away.
    gcs_path: { type: String },
  },
  { _id: true },
);

const expenseSchema = new Schema(
  {
    paid_by: { type: String, required: true },
    created_by: { type: String },
    amount: { type: Number, required: true },
    currency: { type: String, default: "CAD" },
    title: { type: String, required: true, maxlength: 500 },
    notes: { type: String, maxlength: 1000 },
    category: { type: String, maxlength: 50 },
    date: { type: Date, default: Date.now },
    split_type: {
      type: String,
      enum: ["equal", "exact", "percent"],
      required: true,
    },
    splits: [splitSchema],
    images: [expenseImageSchema],
    on_hold: { type: Boolean, default: false },
    // Set on generated occurrences; points at the genesis expense _id of the series
    recurring_id: { type: Schema.Types.ObjectId },
    created_at: { type: Date, default: Date.now },
    // Soft deletion: records are never removed from the group, only stamped. Absent or
    // null means live. The balance engine skips stamped rows (see shared/xensplit/softDelete.ts).
    deleted_at: { type: Date, default: null },
    deleted_by: { type: String },
  },
  { _id: true },
);

const settlementSchema = new Schema(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "CAD" },
    settled_at: { type: Date, default: Date.now },
    note: { type: String, maxlength: 500 },
    // Soft deletion: records are never removed from the group, only stamped. Absent or
    // null means live. The balance engine skips stamped rows (see shared/xensplit/softDelete.ts).
    deleted_at: { type: Date, default: null },
    deleted_by: { type: String },
  },
  { _id: true },
);

const exchangeSchema = new Schema(
  {
    party_a: { type: String, required: true },
    currency_a: { type: String, required: true },
    amount_a: { type: Number, required: true },
    party_b: { type: String, required: true },
    currency_b: { type: String, required: true },
    amount_b: { type: Number, required: true },
    rate: { type: Number, required: true },
    rate_from_currency: { type: String },
    created_by: { type: String },
    note: { type: String, maxlength: 500 },
    date: { type: Date, default: Date.now },
    created_at: { type: Date, default: Date.now },
    // Soft deletion: records are never removed from the group, only stamped. Absent or
    // null means live. The balance engine skips stamped rows (see shared/xensplit/softDelete.ts).
    deleted_at: { type: Date, default: null },
    deleted_by: { type: String },
  },
  { _id: true },
);

const xenSplitSchema = new Schema({
  name: { type: String, required: true, maxlength: 100 },
  default_currency: { type: String, default: "CAD" },
  secondary_currencies: { type: [String], default: [] },
  image_url: { type: String },
  created_by: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
  members: [{ type: Schema.Types.ObjectId, ref: "User" }],
  // The standard membership shape, derived from created_by + members on every save (utils/membership.ts).
  roster: { type: [memberSchema], default: [] },
  expenses: [expenseSchema],
  settlements: [settlementSchema],
  exchanges: [exchangeSchema],
});

// Every "my groups" list is find({ members: userId }); without this it scans the collection.
xenSplitSchema.index({ members: 1 });
xenSplitSchema.index({ "roster.user_id": 1 });
rosterSync(xenSplitSchema);

export type XenSplitAttrs = InferSchemaType<typeof xenSplitSchema>;

export const XenSplit = mongoose.model("XenSplit", xenSplitSchema);
