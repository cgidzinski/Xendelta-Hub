import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { softDeleteFields, softDeletePlugin } from "../utils/softDelete";
import { propertyTypes } from "../../shared/xennote/properties";
import { NOTE_COLORS } from "../../shared/xennote/notes";
import { MAX_PAGE_TITLE, MAX_SECTION_NAME, PAGE_SCHEMA_VERSION, SECTION_KINDS } from "../../shared/xennote/pages";
import { reminderSchema, xenNoteShareMemberSchema } from "./xenNote";

// Notebook pages. A notebook (XenNotebook in xenNote.ts) holds sections, a section holds pages, and a page can hold
// sub-pages (one level). Who may see a page comes from the notebook's members, plus anyone added to the page itself
// (see routes/xennote/shared.ts).
//
// A page is split in two so that listing, moving and searching pages never loads a body:
//   XenNotePage      what the tree, backlinks, search and the graph need: title, place, tags, and everything derived
//                    from the body (shared/xennote/deriveFromDoc.ts)
//   XenNotePageBody  the page's text as ProseMirror JSON (shared/xennote/pageSchema.ts)
// Orders are fractional-index strings (the `fractional-indexing` package): moving one item writes only that item.

// A section groups pages inside a notebook. A notebook has at most one journal section (one page per day) and one
// templates section; those two are not deleted, so the unique index below can stay simple.
const sectionSchema = new Schema({
  notebook_id: { type: Schema.Types.ObjectId, ref: "XenNotebook", required: true },
  name: { type: String, required: true, maxlength: MAX_SECTION_NAME },
  color: { type: String, enum: NOTE_COLORS, default: "default" },
  kind: { type: String, enum: SECTION_KINDS, default: "normal" },
  order: { type: String, required: true },
  created_by: { type: String, default: null },
  ...softDeleteFields,
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});
sectionSchema.index({ notebook_id: 1, order: 1 });
sectionSchema.index(
  { notebook_id: 1, kind: 1 },
  { unique: true, partialFilterExpression: { kind: { $in: ["journal", "templates"] } } },
);
sectionSchema.plugin(softDeletePlugin);
sectionSchema.pre("save", function (next) {
  this.updated_at = new Date();
  next();
});

const pageSchema = new Schema({
  notebook_id: { type: Schema.Types.ObjectId, ref: "XenNotebook", required: true },
  section_id: { type: Schema.Types.ObjectId, ref: "XenNoteSection", required: true },
  // Only one level: a page with a parent can't have sub-pages of its own (enforced when pages are created and moved).
  parent_id: { type: Schema.Types.ObjectId, ref: "XenNotePage", default: null },
  migrated_from_note: { type: Boolean },
  order: { type: String, required: true },

  title: { type: String, default: "", maxlength: MAX_PAGE_TITLE },
  icon: { type: String, default: null, maxlength: 16 },
  color: { type: String, enum: NOTE_COLORS, default: "default" },
  archived: { type: Boolean, default: false },
  // Favourites are personal: the people who starred this page.
  favorited_by: { type: [String], default: [] },
  // Other names the page answers to, so `[[Q4 kickoff]]` finds "Q4 planning kickoff".
  properties: {
    type: [
      new Schema(
        {
          key: { type: String, required: true },
          type: { type: String, enum: propertyTypes, required: true },
          value: { type: Schema.Types.Mixed, required: true },
          options: { type: [String], default: undefined },
        },
        { _id: false },
      ),
    ],
    default: [],
  },
  aliases: { type: [String], default: [] },

  // Tags belong to the page's notebook (a query always names the notebook). `tags_manual` are added as page
  // properties (a note's old labels land here), `tags_inline` are #tags written in the text, and `tags` is both,
  // kept for querying.
  tags_manual: { type: [String], default: [] },
  tags_inline: { type: [String], default: [] },
  tags: { type: [String], default: [] },

  // `YYYY-MM-DD` for a journal page, otherwise null.
  journal_date: { type: String, default: null },
  reminders: { type: [reminderSchema], default: [] },

  // People added to this page (and its sub-pages) who are not members of the notebook.
  members: { type: [xenNoteShareMemberSchema], default: [] },
  share: {
    enabled: { type: Boolean, default: false },
    token: { type: String, default: undefined },
  },

  // Counts body saves. A save names the revision it started from, so a save that overwrites a newer one can be told.
  rev: { type: Number, default: 0 },

  // Worked out from the body on every save (shared/xennote/deriveFromDoc.ts). Never set by a client.
  block_refs: {
    type: [
      new Schema(
        { page_id: { type: Schema.Types.ObjectId, required: true }, block_id: { type: String, required: true } },
        { _id: false },
      ),
    ],
    default: [],
  },
  links: { type: [Schema.Types.ObjectId], default: [] },
  unresolved: { type: [String], default: [] },
  files: { type: [Schema.Types.ObjectId], default: [] },
  search_text: { type: String, default: "" },
  excerpt: { type: String, default: "" },
  todo: {
    open: { type: Number, default: 0 },
    done: { type: Number, default: 0 },
  },
  task_items: {
    type: [
      new Schema(
        {
          block_id: { type: String, required: true },
          text: { type: String, default: "" },
          done: { type: Boolean, default: false },
        },
        { _id: false },
      ),
    ],
    default: [],
  },
  word_count: { type: Number, default: 0 },

  created_by: { type: String, default: null },
  updated_by: { type: String, default: null },
  ...softDeleteFields,
  // Set to the section's id when the page went to the trash because its whole section did, so restoring the section
  // brings back exactly those pages.
  deleted_with: { type: Schema.Types.ObjectId, default: null },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});
