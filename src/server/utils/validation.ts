import { z } from "zod";
import mongoose from "mongoose";
import { VALIDATION_LIMITS } from "../constants";

// Helper to validate MongoDB ObjectId
const objectIdSchema = z.string().refine(
  (val) => mongoose.Types.ObjectId.isValid(val),
  { message: "Invalid ObjectId format" }
);

// Rejects a timezone the runtime can't actually resolve. Every month boundary in
// /summary and /budget-status is computed from this, so an unusable value would silently
// misfile items rather than fail loudly.
const timezoneSchema = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, { message: "Unknown timezone" });

// User validation schemas
export const signupSchema = z.object({
  email: z.string().email("Invalid email format").toLowerCase().max(VALIDATION_LIMITS.EMAIL_MAX, "Email too long"),
  username: z.string()
    .min(VALIDATION_LIMITS.USERNAME_MIN, "Username must be at least 3 characters")
    .max(VALIDATION_LIMITS.USERNAME_MAX, "Username too long")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores"),
  password: z.string()
    .min(VALIDATION_LIMITS.PASSWORD_MIN, "Password must be at least 8 characters")
    .max(VALIDATION_LIMITS.PASSWORD_MAX, "Password too long")
    .regex(/(?=.*[a-z])/, "Password must contain at least one lowercase letter")
    .regex(/(?=.*[A-Z])/, "Password must contain at least one uppercase letter")
    .regex(/(?=.*\d)/, "Password must contain at least one number"),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email format").min(1, "Email is required"),
  password: z.string().min(1, "Password is required"),
});

export const updateProfileSchema = z.object({
  avatar: z.string().url("Invalid avatar URL").optional(),
  // "" clears the preference and falls back to the browser's zone.
  timezone: z.union([timezoneSchema, z.literal("")]).optional(),
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username too long")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores")
    .optional(),
  emailNotifications: z.boolean().optional(),
});

// Message validation schemas
export const sendMessageSchema = z.object({
  message: z.string()
    .min(1, "Message cannot be empty")
    .max(10000, "Message too long (max 10000 characters)"),
  parentMessageId: objectIdSchema.optional(),
});

export const createConversationSchema = z.object({
  participants: z.array(objectIdSchema)
    .min(1, "At least one participant is required")
    .max(100, "Too many participants"),
  message: z.string()
    .max(10000, "Message too long (max 10000 characters)")
    .optional(),
});

export const updateConversationNameSchema = z.object({
  name: z.string()
    .min(1, "Conversation name cannot be empty")
    .max(100, "Conversation name too long")
    .optional(),
});

export const addParticipantsSchema = z.object({
  participantIds: z.array(objectIdSchema)
    .min(1, "At least one participant is required")
    .max(100, "Too many participants"),
});

// Notification validation schemas
export const createNotificationSchema = z.object({
  title: z.string()
    .min(1, "Title cannot be empty")
    .max(200, "Title too long"),
  message: z.string()
    .min(1, "Message cannot be empty")
    .max(5000, "Message too long"),
  icon: z.enum(["person", "security", "announcement", "mail", "lock"]).optional(),
});

// Admin validation schemas
export const adminNotifyUserSchema = z.object({
  title: z.string().min(1, "Title cannot be empty").max(200, "Title too long"),
  message: z.string().min(1, "Message cannot be empty").max(5000, "Message too long"),
  link: z.string().max(500, "Link too long").optional(),
  channels: z.array(z.enum(["inapp", "socket", "email", "push"]))
    .min(1, "Select at least one channel"),
});

export const adminBroadcastMessageSchema = z.object({
  message: z.string()
    .min(1, "Message cannot be empty")
    .max(10000, "Message too long"),
  conversationTitle: z.string()
    .max(100, "Conversation title too long")
    .optional(),
});

