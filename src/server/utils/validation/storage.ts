import { z } from "zod";
import { objectIdSchema } from "./core";

// The storage viewer (docs/storage.md): files apps stored for the person, no longer shown inside XenDrive.
export const storageFileIdParamSchema = z.object({ fileId: objectIdSchema });
export const storageAppFilesQuerySchema = z.object({
  // One app's files, or everything when left out.
  app: z
    .string()
    .regex(/^[a-z][a-z0-9-]{0,29}$/)
    .optional(),
});
