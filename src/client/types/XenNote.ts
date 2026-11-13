import type { ChecklistItem, NoteColor, NoteType } from "@shared/xennote/notes";
import type { Cosmetics } from "@shared/cosmetics";

export type NoteRole = "owner" | "editor" | "viewer";

export interface XenNoteImage {
  _id: string;
  url: string; // short-lived signed URL
}

export interface XenNoteItem extends ChecklistItem {
  _id?: string; // kept so a tick survives a re-save
}

export interface XenNoteLink {
  url: string;
  title: string;
  description: string;
}

/** A note as the board and editor use it. */
export interface XenNote {
  _id: string;
  owner_id: string;
  notebook_id: string | null; // null = a private loose note
  type: NoteType;
  title: string;
  body: string;
  checklist: XenNoteItem[];
  images: XenNoteImage[];
  link: XenNoteLink;
  color: NoteColor;
  pinned: boolean;
  archived: boolean;
  labels: string[];
  /** My own reminder on this note (other people's aren't shown). `sent` once it has gone out. */
  reminder: { at: string; sent: boolean } | null;
  can_edit: boolean;
  share: { enabled: boolean; token: string | null } | null; // only for people who can edit
  updated_by_name: string | null; // who last changed it, in a shared notebook
  created_at: string;
  updated_at: string;
}

/** A note that links to another with [[its title]] (what "Linked from" lists). */
export interface XenNoteBacklink {
  _id: string;
  title: string;
  type: NoteType;
  notebook_id: string | null;
  updated_at: string;
}

/** How many notes each part of the rail holds. */
export interface XenNoteCounts {
  all: number;
  mine: number;
  archived: number;
}

/** What a public link shows: no owner, no sharing details. */
export type PublicXenNote = Pick<
  XenNote,
  "_id" | "type" | "title" | "body" | "images" | "link" | "color" | "labels" | "updated_at"
> & { checklist: ChecklistItem[] };

export interface XenNotebookMember {
  user_id: string;
  role: NoteRole;
  username: string;
  avatar: string | null;
  cosmetics?: Cosmetics;
}

export interface XenNotebook {
  _id: string;
  name: string;
  color: NoteColor;
  my_role: NoteRole | null;
  note_count: number;
  members: XenNotebookMember[];
  share: { enabled: boolean; token: string | null } | null; // owner only
  created_at: string;
}

/** The body sent to create or update a note. */
export type XenNoteInput = Partial<
  Pick<XenNote, "type" | "title" | "body" | "color" | "pinned" | "archived" | "labels" | "notebook_id">
> & { checklist?: XenNoteItem[]; link?: XenNoteLink };

export interface NoteFilters {
  /** "none" = my private notes; an id = that notebook; undefined = everything I can see. */
  notebook?: string;
  archived?: boolean;
  label?: string;
  q?: string;
}
