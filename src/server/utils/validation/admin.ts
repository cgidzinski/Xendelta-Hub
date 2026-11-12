import { z } from "zod";
import { objectIdSchema } from "./core";

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
