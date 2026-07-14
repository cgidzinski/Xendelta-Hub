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
  category: { type: String, maxlength: 50 },
  date: { type: Date, default: Date.now },
  split_type: {
    type: String,
    enum: ["equal", "exact", "percent"],
    required: true
  },
  splits: [splitSchema],
  images: [expenseImageSchema],
  on_hold: { type: Boolean, default: false },
  do_not_simplify: { type: Boolean, default: false },
  // Set on generated occurrences; points at the genesis expense _id of the series
  recurring_id: { type: Schema.Types.ObjectId },
  created_at: { type: Date, default: Date.now },
}, { _id: true });

// DEPRECATED — recurring series migrated to the ScheduledTask collection
// (see utils/xensplitRecurringHandler.ts). Kept so the one-time startup
// migration can read old embedded data; remove once all environments have
// booted past the migration. The old recurring_expenses.next_run_at Mongo
// index can be dropped manually.
var recurringExpenseSchema = new Schema({
  // Genesis expense this series clones from; null until a future-start series births it
  genesis_expense_id: { type: Schema.Types.ObjectId },
  // Snapshot of the expense body for future-start series, cleared once the genesis is born
  pending_expense: { type: Object },
  frequency: {
    type: String,
    // "30s" exists for testing the scheduler; real schedules are daily or longer
    enum: ["30s", "daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"],
    required: true
  },
  start_date: { type: Date, required: true },
  end_date: { type: Date },
  max_occurrences: { type: Number },
  active: { type: Boolean, default: true },
  occurrence_count: { type: Number, default: 0 },
  // Invariant: next_run_at === advanceDate(start_date, frequency, occurrence_count)
  next_run_at: { type: Date, required: true },
  last_generated_at: { type: Date },
  created_by: { type: String },
  created_at: { type: Date, default: Date.now },
}, { _id: true });

var settlementSchema = new Schema({
  from: { type: String, required: true },
  to: { type: String, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: "CAD" },
  settled_at: { type: Date, default: Date.now },
  note: { type: String, maxlength: 500 },
}, { _id: true });

var exchangeSchema = new Schema({
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
}, { _id: true });

var xenSplitSchema = new Schema({
  name: { type: String, required: true, maxlength: 100 },
  default_currency: { type: String, default: "CAD" },
  secondary_currencies: { type: [String], default: [] },
  image_url: { type: String },
  created_by: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
  members: [{ type: Schema.Types.ObjectId, ref: "User" }],
  expenses: [expenseSchema],
  settlements: [settlementSchema],
  exchanges: [exchangeSchema],
  recurring_expenses: [recurringExpenseSchema], // DEPRECATED — see note above
});

module.exports = mongoose.model("XenSplit", xenSplitSchema);