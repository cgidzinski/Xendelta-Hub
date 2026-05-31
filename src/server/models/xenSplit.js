var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var memberSchema = new Schema({
  user_id: { type: String, required: true },
  username: { type: String, required: true },
  avatar: { type: String },
  joined_at: { type: Date, default: Date.now },
}, { _id: false });

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
  amount: { type: Number, required: true },
  currency: { type: String, default: "USD" },
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
  currency: { type: String, default: "USD" },
  settled_at: { type: Date, default: Date.now },
}, { _id: false });

var xenSplitSchema = new Schema({
  name: { type: String, required: true, maxlength: 100 },
  default_currency: { type: String, default: "USD" },
  created_by: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
  members: [memberSchema],
  expenses: [expenseSchema],
  settlements: [settlementSchema],
});

module.exports = mongoose.model("XenSplit", xenSplitSchema);