// Validation middleware
export const validate = (schema: z.ZodSchema) => {
  return (req: any, res: any, next: any) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      // Check if it's a ZodError
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          status: false,
          message: "Validation error",
          errors: error.issues.map((err: z.ZodIssue) => ({
            path: err.path.join("."),
            message: err.message,
          })),
        });
      }

      // Log unexpected errors for debugging
      console.error("Unexpected validation error:", error);
      console.error("Error type:", error?.constructor?.name);
      console.error("Request body:", JSON.stringify(req.body, null, 2));

      return res.status(500).json({
        status: false,
        message: "Validation failed",
        error: error instanceof Error ? error.message : "Unknown error",
        details: process.env.NODE_ENV === "development" ? String(error) : undefined,
      });
    }
  };
};

// Validate params (for route parameters like :conversationId)
export const validateParams = (schema: z.ZodSchema) => {
  return (req: any, res: any, next: any) => {
    try {
      schema.parse(req.params);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          status: false,
          message: "Invalid parameter",
          errors: error.issues.map((err: z.ZodIssue) => ({
            path: err.path.join("."),
            message: err.message,
          })),
        });
      }
      return res.status(500).json({
        status: false,
        message: "Parameter validation failed",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
};

// Schema for conversationId param
export const conversationIdParamSchema = z.object({
  conversationId: objectIdSchema,
});

// Schema for messageId param
export const messageIdParamSchema = z.object({
  conversationId: objectIdSchema,
  messageId: objectIdSchema,
});

// Schema for participantId param
export const participantIdParamSchema = z.object({
  conversationId: objectIdSchema,
  participantId: objectIdSchema,
});

// Blog validation schemas
export const createBlogPostSchema = z.object({
  title: z.string()
    .min(3, "Title must be at least 3 characters")
    .max(200, "Title too long (max 200 characters)"),
  slug: z.string()
    .min(1, "Slug is required")
    .max(200, "Slug too long")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase with hyphens only"),
  markdown: z.string()
    .min(10, "Content must be at least 10 characters")
    .max(100000, "Content too long"),
  publishDate: z.string().datetime("Invalid date format"),
  assets: z.array(z.object({
    path: z.string(),
    type: z.string(),
  })).nullish(),
  featuredImage: z.string().nullish(),
  categories: z.array(z.string().max(50, "Category too long")).nullish(),
  tags: z.array(z.string().max(30, "Tag too long")).nullish(),
  featured: z.boolean().nullish(),
  published: z.boolean().nullish(),
});

export const updateBlogPostSchema = z.object({
  title: z.string()
    .min(3, "Title must be at least 3 characters")
    .max(200, "Title too long (max 200 characters)")
    .optional(),
  slug: z.string()
    .min(1, "Slug is required")
    .max(200, "Slug too long")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase with hyphens only")
    .optional(),
  markdown: z.string()
    .min(10, "Content must be at least 10 characters")
    .max(100000, "Content too long")
    .optional(),
  publishDate: z.string().datetime("Invalid date format").optional(),
  images: z.array(z.string()).nullish(),
  featuredImage: z.string().nullish(),
  categories: z.array(z.string().max(50, "Category too long")).nullish(),
  tags: z.array(z.string().max(30, "Tag too long")).nullish(),
  featured: z.boolean().nullish(),
  published: z.boolean().nullish(),
});

export const blogPostIdParamSchema = z.object({
  id: objectIdSchema,
});

export const blogPostSlugParamSchema = z.object({
  slug: z.string().min(1, "Slug is required"),
});

// XenSplit validation schemas
export const splitSchema = z.object({
  user_id: objectIdSchema,
  amount_owed: z.number().min(0).optional(),
  percentage: z.number().min(0).max(100).optional(),
});

const secondaryCurrenciesSchema = z.array(z.string().min(1).max(10)).max(20).optional();

export const createXenSplitSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  memberIds: z.array(objectIdSchema).optional(),
  default_currency: z.string().optional(),
  secondary_currencies: secondaryCurrenciesSchema,
});

export const updateXenSplitSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  default_currency: z.string().optional(),
  secondary_currencies: secondaryCurrenciesSchema,
});

