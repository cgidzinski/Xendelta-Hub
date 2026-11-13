import { z } from "zod";
import { objectIdSchema } from "./core";
import {
  MAX_BODY,
  MAX_CHECKLIST_ITEMS,
  MAX_CHECKLIST_TEXT,
  MAX_LABELS,
  MAX_LABEL_LENGTH,
  MAX_NOTEBOOK_PEOPLE,
  MAX_TITLE,
  NOTE_COLORS,
  NOTE_TYPES,
  isSafeUrl,
  normalizeLabels,
} from "../../../shared/xennote/notes";

const color = z.enum(NOTE_COLORS);
const role = z.enum(["editor", "viewer"]);
const shareToken = z.string().regex(/^[A-Za-z0-9_-]{22}$/, "Invalid link");

export const xenNoteIdParamSchema = z.object({ id: objectIdSchema });
export const xenNoteMemberParamSchema = z.object({ id: objectIdSchema, userId: objectIdSchema });
export const xenNoteImageParamSchema = z.object({ id: objectIdSchema, imageId: objectIdSchema });
export const xenNoteTokenParamSchema = z.object({ token: shareToken });

export const xenNotebookSchema = z.object({
  name: z.string().trim().min(1, "Give the notebook a name").max(60),
  color: color.optional(),
});
export const xenNotebookUpdateSchema = xenNotebookSchema.partial();

export const xenNoteAddMembersSchema = z.object({
  userIds: z.array(objectIdSchema).min(1).max(MAX_NOTEBOOK_PEOPLE),
  role: role.default("editor"),
});
export const xenNoteMemberRoleSchema = z.object({ role: z.enum(["owner", "editor", "viewer"]) });

const linkSchema = z.object({
  url: z
    .string()
    .trim()
    .max(2000)
    .refine((u) => u === "" || isSafeUrl(u), "Only web addresses (http or https) can be saved as a link"),
  title: z.string().trim().max(MAX_TITLE).default(""),
  description: z.string().trim().max(1000).default(""),
});

const noteFields = {
  type: z.enum(NOTE_TYPES),
  title: z.string().max(MAX_TITLE),
  body: z.string().max(MAX_BODY),
  checklist: z
    .array(
      z.object({
        _id: z.string().optional(), // existing items keep their id so a tick is not lost
        text: z.string().max(MAX_CHECKLIST_TEXT),
        done: z.boolean().default(false),
      }),
    )
    .max(MAX_CHECKLIST_ITEMS),
  link: linkSchema,
  color,
  pinned: z.boolean(),
  archived: z.boolean(),
  labels: z
    .array(z.string().max(MAX_LABEL_LENGTH * 2))
    .max(MAX_LABELS * 3)
    .transform((l) => normalizeLabels(l)),
  // Where the note lives: a notebook id, or null for a private loose note.
  notebook_id: objectIdSchema.nullable(),
};

export const xenNoteCreateSchema = z
  .object(noteFields)
  .partial()
  .extend({ type: noteFields.type.default("text") });
export const xenNoteUpdateSchema = z.object(noteFields).partial();

export const xenNoteListQuerySchema = z.object({
  // "none" = only my loose notes; an id = that notebook; omitted = everything I can see.
  notebook: z.union([z.literal("none"), objectIdSchema]).optional(),
  archived: z.enum(["true", "false"]).optional(),
  label: z
    .string()
    .max(MAX_LABEL_LENGTH * 2)
    .optional(),
  q: z.string().max(200).optional(),
});

// A reminder time (ISO), or null to remove it. It must be a real time in the future, within five years.
const FIVE_YEARS_MS = 5 * 365 * 86_400_000;
export const xenNoteReminderSchema = z.object({
  at: z
    .string()
    .max(64)
    .nullable()
    .refine((v) => v === null || !Number.isNaN(new Date(v).getTime()), "Pick a valid date and time")
    .refine((v) => v === null || new Date(v).getTime() > Date.now(), "Pick a time in the future")
    .refine((v) => v === null || new Date(v).getTime() < Date.now() + FIVE_YEARS_MS, "That is too far away"),
});
