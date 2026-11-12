import { z } from "zod";
import { objectIdSchema } from "./core";
import { VALIDATION_LIMITS } from "../../constants";

export const notificationIdParamSchema = z.object({ notificationId: objectIdSchema });
export const userIdParamSchema = z.object({ userId: objectIdSchema });
export const inventoryItemIdParamSchema = z.object({ inventoryItemId: objectIdSchema });

export const unlinkProviderSchema = z.object({ provider: z.enum(["google", "github", "discord", "local"]) });

// Setting a first password on an OAuth-only account. Same length bounds as signup; the
// character-class rules there are about choosing a good password, not about this call's safety.
export const addPasswordSchema = z.object({
  password: z
    .string()
    .min(VALIDATION_LIMITS.PASSWORD_MIN, "Password must be at least 8 characters")
    .max(VALIDATION_LIMITS.PASSWORD_MAX, "Password too long"),
});

export const pinnedAppsSchema = z.object({
  pinnedApps: z.array(z.string().min(1).max(50)).max(50),
});

export const userSearchQuerySchema = z.object({ q: z.string().max(100).optional() });

export const blogListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});
export const blogSlugParamSchema = z.object({ slug: z.string().min(1).max(200) });
