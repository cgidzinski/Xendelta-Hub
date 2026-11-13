import { z } from "zod";
import { objectIdSchema } from "./core";
import { SLUG_PATTERN, normalizeDestination } from "../../../shared/xenlink";

// XenLink: a short name and a destination. People paste "example.com", so a missing scheme is filled in as https://;
// anything that isn't a web address (javascript:, data:, ...) is refused, since the redirect page will open it.
const destination = z
  .string()
  .trim()
  .min(1, "URL is required")
  .max(2048, "URL too long")
  .transform((value, ctx) => {
    const url = normalizeDestination(value);
    if (!url) ctx.addIssue({ code: "custom", message: "Enter a web address (http or https)" });
    return url ?? value;
  });

const linkFields = {
  name: z.string().trim().min(1, "Name is required").max(200, "Name too long"),
  url: destination,
  // An optional short name of your own. Leave it out to get a random one (create) or keep the current one (edit).
  slug: z.string().trim().toLowerCase().regex(SLUG_PATTERN, "Use 3 to 40 letters, numbers, - or _").optional(),
  // When the link stops working; null (or "") for never. Leave it out to keep it as it is.
  expiresAt: z
    .string()
    .max(64)
    .nullish()
    .refine((v) => !v || !Number.isNaN(new Date(v).getTime()), "Pick a valid date and time"),
};

export const xenLinkCreateSchema = z.object(linkFields);
export const xenLinkUpdateSchema = z.object({ _id: objectIdSchema, ...linkFields });
export const xenLinkIdParamSchema = z.object({ linkId: objectIdSchema });
// Slugs are random strings, counters (older links) or a name the owner chose.
export const xenLinkSlugParamSchema = z.object({ slug: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/, "Invalid slug") });
