import { z } from "zod";
import { GIF_QUERY_MAX } from "../../../shared/gif";

export const gifSearchQuerySchema = z.object({
  /** Empty means "trending". */
  q: z.string().trim().max(GIF_QUERY_MAX).default(""),
  offset: z.coerce.number().int().min(0).max(500).default(0),
});
