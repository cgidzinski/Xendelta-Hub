import { z } from "zod";
import { objectIdSchema } from "./core";

// Chunked uploads: initiate -> chunk* -> finalize. Chunks are base64 inside JSON, so the body
// limit for /api/xenbox/chunk is raised in server.ts; these bound what is inside it.
export const xenBoxInitiateSchema = z.object({
  filename: z.string().trim().min(1, "Filename is required").max(255, "Filename too long"),
  totalChunks: z.number().int().min(1).max(10_000),
  fileSize: z.number().int().min(1),
});

export const xenBoxChunkSchema = z.object({
  uploadId: z.string().min(1).max(200),
  // Sent as a number or a numeric string depending on the client path.
  chunkIndex: z.coerce.number().int().min(0).max(10_000),
  chunkData: z.string().min(1),
});

export const xenBoxFinalizeSchema = z.object({ uploadId: z.string().min(1).max(200) });

export const xenBoxUploadIdParamSchema = z.object({ uploadId: z.string().min(1).max(200) });
export const xenBoxFileIdParamSchema = z.object({ fileId: objectIdSchema });
// Share tokens are 22-char base64url today and `timestamp-random` base36 for older files.
export const xenBoxShareTokenParamSchema = z.object({
  shareToken: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/, "Invalid share token"),
});
export const xenBoxDownloadQuerySchema = z.object({ password: z.string().max(200).optional() });
export const xenBoxListQuerySchema = z.object({ search: z.string().max(200).optional() });

export const xenBoxSettingsSchema = z.object({
  password: z.string().max(200).nullish(),
  expiry: z.string().max(64).nullish(),
});