export const addXenSplitMembersSchema = z.object({
  memberIds: z.array(objectIdSchema).min(1, "At least one member required"),
});

const recurringFrequencySchema = z.enum(["daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"]);

export const createExpenseSchema = z.object({
  paid_by: objectIdSchema,
  amount: z.number("Amount must be a number").positive("Amount must be positive"),
  currency: z.string().default("CAD"),
  title: z.string().min(1, "Title required").max(500),
  notes: z.string().max(1000).optional(),
  category: z.string().max(50).optional(),
  date: z.string().datetime().optional(),
  split_type: z.enum(["equal", "exact", "percent"]),
  splits: z.array(splitSchema).optional(),
  on_hold: z.boolean().optional(),
  recurring: z.object({
    frequency: recurringFrequencySchema,
    end_date: z.string().datetime().optional(),
    max_occurrences: z.number().int().min(2).optional(),
  }).optional(),
}).refine((d) => !d.recurring?.end_date || !d.date || new Date(d.recurring.end_date) > new Date(d.date), {
  message: "End date must be after the start date",
  path: ["recurring", "end_date"],
});

export const updateExpenseSchema = z.object({
  paid_by: objectIdSchema.optional(),
  amount: z.number().positive("Amount must be positive").optional(),
  currency: z.string().optional(),
  title: z.string().min(1).max(500).optional(),
  notes: z.string().max(1000).optional(),
  category: z.string().max(50).optional(),
  date: z.string().datetime().optional(),
  split_type: z.enum(["equal", "exact", "percent"]).optional(),
  splits: z.array(splitSchema).optional(),
  on_hold: z.boolean().optional(),
  recurring: z.object({
    end_date: z.string().datetime().nullable().optional(),
    max_occurrences: z.number().int().min(2).nullable().optional(),
    active: z.boolean().optional(),
    cancel: z.literal(true).optional(),
  }).optional(),
});

export const settleDebtSchema = z.object({
  from: objectIdSchema,
  to: objectIdSchema,
  amount: z.number().positive("Amount must be positive"),
  currency: z.string().default("CAD"),
  note: z.string().max(500).optional(),
}).refine((data) => data.from !== data.to, {
  message: "Cannot settle with yourself",
  path: ["to"],
});

export const xenSplitIdParamSchema = z.object({
  groupId: objectIdSchema,
});

export const xenSplitMemberParamSchema = z.object({
  groupId: objectIdSchema,
  userId: objectIdSchema,
});

export const xenSplitRecurringParamSchema = z.object({
  groupId: objectIdSchema,
  recurringId: objectIdSchema,
});

export const xenSplitExpenseParamSchema = z.object({
  groupId: objectIdSchema,
  expenseId: objectIdSchema,
});

export const xenSplitExpenseImageParamSchema = z.object({
  groupId: objectIdSchema,
  expenseId: objectIdSchema,
  imageId: objectIdSchema,
});

export const xenSplitSettlementParamSchema = z.object({
  groupId: objectIdSchema,
  settlementId: objectIdSchema,
});

export const createExchangeSchema = z.object({
  party_a: objectIdSchema,
  currency_a: z.string().min(1, "Currency A is required"),
  amount_a: z.number().positive("Amount must be positive"),
  party_b: objectIdSchema,
  currency_b: z.string().min(1, "Currency B is required"),
  rate: z.number().positive("Rate must be positive"),
  rate_from_currency: z.string().optional(),
  note: z.string().max(500).optional(),
  date: z.string().datetime().optional(),
}).refine((data) => data.party_a !== data.party_b, {
  message: "Party A and Party B must be different members",
  path: ["party_b"],
}).refine((data) => data.currency_a !== data.currency_b, {
  message: "Currency A and Currency B must be different",
  path: ["currency_b"],
}).refine((data) => !data.rate_from_currency || data.rate_from_currency === data.currency_a || data.rate_from_currency === data.currency_b, {
  message: "rate_from_currency must be currency_a or currency_b",
  path: ["rate_from_currency"],
});

