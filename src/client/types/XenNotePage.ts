import type { JSONContent } from "@tiptap/core";
import type { NoteColor } from "@shared/xennote/notes";
import type { PageTreeEntry, SectionKind } from "@shared/xennote/pages";
import type { NoteRole } from "./XenNote";

export type { PageTreeEntry, SectionKind };

/** A tab of a notebook. */
export interface XenNoteSection {
  id: string;
  notebook_id: string;
  name: string;
  color: NoteColor;
  kind: SectionKind;
  order: string;
  created_at: string;
  updated_at: string;
}

/** A notebook's sections and the pages in them, without bodies: one small response for the whole notebook. */
export interface NotebookTree {
  sections: XenNoteSection[];
  pages: PageTreeEntry[];
}

/** A page's own details (everything but its text). */
export interface XenNotePageMeta extends PageTreeEntry {
  notebook_id: string;
  aliases: string[];
  tags_manual: string[];
  /** Counts text saves; a save names the revision it started from. */
  rev: number;
  word_count: number;
  my_role: NoteRole;
  can_edit: boolean;
  /** Whether I may move, delete or share it (people who can edit the notebook). */
  can_manage: boolean;
  created_at: string;
  updated_by: string | null;
}

/** A file shown in a page, with a short-lived link. `url` is null if the file no longer exists. */
export interface PageFileInfo {
  name: string;
  size: number;
  mime: string;
  url: string | null;
  thumbUrl: string | null;
}

/** A page with its text, as the person opening it sees it. */
export interface XenNotePageDetail {
  page: XenNotePageMeta;
  doc: JSONContent;
  /** The files the text refers to, by file id. */
  files: Record<string, PageFileInfo>;
  /** Null for someone who was added to this page alone: they see the page, not the notebook around it. */
  notebook: { id: string; name: string } | null;
  section: { id: string; name: string; kind: SectionKind } | null;
}

export interface UploadedPageFile extends PageFileInfo {
  id: string;
}

/** What saving a page's text answers: the new revision, and whether it overwrote a newer one. */
export interface PageBodySaved {
  rev: number;
  conflict: boolean;
}
