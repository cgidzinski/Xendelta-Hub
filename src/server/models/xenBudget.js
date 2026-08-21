var mongoose = require("mongoose");
var Schema = mongoose.Schema;

// XenBudget stores its line items in a SEPARATE top-level collection rather than
// embedding them in the book (the way XenSplit embeds expenses in a group). A book fed
// by CSV imports accumulates thousands of rows per year, which would run into Mongo's
// 16MB document ceiling and would force every monthly rollup to happen client-side.
// A flat collection lets /summary do the work in one aggregation pipeline instead.

// --- Book sub-schemas -------------------------------------------------------

// The tag registry. Items store tag NAMES (see itemSchema.tags), not ids, so a CSV
// import can name a tag without a lookup; this collection only supplies the color.
var tagSchema = new Schema({
  name: { type: String, required: true, maxlength: 50 },
  color: { type: String, maxlength: 32 },
}, { _id: true });

var budgetSchema = new Schema({
  scope: { type: String, enum: ["all", "tag", "person"], required: true },
  tag: { type: String, maxlength: 50 },   // scope === "tag"
  person_id: { type: String },            // scope === "person"
  period: {
    type: String,
    enum: ["weekly", "monthly", "quarterly", "yearly", "custom"],
    required: true,
  },
  amount: { type: Number, required: true },
  // Anchor for recurring periods (which day of the month/week the period rolls over on).
  // Required for "custom", where it pairs with end_date to form a fixed window.
  start_date: { type: Date },
  end_date: { type: Date },
  active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now },
}, { _id: true });

var ruleConditionSchema = new Schema({
  field: {
    type: String,
    enum: ["description", "amount", "tags", "type", "date", "source"],
    required: true,
  },
  op: {
    type: String,
    enum: [
      "contains", "not_contains", "equals", "starts_with", "ends_with", "regex",
      "gt", "gte", "lt", "lte", "between", "is_empty",
    ],
    required: true,
  },
  value: { type: String, maxlength: 500 },
  value2: { type: String, maxlength: 500 },  // "between" only
  case_sensitive: { type: Boolean, default: false },
}, { _id: false });

var ruleActionsSchema = new Schema({
  add_tags: { type: [String], default: [] },
  remove_tags: { type: [String], default: [] },
  set_type: { type: String, enum: ["expense", "income", null], default: null },
  set_people: { type: [String], default: [] },
  set_description: { type: String, maxlength: 500 },
  flag: { type: Boolean, default: false },
  flag_reason: { type: String, maxlength: 200 },
  // keep    - store normally
  // exclude - store, but with excluded:true so it never reaches a total (reversible)
  // skip    - never store at all; only reachable via import, and always reported
  disposition: { type: String, enum: ["keep", "exclude", "skip"], default: "keep" },
}, { _id: false });

var ruleSchema = new Schema({
  name: { type: String, required: true, maxlength: 100 },
  enabled: { type: Boolean, default: true },
  priority: { type: Number, default: 0 },  // evaluated ascending
  match: {
    mode: { type: String, enum: ["all", "any"], default: "all" },
    conditions: { type: [ruleConditionSchema], default: [] },
  },
  actions: { type: ruleActionsSchema, default: () => ({}) },
  stop_on_match: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
}, { _id: true });

// A remembered column mapping for one CSV source ("Chase Visa"), so a repeat import
// is one click instead of re-mapping every header.
var importPresetSchema = new Schema({
  name: { type: String, required: true, maxlength: 100 },
  column_map: {
    date: { type: String },
    description: { type: String },
    amount: { type: String },   // amount_mode === "signed"
    debit: { type: String },    // amount_mode === "debit_credit"
    credit: { type: String },
    tags: { type: String },
    people: { type: String },
  },
  amount_mode: { type: String, enum: ["signed", "debit_credit"], default: "signed" },
  sign_convention: {
    type: String,
    enum: ["negative_is_expense", "positive_is_expense"],
    default: "negative_is_expense",
  },
  date_format: { type: String, default: "auto" },  // date-fns pattern, or "auto"
  skip_rows: { type: Number, default: 0 },
  default_tags: { type: [String], default: [] },
  created_at: { type: Date, default: Date.now },
}, { _id: true });

