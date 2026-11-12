import { z } from "zod";
import { objectIdSchema } from "./core";
import { API_KEY_APP_KEYS } from "@shared/apiKeys";

export const apiKeyIdParamSchema = z.object({ keyId: objectIdSchema });

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1, "Give the key a name").max(60),
  // Empty or omitted = every app.
  apps: z
    .array(z.string().refine((a) => API_KEY_APP_KEYS.includes(a), { message: "Unknown app" }))
    .max(API_KEY_APP_KEYS.length)
    .optional(),
  readOnly: z.boolean().optional(),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});
