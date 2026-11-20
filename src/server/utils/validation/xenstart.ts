import { z } from "zod";
import {
  GRID_DIMENSION_LIMIT,
  HUB_SECTIONS,
  parseQuickLinkUrl,
  QUICK_LINK_LIMIT,
  SEARCH_ENGINES,
} from "@shared/xenstart";

const quickLink = z.object({
  id: z.uuid(),
  label: z.string().trim().min(1).max(80),
  url: z.string().trim().max(2048).refine(parseQuickLinkUrl, "Enter an HTTP or HTTPS website URL."),
});

const gridDimension = z.number().int().min(1).max(GRID_DIMENSION_LIMIT);
const appearance = z.strictObject({
  rows: gridDimension,
  columns: gridDimension,
  backgroundUrl: z
    .string()
    .trim()
    .max(2048)
    .refine((value) => value === "" || parseQuickLinkUrl(value)?.protocol === "https:", "Enter an HTTPS image URL."),
  showClock: z.boolean(),
});

export const xenStartConfigSchema = z.strictObject({
  links: z
    .array(quickLink)
    .max(QUICK_LINK_LIMIT)
    .refine((links) => new Set(links.map((link) => link.id)).size === links.length, "Quick-link IDs must be unique."),
  engine: z.enum(SEARCH_ENGINES),
  sections: z
    .array(z.enum(HUB_SECTIONS))
    .max(HUB_SECTIONS.length)
    .refine((sections) => new Set(sections).size === sections.length, "Hub sections must be unique."),
  revision: z.number().int().nonnegative(),
  appearance: appearance.optional(),
});