export const xenSplitExchangeParamSchema = z.object({
  groupId: objectIdSchema,
  exchangeId: objectIdSchema,
});

// XenBudget validation schemas

export const xenBudgetBookIdParamSchema = z.object({
  bookId: objectIdSchema,
});

export const xenBudgetItemParamSchema = z.object({
  bookId: objectIdSchema,
  itemId: objectIdSchema,
});

export const xenBudgetItemImageParamSchema = z.object({
  bookId: objectIdSchema,
  itemId: objectIdSchema,
  imageId: objectIdSchema,
});

export const xenBudgetMemberParamSchema = z.object({
  bookId: objectIdSchema,
  userId: objectIdSchema,
});

export const createXenBudgetBookSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  memberIds: z.array(objectIdSchema).optional(),
  default_currency: z.string().max(10).optional(),
});

export const updateXenBudgetBookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  default_currency: z.string().max(10).optional(),
  archived: z.boolean().optional(),
});

export const addXenBudgetMembersSchema = z.object({
  memberIds: z.array(objectIdSchema).min(1, "At least one member required"),
});

export const transferXenBudgetBookSchema = z.object({
  userId: objectIdSchema,
});

const xenBudgetShareSchema = z.object({
  user_id: objectIdSchema,
  amount: z.number().optional(),
  percentage: z.number().optional(),
});

// Shared by create and (partially) update. Amount is always positive - `type` carries the
// sign - so a negative amount is a mapping bug rather than an income row.
const xenBudgetCategoryWeightSchema = z.object({
  name: z.string().min(1).max(50),
  amount: z.number().optional(),
  percentage: z.number().optional(),
});

const itemBodyShape = {
  type: z.enum(["expense", "income"]).optional(),
  amount: z.number("Amount must be a number").positive("Amount must be positive"),
  currency: z.string().max(10).optional(),
  date: z.string().datetime().optional(),
  description: z.string().min(1, "Description required").max(500),
  notes: z.string().max(1000).optional(),
  // What the purchase was, weighted.
  categories: z.array(xenBudgetCategoryWeightSchema).max(20, "Too many categories").optional(),
  category_split_type: z.enum(["equal", "exact", "percent"]).optional(),
  // What needs attention.
  flags: z.array(z.string().max(50)).max(20, "Too many flags").optional(),
  share_type: z.enum(["equal", "exact", "percent"]).optional(),
  shares: z.array(xenBudgetShareSchema).optional(),
  // "Don't run my auto-tagging rules on this one" — offered on manual add and CSV import.
  skip_rules: z.boolean().optional(),
};

export const createXenBudgetItemSchema = z.object(itemBodyShape);

// A restore payload. Items are validated loosely — a backup is our own format, and being
// strict about every legacy field would make an older export unrestorable, which defeats
// the point of having a backup.
export const xenBudgetRestoreSchema = z.object({
  format_version: z.number().int().min(1).max(1, "That backup was made by a newer version of XenBudget"),
  book: z.object({
    name: z.string().min(1).max(100),
    // Restored onto the new book; absent on older backups, which fall back to UTC.
    timezone: z.string().max(64).optional(),
    default_currency: z.string().max(10).optional(),
    categories: z.array(z.any()).max(500).optional(),
    flags: z.array(z.any()).max(500).optional(),
    budgets: z.array(z.any()).max(500).optional(),
    savings_goals: z.array(z.any()).max(500).optional(),
    rules: z.array(z.any()).max(500).optional(),
    import_presets: z.array(z.any()).max(200).optional(),
    members: z.array(z.object({
      user_id: z.string().optional(),
      username: z.string().optional(),
    })).max(200).optional(),
  }),
  items: z.array(z.any()).max(50000, "That backup is too large to restore in one go"),
  /**
   * merge  - add to what's already here, skipping items that already exist
   * replace - wipe this book's items first (creator only, and confirmed client-side)
   */
  mode: z.enum(["merge", "replace"]).optional(),
  /**
   * What to restore when importing into an existing book. Wins over the legacy `mode`
   * field (which is kept so old clients still work):
   * items      - add missing items only, config untouched
   * config     - budgets/categories/flags/rules/import_presets only, no items
   * everything - config + replace every item
   */
  scope: z.enum(["items", "config", "everything"]).optional(),
});

