import { z } from "zod";
import { objectIdSchema } from "./core";
import { NOTE_COLORS } from "../../../shared/xennote/notes";
import {
  MAX_PAGE_ALIASES,
  MAX_PAGE_TAGS,
  MAX_PAGE_TITLE,
  MAX_SECTION_NAME,
  normalizeTag,
} from "../../../shared/xennote/pages";

// Notebook sections and pages (routes/xennote/sections.ts, pages.ts, ...). Path parameters reuse xenNoteIdParamSchema
// and xenNoteMemberParamSchema from ./xennote.

const color = z.enum(NOTE_COLORS);

/** Where to put something among its siblings: right before or right after one of them, or last when neither is named. */
const position = {
  before: objectIdSchema.optional(),
  after: objectIdSchema.optional(),
};
const onePosition = (v: { before?: string; after?: string }) => !(v.before && v.after);
const positionMessage = { message: "Choose before or after, not both" };

export const xenNoteSectionCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Give the section a name").max(MAX_SECTION_NAME),
    color: color.optional(),
    ...position,
  })
  .refine(onePosition, positionMessage);
export const xenNoteSectionUpdateSchema = z.object({
  name: z.string().trim().min(1, "Give the section a name").max(MAX_SECTION_NAME).optional(),
  color: color.optional(),
});
export const xenNoteSectionMoveSchema = z.object(position).refine(onePosition, positionMessage);

export const xenNotePageCreateSchema = z
  .object({
    title: z.string().trim().max(MAX_PAGE_TITLE).default(""),
    // Make it a sub-page of this page (which must be in the same section and not itself a sub-page).
    parent_id: objectIdSchema.nullable().optional(),
    ...position,
  })
  .refine(onePosition, positionMessage);

const tags = z
  .array(z.string().max(MAX_PAGE_TITLE))
  .max(MAX_PAGE_TAGS * 3)
  .transform((list) => [...new Set(list.map(normalizeTag).filter(Boolean))].slice(0, MAX_PAGE_TAGS));
const aliases = z
  .array(z.string().max(MAX_PAGE_TITLE * 2))
  .max(MAX_PAGE_ALIASES * 3)
  .transform((list) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of list) {
      const alias = raw.trim().replace(/\s+/g, " ").slice(0, MAX_PAGE_TITLE);
      if (alias && !seen.has(alias.toLowerCase())) {
        seen.add(alias.toLowerCase());
        out.push(alias);
      }
    }
    return out.slice(0, MAX_PAGE_ALIASES);
  });

export const xenNotePageUpdateSchema = z.object({
  title: z.string().trim().max(MAX_PAGE_TITLE).optional(),
  icon: z.string().trim().max(16).nullable().optional(),
  color: color.optional(),
  archived: z.boolean().optional(),
  tags_manual: tags.optional(),
  aliases: aliases.optional(),
});

// The body is checked against the page schema and size limit in the route (shared/xennote/pageSchema.ts); here it only
// has to be a document. `base_rev` is the revision the editor started from, so a save over a newer one can be told.
export const xenNotePageBodySchema = z.object({
  doc: z.looseObject({ type: z.literal("doc") }),
  base_rev: z.number().int().min(0),
});

export const xenNotePageMoveSchema = z
  .object({
    section_id: objectIdSchema.optional(),
    // null makes it a top-level page; an id makes it a sub-page of that page.
    parent_id: objectIdSchema.nullable().optional(),
    ...position,
  })
  .refine(onePosition, positionMessage);

export const xenNotePageFavoriteSchema = z.object({ favorite: z.boolean() });
