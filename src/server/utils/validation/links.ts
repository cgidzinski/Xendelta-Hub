import { z } from "zod";
import { objectIdSchema } from "./core";

// XenLink: a short name and a destination. Existing links are not guaranteed to be full URLs
// (people paste "example.com"), so the URL is bounded but not format-checked.
const linkFields = {
  name: z.string().trim().min(1, "Name is required").max(200, "Name too long"),
  url: z.string().trim().min(1, "URL is required").max(2048, "URL too long"),
};

export const xenLinkCreateSchema = z.object(linkFields);
export const xenLinkUpdateSchema = z.object({ _id: objectIdSchema, ...linkFields });
export const xenLinkIdParamSchema = z.object({ linkId: objectIdSchema });
// Slugs are base62 counters (see models/xenlink.ts); allow a little headroom for future formats.
export const xenLinkSlugParamSchema = z.object({ slug: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Invalid slug") });