pageSchema.index({ section_id: 1, parent_id: 1, order: 1 });
pageSchema.index({ notebook_id: 1, updated_at: -1 });
pageSchema.index({ links: 1 });
pageSchema.index({ notebook_id: 1, "task_items.done": 1 });
pageSchema.index({ notebook_id: 1, "properties.key": 1, "properties.type": 1 });
pageSchema.index({ "block_refs.page_id": 1, "block_refs.block_id": 1 });
pageSchema.index({ notebook_id: 1, unresolved: 1 });
pageSchema.index({ notebook_id: 1, tags: 1 });
pageSchema.index({ notebook_id: 1, aliases: 1 });
pageSchema.index({ favorited_by: 1 });
pageSchema.index({ "members.user_id": 1 });
pageSchema.index({ "share.token": 1 }, { unique: true, sparse: true });
pageSchema.index({ "reminders.at": 1 });
// One journal page per day in a notebook.
pageSchema.index(
  { notebook_id: 1, journal_date: 1 },
  { unique: true, partialFilterExpression: { journal_date: { $type: "string" } } },
);
// Search: a title counts most, then tags, then the text. A collection can only have one text index.
pageSchema.index(
  { title: "text", tags: "text", search_text: "text" },
  { weights: { title: 10, tags: 5, search_text: 1 }, name: "page_text" },
);
pageSchema.plugin(softDeletePlugin);
pageSchema.pre("save", function (next) {
  this.updated_at = new Date();
  next();
});

// A page's text. `doc` is ProseMirror JSON, at most MAX_PAGE_DOC_BYTES, checked on every save
// (shared/xennote/pageSchema.ts). `schema_version` says which shape it is in, so old bodies can be upgraded on read.
// Live co-editing later adds its state next to `doc` here (`ystate`), not on the page.
const pageBodySchema = new Schema(
  {
    page_id: { type: Schema.Types.ObjectId, ref: "XenNotePage", required: true, unique: true },
    doc: { type: Schema.Types.Mixed, required: true },
    schema_version: { type: Number, default: PAGE_SCHEMA_VERSION },
    rev: { type: Number, default: 0 },
    updated_at: { type: Date, default: Date.now },
  },
  // An empty object in the document is meaningful, so it is kept rather than dropped.
  { minimize: false },
);

// A page's earlier content, kept so a change can be looked at and undone (like XenNoteVersion for notes). One row is
// how the page stood at `at`, written by `by`. Rows go away a year after they were made, or with their page.
const pageVersionSchema = new Schema(
  {
    page_id: { type: Schema.Types.ObjectId, required: true },
    at: { type: Date, required: true },
    by: { type: String, default: null },
    title: { type: String, default: "" },
    doc: { type: Schema.Types.Mixed, required: true },
    // The files the old content shows, so they are kept for as long as this version is.
    files: { type: [Schema.Types.ObjectId], default: [] },
    captured_at: { type: Date, default: Date.now, expires: 365 * 86_400 },
  },
  { minimize: false },
);
pageVersionSchema.index({ page_id: 1, captured_at: -1 });

export type XenNoteSectionAttrs = InferSchemaType<typeof sectionSchema>;
export type XenNotePageAttrs = InferSchemaType<typeof pageSchema>;
export type XenNotePageBodyAttrs = InferSchemaType<typeof pageBodySchema>;
export type XenNotePageVersionAttrs = InferSchemaType<typeof pageVersionSchema>;
export const XenNoteSection = mongoose.model("XenNoteSection", sectionSchema);
export const XenNotePage = mongoose.model("XenNotePage", pageSchema);
export const XenNotePageBody = mongoose.model("XenNotePageBody", pageBodySchema);
export const XenNotePageVersion = mongoose.model("XenNotePageVersion", pageVersionSchema);
