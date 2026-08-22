var mongoose = require("mongoose");
var Schema = mongoose.Schema;

// XenBudget stores its line items in a SEPARATE top-level collection rather than
// embedding them in the book (the way XenSplit embeds expenses in a group). A book fed
// by CSV imports accumulates thousands of rows per year, which would run into Mongo's
// 16MB document ceiling and would force every monthly rollup to happen client-side.
// A flat collection lets /summary do the work in one aggregation pipeline instead.

// --- Book sub-schemas -------------------------------------------------------

// One shape for both registries a book carries. Items reference labels by NAME rather
// than id, so a CSV import or a rule can name one that isn't registered yet without a
// lookup; the registry supplies the colour and makes renaming possible.
//
//   categories - what a purchase WAS (Groceries, Rent). Budgets and reports run on these,
//                and one purchase can split across several by weight.
//   flags      - what needs ATTENTION ("check receipt"). Unweighted: a flag applies or it
//                doesn't. These replaced the old flagged/flag_reason pair.
var labelSchema = new Schema({
  name: { type: String, required: true, maxlength: 50 },
  color: { type: String, maxlength: 32 },
  // Built-in flags the importer and the rules engine reference by name (see
  // constants/xenbudget.ts). Cannot be deleted or renamed; the colour stays editable.
  system: { type: Boolean, default: false },
}, { _id: true });

// One person's limit INSIDE a budget. It inherits the parent's categories, period and
// window, which is the whole point of nesting them: a household limit and the personal
// limits under it are always measured over the same items and the same dates, so their
// bars can be read against each other.
var subBudgetSchema = new Schema({
  person_id: { type: String, required: true },
  amount: { type: Number, required: true },
}, { _id: true });

var budgetSchema = new Schema({
  categories: { type: [String], default: [] },    // empty = every category
  // Which way the amount points. A cap is a ceiling - passing it is the failure. A goal
  // is a floor: money moved into a savings category, where reaching the amount is the
  // whole point and passing it is better still. The measurement is identical either way;
  // only the comparison and the colours differ, which is why this is one field and not a
  // second kind of budget.
  kind: { type: String, enum: ["cap", "goal"], default: "cap" },
  period: {
    type: String,
    enum: ["weekly", "monthly", "quarterly", "yearly", "custom"],
    required: true,
  },
  // The overall limit for everyone, and OPTIONAL: a budget may instead carry only
  // per-person limits (one member capped on a category nobody else is capped on). The
  // validator requires at least one of amount / sub_budgets, so a budget that limits
  // nothing at all can't be stored.
  amount: { type: Number },
  sub_budgets: { type: [subBudgetSchema], default: [] },
  // Recurring periods always start on the calendar boundary (see budgetPeriodRange), so
  // these only carry meaning for period === "custom", where they form the fixed window.
  start_date: { type: Date },
  end_date: { type: Date },
  active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now },
}, { _id: true });

var ruleConditionSchema = new Schema({
  field: {
    type: String,
    enum: ["description", "amount", "flags", "category", "type", "date", "source"],
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
  // What the purchase was. Assigned an even split, so one category means 100%.
  set_categories: { type: [String], default: [] },
  // What needs attention. This is what the old `flag` action became.
  add_flags: { type: [String], default: [] },
  remove_flags: { type: [String], default: [] },
  set_type: { type: String, enum: ["expense", "income", null], default: null },
  set_people: { type: [String], default: [] },
  set_description: { type: String, maxlength: 500 },
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
    categories: { type: String },
    people: { type: String },
  },
  amount_mode: { type: String, enum: ["signed", "debit_credit"], default: "signed" },
  sign_convention: {
    type: String,
    enum: ["negative_is_expense", "positive_is_expense"],
    default: "negative_is_expense",
  },
  date_format: { type: String, default: "auto" },  // date-fns pattern, or "auto"
  has_header: { type: Boolean, default: true },
  skip_rows: { type: Number, default: 0 },  // extra junk rows before the header/data
  default_categories: { type: [String], default: [] },
  created_at: { type: Date, default: Date.now },
}, { _id: true });

// A record of one CSV import. The _id is the import_batch_id stamped on every item it
// created, so this only gives that id a name and a date - which is the whole point: a
// bad file has to be findable and removable weeks later, not only in the wizard that
// just closed.
var importBatchSchema = new Schema({
  source_label: { type: String, maxlength: 100 },  // "Chase Visa" - which card
  filename: { type: String, maxlength: 200 },
  imported_at: { type: Date, default: Date.now },
  imported_by: { type: String },
  row_count: { type: Number, default: 0 },
  preset_id: { type: Schema.Types.ObjectId },
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
  categories: [labelSchema],
  flags: [labelSchema],
  budgets: [budgetSchema],
  rules: [ruleSchema],
  import_presets: [importPresetSchema],
  import_batches: [importBatchSchema],
  archived: { type: Boolean, default: false },
  created_at: { type: Date, default: Date.now },
});

// The books-list query is find({ members: userId }); XenSplit's equivalent is an
// unindexed collection scan, which is worth not repeating.
bookSchema.index({ members: 1 });

// --- Item -------------------------------------------------------------------

// Resolved per-person amounts, not just a person list - this is what makes per-person
// budgets reconcile with the book total. Populated by resolveShares().
var shareSchema = new Schema({
  user_id: { type: String, required: true },
  amount: { type: Number },
  percentage: { type: Number },
}, { _id: false });

// The same idea for categories: a resolved weight, not a bare name. Storing the amount is
// what lets the per-category rollup sum to the item's amount. Summing the item's full
// amount once per category - which is what the old `tags` array did - double-counts every
// item carrying more than one.
var itemCategorySchema = new Schema({
  name: { type: String, required: true, maxlength: 50 },
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

  // What the purchase was, weighted. An item with no categories is uncategorised.
  categories: [itemCategorySchema],
  category_split_type: { type: String, enum: ["equal", "exact", "percent"], default: "equal" },
  // What needs attention, by name. Replaced the old flagged/flag_reason pair.
  flags: { type: [String], default: [] },

  share_type: { type: String, enum: ["equal", "exact", "percent"], default: "equal" },
  shares: [shareSchema],

  // --- rules engine output ---
  excluded: { type: Boolean, default: false },
  excluded_reason: { type: String, maxlength: 200 },
  // Which rules touched this item, for provenance in the UI.
  applied_rule_ids: [{ type: Schema.Types.ObjectId }],
  // Exactly what rules contributed, tracked separately so a re-apply can reverse each
  // independently — deleting a categorising rule must not strip a hand-added attention
  // flag. Recording the names rather than the rules keeps this correct even once the rule
  // responsible has been deleted. Anything the user added by hand is untouched.
  rule_categories: { type: [String], default: [] },
  rule_flags: { type: [String], default: [] },
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
itemSchema.index({ book_id: 1, "categories.name": 1 });
itemSchema.index({ book_id: 1, flags: 1 });
itemSchema.index({ book_id: 1, import_hash: 1 });
itemSchema.index({ book_id: 1, import_batch_id: 1 });

var XenBudgetBook = mongoose.model("XenBudgetBook", bookSchema);
var XenBudgetItem = mongoose.model("XenBudgetItem", itemSchema);

module.exports = { XenBudgetBook, XenBudgetItem };
