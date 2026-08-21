import { z } from "zod";
import mongoose from "mongoose";
import { VALIDATION_LIMITS } from "../constants";

// Helper to validate MongoDB ObjectId
const objectIdSchema = z.string().refine(
  (val) => mongoose.Types.ObjectId.isValid(val),
  { message: "Invalid ObjectId format" }
);

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
  username: z.string()
    .min(3, "Username must be at least 3 characters")
    .max(50, "Username too long")
    .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers, and underscores")
    .optional(),
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

export const xenBudgetBookIdParamSchema = z.object({
  bookId: objectIdSchema,
});

export const xenBudgetItemParamSchema = z.object({
  bookId: objectIdSchema,
  itemId: objectIdSchema,
});

export const xenBudgetMemberParamSchema = z.object({
  bookId: objectIdSchema,
  userId: objectIdSchema,
});

export const createXenBudgetBookSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name too long"),
  memberIds: z.array(objectIdSchema).optional(),
  default_currency: z.string().max(10).optional(),
  timezone: timezoneSchema.optional(),
});

export const updateXenBudgetBookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  default_currency: z.string().max(10).optional(),
  timezone: timezoneSchema.optional(),
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
const itemBodyShape = {
  type: z.enum(["expense", "income"]).optional(),
  amount: z.number("Amount must be a number").positive("Amount must be positive"),
  currency: z.string().max(10).optional(),
  date: z.string().datetime().optional(),
  description: z.string().min(1, "Description required").max(500),
  notes: z.string().max(1000).optional(),
  tags: z.array(z.string().max(50)).max(20, "Too many tags").optional(),
  share_type: z.enum(["equal", "exact", "percent"]).optional(),
  shares: z.array(xenBudgetShareSchema).optional(),
};

export const createXenBudgetItemSchema = z.object(itemBodyShape);

export const xenBudgetBudgetParamSchema = z.object({
  bookId: objectIdSchema,
  budgetId: objectIdSchema,
});

const budgetShape = {
  scope: z.enum(["all", "tag", "person"]),
  tag: z.string().max(50).optional(),
  person_id: objectIdSchema.optional(),
  period: z.enum(["weekly", "monthly", "quarterly", "yearly", "custom"]),
  amount: z.number("Amount must be a number").positive("Amount must be positive"),
  start_date: z.string().datetime().optional(),
  end_date: z.string().datetime().optional(),
  active: z.boolean().optional(),
};

// A budget whose scope doesn't carry its target is meaningless — it would silently
// match everything — so the pairing is enforced here rather than left to the handler.
const budgetRefinements = (schema: z.ZodType<any>) => schema
  .refine((d: any) => d.scope !== "tag" || !!d.tag, {
    message: "A tag budget needs a tag", path: ["tag"],
  })
  .refine((d: any) => d.scope !== "person" || !!d.person_id, {
    message: "A person budget needs a person", path: ["person_id"],
  })
  .refine((d: any) => d.period !== "custom" || (!!d.start_date && !!d.end_date), {
    message: "A custom period needs a start and an end date", path: ["end_date"],
  })
  .refine((d: any) => !d.start_date || !d.end_date || new Date(d.end_date) > new Date(d.start_date), {
    message: "End date must be after the start date", path: ["end_date"],
  });

export const createXenBudgetBudgetSchema = budgetRefinements(z.object(budgetShape));

export const updateXenBudgetBudgetSchema = budgetRefinements(z.object(budgetShape));

export const xenBudgetTagParamSchema = z.object({
  bookId: objectIdSchema,
  tagId: objectIdSchema,
});

export const createXenBudgetTagSchema = z.object({
  name: z.string().min(1, "Tag name is required").max(50, "Tag name too long"),
  color: z.string().max(32).optional(),
});

export const updateXenBudgetTagSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  color: z.string().max(32).optional(),
});

export const updateXenBudgetItemSchema = z.object({
  ...itemBodyShape,
  amount: z.number().positive("Amount must be positive").optional(),
  description: z.string().min(1).max(500).optional(),
  excluded: z.boolean().optional(),
  flagged: z.boolean().optional(),
});