// --- Book -------------------------------------------------------------------

var bookSchema = new Schema({
  name: { type: String, required: true, maxlength: 100 },
  // No timezone here: month and week boundaries follow whoever is *looking*, resolved
  // from their own profile (or their browser) and sent with each request. See
  // requestTimezone() in routes/xenbudget.ts.
  default_currency: { type: String, default: "CAD" },
  // The owner / main admin: the only one who may add or remove members, transfer the
  // book, delete it, or restore over it. Every other member can do everything else.
  created_by: { type: String, required: true },
  members: [{ type: Schema.Types.ObjectId, ref: "User" }],
  tags: [tagSchema],
  budgets: [budgetSchema],
  rules: [ruleSchema],
  import_presets: [importPresetSchema],
  archived: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
});

// The books-list query is find({ members: userId }); XenSplit's equivalent is an
// unindexed collection scan, which is worth not repeating.
bookSchema.index({ members: 1 });

// --- Item -------------------------------------------------------------------

// Resolved per-person amounts, not just a person list - this is what makes per-person
// budgets reconcile with the book total. Populated by resolveSplits().
var shareSchema = new Schema({
  user_id: { type: String, required: true },
  amount: { type: Number },
  percentage: { type: Number },
}, { _id: false });

var itemSchema = new Schema({
  book_id: { type: Schema.Types.ObjectId, ref: "XenBudgetBook", required: true },
  type: { type: String, enum: ["expense", "income"], default: "expense" },
  // Always positive; `type` carries the sign.
  amount: { type: Number, required: true },
  currency: { type: String, default: "CAD" },
  date: { type: Date, default: Date.now },
  description: { type: String, required: true, maxlength: 500 },
  // Pre-rule text, kept so a rule's set_description rewrite stays auditable.
  original_description: { type: String, maxlength: 500 },
  notes: { type: String, maxlength: 1000 },
  tags: { type: [String], default: [] },
  share_type: { type: String, enum: ["equal", "exact", "percent"], default: "equal" },
  shares: [shareSchema],

  // --- rules engine output ---
  excluded: { type: Boolean, default: false },
  excluded_reason: { type: String, maxlength: 200 },
  flagged: { type: Boolean, default: false },
  flag_reason: { type: String, maxlength: 200 },
  // Which rules touched this item, for provenance in the UI.
  applied_rule_ids: [{ type: Schema.Types.ObjectId }],
  // Exactly the tags rules contributed. Re-apply removes these before re-evaluating,
  // which is what makes deleting a rule actually reverse its effects — and because it
  // records the tags themselves rather than the rules, it stays correct even once the
  // rule responsible has been deleted. Tags the user added by hand are untouched.
  rule_tags: { type: [String], default: [] },
  // Set by any user PUT. Re-apply skips these by default so a sweep never silently
  // overwrites a hand correction.
  manually_edited: { type: Boolean, default: false },

  source: { type: String, enum: ["manual", "csv", "restore"], default: "manual" },
  import_batch_id: { type: Schema.Types.ObjectId },  // groups one import, for undo
  import_hash: { type: String },                      // duplicate detection
  created_by: { type: String },
  created_at: { type: Date, default: Date.now },
});

itemSchema.index({ book_id: 1, date: -1 });
itemSchema.index({ book_id: 1, tags: 1 });
itemSchema.index({ book_id: 1, import_hash: 1 });
itemSchema.index({ book_id: 1, flagged: 1 });
itemSchema.index({ book_id: 1, import_batch_id: 1 });

var XenBudgetBook = mongoose.model("XenBudgetBook", bookSchema);
var XenBudgetItem = mongoose.model("XenBudgetItem", itemSchema);

module.exports = { XenBudgetBook, XenBudgetItem };
