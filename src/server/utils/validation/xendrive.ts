import { z } from "zod";
import { objectIdSchema } from "./core";

// Chunked uploads: initiate -> chunk* -> finalize. Chunks are base64 inside JSON, so the body
// limit for /api/xendrive/chunk is raised in server.ts; these bound what is inside it.
export const xenDriveInitiateSchema = z.object({
  filename: z.string().trim().min(1, "Filename is required").max(255, "Filename too long"),
  totalChunks: z.number().int().min(1).max(10_000),
  fileSize: z.number().int().min(1),
  // The folder to upload into; omitted or null is the top level.
  folderId: objectIdSchema.nullish(),
});

export const xenDriveChunkSchema = z.object({
  uploadId: z.string().min(1).max(200),
  // Sent as a number or a numeric string depending on the client path.
  chunkIndex: z.coerce.number().int().min(0).max(10_000),
  chunkData: z.string().min(1),
});

export const xenDriveFinalizeSchema = z.object({ uploadId: z.string().min(1).max(200) });

export const xenDriveUploadIdParamSchema = z.object({ uploadId: z.string().min(1).max(200) });
export const xenDriveFileIdParamSchema = z.object({ fileId: objectIdSchema });
export const xenDriveFolderIdParamSchema = z.object({ folderId: objectIdSchema });
// Share tokens are 22-char base64url.
const shareToken = z.string().regex(/^[A-Za-z0-9_-]{6,64}$/, "Invalid share token");
export const xenDriveShareTokenParamSchema = z.object({ shareToken });
export const xenDriveFolderTokenParamSchema = z.object({ token: shareToken });
export const xenDriveFolderTokenFileParamSchema = z.object({ token: shareToken, fileId: objectIdSchema });
export const xenDriveDownloadQuerySchema = z.object({ password: z.string().max(200).optional() });

// What is in a folder (omit `folder` for the top level), or a search across the whole drive.
export const xenDriveBrowseQuerySchema = z.object({
  folder: objectIdSchema.optional(),
  search: z.string().max(200).optional(),
});
// A public folder link: optionally a sub-folder of the shared one.
export const xenDrivePublicFolderQuerySchema = z.object({ folder: objectIdSchema.optional() });

export const xenDriveSettingsSchema = z.object({
  password: z.string().max(200).nullish(),
  expiry: z.string().max(64).nullish(),
  name: z.string().trim().min(1).max(255).optional(),
});

export const xenDriveFolderCreateSchema = z.object({
  name: z.string().trim().min(1, "Folder name is required").max(100, "Folder name too long"),
  parentId: objectIdSchema.nullish(),
});
export const xenDriveFolderRenameSchema = z.object({
  name: z.string().trim().min(1, "Folder name is required").max(100, "Folder name too long"),
});
