import { z } from "zod";
import { objectIdSchema } from "./core";
import { AUDIT_CATEGORIES } from "../../../shared/admin";

export const adminUserIdParamSchema = z.object({ userId: objectIdSchema });
export const adminUserItemParamSchema = z.object({ userId: objectIdSchema, itemKey: z.string().min(1).max(100) });

export const adminUpdateUserSchema = z.object({
  roles: z.array(z.string().min(1).max(32)).max(20).optional(),
  // Bytes. Absent leaves the quota alone; 0 is a legitimate "no storage".
  xendriveQuota: z.number().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
});

export const adminGrantItemSchema = z.object({ itemKey: z.string().min(1).max(100) });

export const adminBlogIdParamSchema = z.object({ id: objectIdSchema });
export const adminBlogAssetQuerySchema = z.object({
  postId: objectIdSchema,
  assetUrl: z.string().min(1).max(2048),
});

// ---- the rebuilt admin (routes/admin/*) ----
const page = z.coerce.number().int().min(1).max(100_000).optional();
const pageSize = z.coerce.number().int().min(1).max(100).optional();

export const adminUserListQuerySchema = z.object({
  q: z.string().max(100).optional(),
  filter: z.enum(["all", "admins", "near_quota", "buyers", "new"]).optional(),
  sort: z.enum(["newest", "name", "storage"]).optional(),
  page,
  pageSize,
});

// Deleting a person needs their username typed, checked here as well as in the dialog.
export const adminDeleteUserSchema = z.object({ confirm: z.string().min(1).max(100) });

// A correction or refund, never a gift: the reason is required and goes in the audit log.
export const adminGemAdjustSchema = z.object({
  amount: z
    .number()
    .int()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((n) => n !== 0, { message: "Enter an amount" }),
  reason: z.string().trim().min(3, "Give a reason").max(200),
});

export const adminAuditQuerySchema = z.object({
  category: z.enum(AUDIT_CATEGORIES).optional(),
  q: z.string().max(100).optional(),
  targetId: z.string().max(64).optional(),
  days: z.coerce.number().int().min(1).max(365).optional(),
  page,
  pageSize,
});

export const adminPurchasesQuerySchema = z.object({
  status: z.enum(["pending", "completed", "failed"]).optional(),
  page,
  pageSize,
});

export const adminStorageQuerySchema = z.object({ by: z.enum(["size", "percent"]).optional() });

const channel = z.enum(["inapp", "socket", "push", "email"]);
export const adminNotifySchema = z.object({
  audience: z.discriminatedUnion("type", [
    z.object({ type: z.literal("everyone") }),
    z.object({ type: z.literal("role"), role: z.string().min(1).max(32) }),
    z.object({ type: z.literal("users"), userIds: z.array(objectIdSchema).min(1).max(500) }),
  ]),
  title: z.string().trim().min(1, "Add a title").max(200),
  message: z.string().trim().min(1, "Write a message").max(5000),
  link: z.string().trim().max(500).optional(),
  icon: z.enum(["person", "security", "announcement", "mail", "lock"]).optional(),
  channels: z.array(channel).min(1, "Pick at least one way to send it"),
});
export const adminReachQuerySchema = z.object({
  type: z.enum(["everyone", "role"]),
  role: z.string().max(32).optional(),
});

export const adminTaskIdParamSchema = z.object({ taskId: objectIdSchema });
export const adminTaskToggleSchema = z.object({ enabled: z.boolean() });

// Wiping every chat needs the word typed.
export const adminDeleteChatsSchema = z.object({ confirm: z.literal("DELETE") });
