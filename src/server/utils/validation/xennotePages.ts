import { blockIdPattern } from "../../../shared/xennote/blockReferences";
import { z } from "zod";
import { objectIdSchema } from "./core";
import { NOTE_COLORS } from "../../../shared/xennote/notes";
import {
  MAX_PAGE_ALIASES,
  MAX_PAGE_TAGS,
  MAX_PAGE_TITLE,
  MAX_SECTION_NAME,
  normalizeTag,
  isJournalDate,
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
  .strictObject({
    title: z.string().trim().max(MAX_PAGE_TITLE).default(""),
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
  // A random id each open editor makes up, handed back in the realtime event so an editor knows its own saves.
  client_id: z.string().max(64).optional(),
});

export const xenNotePageMoveSchema = z
  .strictObject({
    section_id: objectIdSchema.optional(),
    ...position,
  })
  .refine(onePosition, positionMessage);

export const xenNotePageFavoriteSchema = z.object({ favorite: z.boolean() });

// Links between pages, and search.
export const xenNotePeekSchema = z.object({ ids: z.array(objectIdSchema).min(1).max(100) });
export const xenNoteSuggestQuerySchema = z.object({
  q: z.string().max(200).default(""),
  notebook: objectIdSchema.optional(),
});
export const xenNoteLinkMentionSchema = z.object({ target_id: objectIdSchema });
export const xenNoteSearchQuerySchema = z.object({
  q: z.string().max(200).default(""),
  notebook: objectIdSchema.optional(),
  tag: z.string().max(60).optional(),
});

export const xenNoteJournalSchema = z.object({ date: z.string().refine(isJournalDate, "Choose a valid journal date") });
export const xenNoteJournalTemplateSchema = z.object({ page_id: objectIdSchema.nullable() });
export const xenNoteTemplateUseSchema = z.object({ template_id: objectIdSchema });

export const xenNoteGraphQuerySchema = z.object({
  notebook: objectIdSchema.optional(),
  mergeTags: z.enum(["true", "false"]).optional(),
});

const blockId = z.string().regex(blockIdPattern);
export const xenNoteBlockParamSchema = z.object({ id: objectIdSchema, blockId });
export const xenNotePublicBlockParamSchema = xenNoteBlockParamSchema.extend({
  token: z.string().regex(/^[a-z0-9_-]{22,64}$/i),
});

export const xenNoteTasksQuerySchema = z.object({
  notebook: objectIdSchema.optional(),
  done: z.enum(["true", "false"]).optional(),
});
export const xenNoteToggleTaskSchema = z.object({ checked: z.boolean() });
