import type { ChecklistItem, NoteColor, NoteType } from "@shared/xennote/notes";
import type { Cosmetics } from "@shared/cosmetics";

export type NoteRole = "owner" | "editor" | "viewer";

export interface XenNoteImage {
  _id: string;
  url: string; // short-lived signed URL
  thumbUrl?: string | null; // a cacheable ~320 px WebP, when it is ready
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
  /** Whether I may delete, move or share it (the owner of a loose note, an editor of its notebook). */
  can_manage: boolean;
  share: { enabled: boolean; token: string | null } | null; // only for people who can edit
  /** Who owns a note someone shared with me directly; null for my own notes and notebook notes. */
  owner_name: string | null;
  /** How many people it is shared with directly (a notebook's members are not counted). */
  shared_with: number;
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
  /** Notes this person deleted that are still in the Trash. */
  trash: number;
  /** Notes other people shared with this person directly. */
  shared: number;
}

/** Who a note is open to, for the Share dialog. */
export interface XenNoteSharing {
  can_manage: boolean;
  owner: { user_id: string; username: string; avatar: string | null; cosmetics?: Cosmetics };
  members: Array<{
    user_id: string;
    username: string;
    avatar: string | null;
    cosmetics?: Cosmetics;
    role: "editor" | "viewer";
  }>;
  /** The notebook the note sits in, when the person is in it too: its members can also read the note. */
  notebook: { id: string; name: string } | null;
  /** The note's public link; only for the person who manages it. */
  share: { enabled: boolean; token: string | null } | null;
}

/** A note in the Trash: enough to recognise it, and when it goes for good. */
export interface TrashedXenNote {
  _id: string;
  type: "text" | "checklist" | "image" | "link";
  title: string;
  preview: string;
  color: string;
  deleted_at: string;
  purge_at: string;
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
  journal_template_id?: string | null;
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

/** One earlier version of a note, as listed in its history. */
export interface XenNoteVersionSummary {
  _id: string;
  /** When the note last stood like this. */
  at: string;
  by_name: string | null;
  type: "text" | "checklist" | "image" | "link";
  title: string;
  preview: string;
}

/** An earlier version in full, to read before putting it back. */
export interface XenNoteVersionFull {
  _id: string;
  at: string;
  by_name: string | null;
  type: "text" | "checklist" | "image" | "link";
  title: string;
  body: string;
  checklist: Array<{ text: string; done: boolean }>;
  link: { url: string; title: string; description: string };
}
