import mongoose, { Schema, type InferSchemaType } from "mongoose";
import { memberSchema } from "../utils/membership";
import {
  MAX_BODY,
  MAX_CHECKLIST_TEXT,
  MAX_TITLE,
  MAX_URL_LENGTH,
  NOTE_COLORS,
  NOTE_TYPES,
} from "../../shared/xennote/notes";

// A notebook groups notes and is the unit of sharing: people are members of it (standard
// membership shape, utils/membership.ts) and see every note in it. A note with no notebook is a loose
// note that only its owner sees.
const notebookSchema = new Schema({
  name: { type: String, required: true, maxlength: 60 },
  color: { type: String, enum: NOTE_COLORS, default: "default" },
  members: { type: [memberSchema], default: [] },
  share: {
    enabled: { type: Boolean, default: false },
    token: { type: String, default: undefined },
  },
  created_at: { type: Date, default: Date.now },
});

notebookSchema.index({ "members.user_id": 1 });
notebookSchema.index({ "share.token": 1 }, { unique: true, sparse: true });

const checklistItemSchema = new Schema(
  {
    text: { type: String, default: "", maxlength: MAX_CHECKLIST_TEXT },
    done: { type: Boolean, default: false },
  },
  { _id: true },
);

const noteSchema = new Schema({
  owner_id: { type: String, required: true },
  notebook_id: { type: Schema.Types.ObjectId, ref: "XenNotebook", default: null },
  type: { type: String, enum: NOTE_TYPES, default: "text" },
  title: { type: String, default: "", maxlength: MAX_TITLE },
  body: { type: String, default: "", maxlength: MAX_BODY },
  checklist: { type: [checklistItemSchema], default: [] },
  // Photos live in the private bucket; clients get short-lived signed URLs.
  images: { type: [{ gcs_path: { type: String, required: true } }], default: [] },
  link: {
    url: { type: String, default: "", maxlength: MAX_URL_LENGTH },
    title: { type: String, default: "", maxlength: MAX_TITLE },
    description: { type: String, default: "", maxlength: 1000 },
  },
  color: { type: String, enum: NOTE_COLORS, default: "default" },
  pinned: { type: Boolean, default: false },
  archived: { type: Boolean, default: false },
  labels: { type: [String], default: [] },
  share: {
    enabled: { type: Boolean, default: false },
    token: { type: String, default: undefined },
  },
  updated_by: { type: String, default: null },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

noteSchema.index({ notebook_id: 1, updated_at: -1 });
noteSchema.index({ owner_id: 1, notebook_id: 1 });
noteSchema.index({ "share.token": 1 }, { unique: true, sparse: true });

noteSchema.pre("save", function (next) {
  this.updated_at = new Date();
  next();
});

export type XenNotebookAttrs = InferSchemaType<typeof notebookSchema>;
export type XenNoteAttrs = InferSchemaType<typeof noteSchema>;
export const XenNotebook = mongoose.model("XenNotebook", notebookSchema);
export const XenNote = mongoose.model("XenNote", noteSchema);
