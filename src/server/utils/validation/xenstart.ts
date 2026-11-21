import { z } from "zod";
import {
  BACKGROUND_FITS,
  CLOCK_FORMATS,
  GRID_DIMENSION_LIMIT,
  HUB_SECTIONS,
  parseQuickLinkUrl,
  QUICK_LINK_LIMIT,
  MAX_REGION_PADDING,
  REGION_ALIGNMENTS,
  REGION_HEIGHT_SHARES,
  REGION_PADDING_STEP,
  SEARCH_ENGINES,
  WIDGET_REGIONS,
  WIDGET_TYPES,
  WIDGET_SIZES,
} from "@shared/xenstart";

const quickLink = z.object({
  id: z.uuid(),
  label: z.string().trim().min(1).max(80),
  url: z.string().trim().max(2048).refine(parseQuickLinkUrl, "Enter an HTTP or HTTPS website URL."),
  iconUrl: z.string().max(2048).refine(parseQuickLinkUrl).optional(),
  slot: z
    .number()
    .int()
    .min(0)
    .max(QUICK_LINK_LIMIT - 1)
    .optional(),
});

export const xenStartBookmarkSchema = z.object({ url: quickLink.shape.url });
export const xenStartBackgroundParams = z.object({ imageId: z.uuid() });

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

const region = z.array(z.enum(WIDGET_TYPES)).max(WIDGET_TYPES.length);
const layout = z
  .strictObject({
    top: region,
    center: region,
    left: region,
    right: region,
    bottom: region,
  })
  .refine((regions) => {
    const widgets = WIDGET_REGIONS.flatMap((key) => regions[key]);
    return new Set(widgets).size === widgets.length;
  }, "Each widget can only be placed once.");

const regionPresentation = {
  alignment: z.enum(REGION_ALIGNMENTS).optional(),
  paddingTop: z.number().int().min(0).max(MAX_REGION_PADDING).multipleOf(REGION_PADDING_STEP).optional(),
};
const middleRegion = z
  .strictObject({
    ...regionPresentation,
    height: z.literal(REGION_HEIGHT_SHARES).nullable().optional(),
  })
  .optional();
const sideRegion = z.strictObject(regionPresentation).optional();

export const xenStartConfigSchema = z.strictObject({
  links: z
    .array(quickLink)
    .max(QUICK_LINK_LIMIT)
    .refine((links) => new Set(links.map((link) => link.id)).size === links.length, "Quick-link IDs must be unique.")
    .refine((links) => {
      const slots = links.flatMap((link) => (link.slot === undefined ? [] : [link.slot]));
      return new Set(slots).size === slots.length;
    }, "Quick-link slots must be unique."),
  engine: z.enum(SEARCH_ENGINES),
  sections: z
    .array(z.enum(HUB_SECTIONS))
    .max(HUB_SECTIONS.length)
    .refine((sections) => new Set(sections).size === sections.length, "Hub sections must be unique."),
  revision: z.number().int().nonnegative(),
  appearance: appearance.optional(),
  layout: layout.optional(),
  regionStyles: z
    .strictObject({
      top: middleRegion,
      center: middleRegion,
      bottom: middleRegion,
      left: sideRegion,
      right: sideRegion,
    })
    .optional(),
  clockFormat: z.enum(CLOCK_FORMATS).optional(),
  clockSize: z.enum(WIDGET_SIZES).optional(),
  linkTileSize: z.enum(WIDGET_SIZES).optional(),
  backgroundImageId: z.uuid().nullable().optional(),
  backgroundFit: z.enum(BACKGROUND_FITS).optional(),
});