export const xenBudgetPresetParamSchema = z.object({
  bookId: objectIdSchema,
  presetId: objectIdSchema,
});

export const xenBudgetBatchParamSchema = z.object({
  bookId: objectIdSchema,
  batchId: objectIdSchema,
});

// One import request's worth of rows. Mirrors MAX_BULK_ROWS in routes/xenbudget.ts.
const MAX_IMPORT_ROWS = 2000;

// A candidate row from the CSV wizard. Looser than createXenBudgetItemSchema because the
// rules engine still gets to set type, flags and description before anything is stored.
const importRowSchema = z.object({
  type: z.enum(["expense", "income"]).optional(),
  amount: z.number().positive("Amount must be positive"),
  currency: z.string().max(10).optional(),
  date: z.string().datetime().optional(),
  description: z.string().min(1, "Description required").max(500),
  notes: z.string().max(1000).optional(),
  categories: z.array(z.string().max(50)).max(20).optional(),
  flags: z.array(z.string().max(50)).max(20).optional(),
  people: z.array(objectIdSchema).optional(),
});

export const xenBudgetBulkItemsSchema = z.object({
  items: z.array(importRowSchema).min(1, "Nothing to import").max(MAX_IMPORT_ROWS, `At most ${MAX_IMPORT_ROWS} rows at a time`),
  /**
   * Who these rows belong to. Defaults to the importing user — a card statement is
   * usually one person's, not the whole book's.
   */
  default_people: z.array(objectIdSchema).max(50).optional(),
  /** Which card this came from, and the file it came in, so it can be found later. */
  source_label: z.string().max(100).optional(),
  filename: z.string().max(200).optional(),
  preset_id: objectIdSchema.optional(),
  skip_rules: z.boolean().optional(),
});

export const xenBudgetCheckDuplicatesSchema = z.object({
  items: z.array(z.object({
    amount: z.number(),
    date: z.string().datetime().optional(),
    description: z.string().max(500),
  })).min(1).max(MAX_IMPORT_ROWS),
});

const importPresetShape = {
  name: z.string().min(1, "Name is required").max(100),
  column_map: z.object({
    date: z.string().max(200).optional(),
    description: z.string().max(200).optional(),
    amount: z.string().max(200).optional(),
    debit: z.string().max(200).optional(),
    credit: z.string().max(200).optional(),
    categories: z.string().max(200).optional(),
    memo: z.string().max(200).optional(),
    people: z.string().max(200).optional(),
  }),
  amount_mode: z.enum(["signed", "debit_credit"]).optional(),
  sign_convention: z.enum(["negative_is_expense", "positive_is_expense"]).optional(),
  date_format: z.string().max(40).optional(),
  has_header: z.boolean().optional(),
  skip_rows: z.number().int().min(0).max(100).optional(),
  default_categories: z.array(z.string().max(50)).max(20).optional(),
};

export const createXenBudgetPresetSchema = z.object(importPresetShape);
export const updateXenBudgetPresetSchema = z.object(importPresetShape);

export const xenBudgetRuleParamSchema = z.object({
  bookId: objectIdSchema,
  ruleId: objectIdSchema,
});

// Mirrors MAX_REGEX_LENGTH in utils/xenBudgetRules.ts. Validating the pattern here means
// a bad one is reported in the rule form rather than silently never matching mid-import.
const MAX_RULE_REGEX_LENGTH = 200;

