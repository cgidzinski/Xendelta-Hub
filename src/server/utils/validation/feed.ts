import { z } from "zod";
import { objectIdSchema } from "./core";

export const feedQuerySchema = z.object({
  cursor: z.string().max(100).optional(),
  app: z.string().min(1).max(50).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const hideActivitySchema = z.object({ ids: z.array(objectIdSchema).min(1).max(100) });

export const feedPrefsSchema = z.object({
  mutedApps: z.array(z.string().min(1).max(50)).max(30),
  mutedSpaces: z.array(z.string().min(1).max(100)).max(200),
});
