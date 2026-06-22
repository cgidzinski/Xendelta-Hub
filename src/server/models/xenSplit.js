var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var splitSchema = new Schema({
  user_id: { type: String, required: true },
  amount_owed: { type: Number },
  percentage: { type: Number },
}, { _id: false });

var expenseImageSchema = new Schema({
  gcs_path: { type: String, required: true },
}, { _id: true });

var expenseSchema = new Schema({
  paid_by: { type: String, required: true },
  created_by: { type: String },
  amount: { type: Number, required: true },
  currency: { type: String, default: "CAD" },
  title: { type: String, required: true, maxlength: 500 },
  notes: { type: String, maxlength: 1000 },
  date: { type: Date, default: Date.now },
  split_type: {
    type: String,
    enum: ["equal", "exact", "percent"],
    required: true
  },
  splits: [splitSchema],
  images: [expenseImageSchema],
  created_at: { type: Date, default: Date.now },
}, { _id: true });

var settlementSchema = new Schema({
  from: { type: String, required: true },
  to: { type: String, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: "CAD" },
  settled_at: { type: Date, default: Date.now },
  is_partial: { type: Boolean, default: false },
}, { _id: true });

var xenSplitSchema = new Schema({
  name: { type: String, required: true, maxlength: 100 },
  default_currency: { type: String, default: "CAD" },
  created_by: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
  members: [{ type: Schema.Types.ObjectId, ref: "User" }],
  expenses: [expenseSchema],
  settlements: [settlementSchema],
});

module.exports = mongoose.model("XenSplit", xenSplitSchema);