const ruleConditionSchema = z.object({
  field: z.enum(["description", "amount", "flags", "category", "type", "date", "source"]),
  op: z.enum([
    "contains", "not_contains", "equals", "starts_with", "ends_with", "regex",
    "gt", "gte", "lt", "lte", "between", "is_empty",
  ]),
  value: z.string().max(500).optional(),
  value2: z.string().max(500).optional(),
  case_sensitive: z.boolean().optional(),
}).refine((c) => c.op === "is_empty" || (c.value !== undefined && c.value !== ""), {
  message: "This condition needs a value", path: ["value"],
}).refine((c) => c.op !== "between" || (c.value2 !== undefined && c.value2 !== ""), {
  message: "A between condition needs both values", path: ["value2"],
}).refine((c) => {
  if (c.op !== "regex") return true;
  if (!c.value || c.value.length > MAX_RULE_REGEX_LENGTH) return false;
  try {
    new RegExp(c.value);
    return true;
  } catch {
    return false;
  }
}, { message: `Not a valid regular expression (max ${MAX_RULE_REGEX_LENGTH} characters)`, path: ["value"] });

const ruleShape = {
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  match: z.object({
    mode: z.enum(["all", "any"]).optional(),
    // A rule with no conditions would match every item, which is destructive when it
    // skips rows. The engine refuses to match one; reject it here too.
    conditions: z.array(ruleConditionSchema).min(1, "Add at least one condition"),
  }),
  actions: z.object({
    set_categories: z.array(z.string().max(50)).max(20).optional(),
    category_split_type: z.enum(["equal", "percent"]).optional(),
    set_category_weights: z.array(z.object({
      name: z.string().max(50),
      amount: z.number().optional(),
      percentage: z.number().optional(),
    })).max(20).optional(),
    add_flags: z.array(z.string().max(50)).max(20).optional(),
    remove_flags: z.array(z.string().max(50)).max(20).optional(),
    set_type: z.enum(["expense", "income"]).nullish(),
    set_people: z.array(objectIdSchema).optional(),
    people_split_type: z.enum(["equal", "percent"]).optional(),
    set_people_weights: z.array(z.object({
      user_id: objectIdSchema,
      percentage: z.number().optional(),
    })).max(20).optional(),
    set_description: z.string().max(500).optional(),
    skip: z.boolean().optional(),
  }),
  stop_on_match: z.boolean().optional(),
};

export const createXenBudgetRuleSchema = z.object(ruleShape);
export const updateXenBudgetRuleSchema = z.object(ruleShape);

export const reapplyXenBudgetRulesSchema = z.object({
  dry_run: z.boolean().optional(),
  /**
   * Re-apply leaves hand-corrected items alone by default; a sweep silently overwriting
   * a manual fix is the surprising, destructive outcome.
   */
  include_manually_edited: z.boolean().optional(),
  /**
   * Item ids to leave alone — the review flow excludes the item being worked on, so a
   * freshly created rule applies to the rest of the queue without clobbering that item.
   */
  exclude_ids: z.array(objectIdSchema).max(200).optional(),
});

export const xenBudgetBudgetParamSchema = z.object({
  bookId: objectIdSchema,
  budgetId: objectIdSchema,
});

const subBudgetShape = z.object({
  person_id: objectIdSchema,
  amount: z.number("Amount must be a number").positive("Amount must be positive"),
});

const budgetShape = {
  categories: z.array(z.string().max(50)).max(20, "Too many categories").optional(),
  // Omitted means expenses, so every budget stored before this existed keeps its meaning.
  measures: z.enum(["expense", "income"]).optional(),
  period: z.enum(["weekly", "monthly", "quarterly", "yearly", "custom"]),
  // Optional, unlike the per-person amounts below: a budget may cap only named people.
  amount: z.number("Amount must be a number").positive("Amount must be positive").optional(),
  sub_budgets: z.array(subBudgetShape).max(20, "Too many per-person limits").optional(),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  active: z.boolean().optional(),
};

