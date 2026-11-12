import type { Request } from "express";
import type { HydratedDocument } from "mongoose";
import { AppError, callerId } from "../../utils/http";
import { XenNote, XenNotebook, type XenNoteAttrs, type XenNotebookAttrs } from "../../models/xenNote";
import { User } from "../../models/user";
import { generateSignedUrl } from "../../utils/gcsUtils";
import { SocketManager } from "../../infrastructure/SocketManager";
import { canEdit, canManage, canView, roleOf, type MemberRole } from "../../utils/membership";

// Access and serialising for XenNote. Everything who-may-do-what goes through utils/membership.ts.
//   - A notebook note follows its notebook's roles (viewers read; editors and owners write).
//   - A loose note (no notebook) is visible to its owner and nobody else.
// Someone who can't see a notebook or note gets a 404, so ids can't be probed.

export type Need = "view" | "edit" | "manage";
const allowed = { view: canView, edit: canEdit, manage: canManage };

export type NotebookDoc = HydratedDocument<XenNotebookAttrs>;
export type NoteDoc = HydratedDocument<XenNoteAttrs>;

export async function loadNotebook(req: Request, id: string, need: Need): Promise<NotebookDoc> {
  const uid = callerId(req);
  const book = await XenNotebook.findById(id);
  if (!book || !canView(book.toObject(), uid)) throw new AppError(404, "Notebook not found");
  if (!allowed[need](book.toObject(), uid)) {
    throw new AppError(403, need === "manage" ? "Only the owner can do that" : "You can only view this notebook");
  }
  return book;
}

/** A note, and the notebook it is in (null for a loose note), checked for the access `need`. */
export async function loadNote(
  req: Request,
  id: string,
  need: Exclude<Need, "manage">,
): Promise<{ note: NoteDoc; notebook: NotebookDoc | null }> {
  const uid = callerId(req);
  const note = await XenNote.findById(id);
  if (!note) throw new AppError(404, "Note not found");

  if (!note.notebook_id) {
    if (note.owner_id !== uid) throw new AppError(404, "Note not found");
    return { note, notebook: null };
  }
  const notebook = await XenNotebook.findById(note.notebook_id);
  if (!notebook || !canView(notebook.toObject(), uid)) throw new AppError(404, "Note not found");
  if (!allowed[need](notebook.toObject(), uid)) throw new AppError(403, "You can only view this notebook");
  return { note, notebook };
}

export const myNotebooks = (uid: string) => XenNotebook.find({ "members.user_id": uid }).sort({ created_at: 1 });

/** Who should hear that something changed: every member of the notebook, or just the owner of a loose note. */
export function notifyChange(notebook: NotebookDoc | null, ownerId: string) {
  const ids = notebook ? notebook.members.map((m) => m.user_id) : [ownerId];
  SocketManager.getInstance().notifyXenNoteUpdate(ids);
}

const SIGNED_URL_MINUTES = 60;

async function signedImages(images: Array<{ _id: unknown; gcs_path: string }>) {
  return Promise.all(
    images.map(async (img) => ({
      _id: String(img._id),
      url: await generateSignedUrl(img.gcs_path, SIGNED_URL_MINUTES),
    })),
  );
}

/** A note as its owner or a notebook member sees it. */
export async function serializeNote(note: NoteDoc, opts: { uid: string; role: MemberRole | null }) {
  const editable = note.notebook_id ? opts.role === "owner" || opts.role === "editor" : note.owner_id === opts.uid;
  return {
    _id: note.id as string,
    owner_id: note.owner_id,
    notebook_id: note.notebook_id ? String(note.notebook_id) : null,
    type: note.type,
    title: note.title,
    body: note.body,
    checklist: note.checklist.map((c) => ({ _id: String(c._id), text: c.text, done: c.done })),
    images: await signedImages(note.images),
    link: { url: note.link?.url ?? "", title: note.link?.title ?? "", description: note.link?.description ?? "" },
    color: note.color,
    pinned: note.pinned,
    archived: note.archived,
    labels: note.labels,
    can_edit: editable,
    // The note's own public link is only shown to people who can change the note.
    share: editable ? { enabled: !!note.share?.enabled, token: note.share?.token ?? null } : null,
    created_at: note.created_at.toISOString(),
    updated_at: note.updated_at.toISOString(),
  };
}

/** A note as the public sees it through a link: no owner, no ids of people, no sharing details. */
export async function serializePublicNote(note: NoteDoc) {
  return {
    _id: note.id as string,
    type: note.type,
    title: note.title,
    body: note.body,
    checklist: note.checklist.map((c) => ({ text: c.text, done: c.done })),
    images: await signedImages(note.images),
    link: { url: note.link?.url ?? "", title: note.link?.title ?? "", description: note.link?.description ?? "" },
    color: note.color,
    labels: note.labels,
    updated_at: note.updated_at.toISOString(),
  };
}

export async function serializeNotebook(book: NotebookDoc, uid: string, noteCount: number) {
  const role = roleOf(book.toObject(), uid);
  const ids = book.members.map((m) => m.user_id);
  const people = ids.length ? await User.find({ _id: { $in: ids } }, "username avatar").lean() : [];
  const byId = new Map(people.map((u) => [String(u._id), u]));
  return {
    _id: book.id as string,
    name: book.name,
    color: book.color,
    my_role: role,
    note_count: noteCount,
    members: book.members.map((m) => ({
      user_id: m.user_id,
      role: m.role,
      username: byId.get(m.user_id)?.username ?? "Unknown",
      avatar: byId.get(m.user_id)?.avatar ?? null,
    })),
    // Only the owner sees (and manages) the notebook's public link.
    share: role === "owner" ? { enabled: !!book.share?.enabled, token: book.share?.token ?? null } : null,
    created_at: book.created_at.toISOString(),
  };
}

export const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