// What (categories) stays free — an empty list is the legitimate whole-book case. What is
// enforced now is that a budget limits SOMETHING (an overall amount, per-person amounts,
// or both) and that no member is listed twice, which would silently double their cap.
const budgetRefinements = (schema: z.ZodType<any>) => schema
  .refine((d: any) => d.amount != null || (d.sub_budgets && d.sub_budgets.length > 0), {
    message: "Set an overall amount, a per-person limit, or both", path: ["amount"],
  })
  .refine((d: any) => {
    const ids = (d.sub_budgets || []).map((s: any) => s.person_id);
    return new Set(ids).size === ids.length;
  }, { message: "That person already has a limit on this budget", path: ["sub_budgets"] })
  .refine((d: any) => d.period !== "custom" || (!!d.start_date && !!d.end_date), {
    message: "A custom period needs a start and an end date", path: ["end_date"],
  })
  .refine((d: any) => !d.start_date || !d.end_date || new Date(d.end_date) > new Date(d.start_date), {
    message: "End date must be after the start date", path: ["end_date"],
  });

export const createXenBudgetBudgetSchema = budgetRefinements(z.object(budgetShape));

export const updateXenBudgetBudgetSchema = budgetRefinements(z.object(budgetShape));

// --- Savings goals ---------------------------------------------------------

export const xenBudgetGoalParamSchema = z.object({
  bookId: objectIdSchema,
  goalId: objectIdSchema,
});

export const xenBudgetContributionParamSchema = z.object({
  bookId: objectIdSchema,
  goalId: objectIdSchema,
  contributionId: objectIdSchema,
});

const goalShape = {
  name: z.string().min(1, "A name is required").max(100, "Name too long"),
  description: z.string().max(500, "Description too long").optional(),
  target_amount: z.number("Target must be a number").positive("Target must be positive"),
  currency: z.string().max(10).optional(),
  // Which category a mirrored transaction is tagged with. That the name EXISTS in this
  // book is checked in the route, the way a budget's target is.
  category: z.string().max(50).optional(),
  status: z.enum(["active", "completed", "archived"]).optional(),
};

export const createXenBudgetGoalSchema = z.object(goalShape);

// Every field optional: the card edits status on its own (Mark complete, Archive) without
// resending the whole goal.
export const updateXenBudgetGoalSchema = z.object(goalShape).partial();

const contributionShape = {
  // Always positive on the wire; `direction` carries the sign, the same way an item's
  // `type` does. A signed amount posted straight through would let a "contribute" button
  // subtract by passing a minus sign.
  amount: z.number("Amount must be a number").positive("Amount must be positive"),
  direction: z.enum(["in", "out"]).optional(),
  date: z.string().datetime().optional(),
  note: z.string().max(200, "Note too long").optional(),
  /** Also write a matching book item, so the money shows up in the book's cash flow. */
  record_item: z.boolean().optional(),
};

export const createXenBudgetContributionSchema = z.object(contributionShape);
export const updateXenBudgetContributionSchema = z.object(contributionShape).partial();

// One shape for both label registries — categories and flags differ in meaning, not form.
export const xenBudgetLabelParamSchema = z.object({
  bookId: objectIdSchema,
  labelId: objectIdSchema,
});

export const createXenBudgetLabelSchema = z.object({
  name: z.string().min(1, "A name is required").max(50, "Name too long"),
  color: z.string().max(32).optional(),
  need_want: z.enum(["need", "want", "none"]).optional(),
});

export const updateXenBudgetLabelSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().max(32).optional(),
  need_want: z.enum(["need", "want", "none"]).optional(),
});

export const updateXenBudgetItemSchema = z.object({
  ...itemBodyShape,
  amount: z.number().positive("Amount must be positive").optional(),
  description: z.string().min(1).max(500).optional(),
});


// Web Push subscription schemas
export const pushSubscribeSchema = z.object({
  endpoint: z.string().url("Endpoint must be a valid URL").max(2000, "Endpoint too long"),
  keys: z.object({
    p256dh: z.string().min(1, "p256dh key is required").max(500),
    auth: z.string().min(1, "auth key is required").max(500),
  }),
});

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url("Endpoint must be a valid URL").max(2000, "Endpoint too long"),
});
