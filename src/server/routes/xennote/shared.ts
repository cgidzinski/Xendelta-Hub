import type { Request } from "express";
import type { HydratedDocument } from "mongoose";
import { AppError, callerId } from "../../utils/http";
import { XenNote, XenNotebook, type XenNoteAttrs, type XenNotebookAttrs } from "../../models/xenNote";
import { User } from "../../models/user";
import { generateSignedUrl } from "../../utils/storageUtils";
import { signedUrlsFor, thumbnailUrlsFor } from "../../utils/appFiles";
import { SocketManager } from "../../infrastructure/SocketManager";
import { canEdit, canManage, canView, roleOf, type MemberRole } from "../../utils/membership";
import { PUBLIC_USER_FIELDS, cosmeticsOf } from "../../utils/publicUser";

// Access and serialising for XenNote. Everything who-may-do-what goes through utils/membership.ts.
//   - A notebook note follows its notebook's roles (viewers read; editors and owners write).
//   - A loose note (no notebook) is its owner's.
//   - Either kind can also be shared with chosen people (`note.members`) as viewers or editors; someone's role on a note
//     is the best of what the notebook and the note itself give them.
//   - Only the person managing a note moves it, deletes it, or shares it: a loose note's owner, or an editor of its notebook.
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

const RANK: Record<MemberRole, number> = { owner: 3, editor: 2, viewer: 1 };
const best = (roles: Array<MemberRole | null>): MemberRole | null =>
  roles.reduce<MemberRole | null>((top, r) => (r && (!top || RANK[r] > RANK[top]) ? r : top), null);

type NoteAccessFields = Pick<NoteDoc, "notebook_id" | "owner_id"> & {
  members: Array<{ user_id: string; role: MemberRole }>;
};

/** What `uid` may do with a note: the best of their role in its notebook (if any) and the one the note itself gives them. */
export function noteRole(
  note: NoteAccessFields,
  notebook: { members: Array<{ user_id: string; role: MemberRole }> } | null,
  uid: string,
): MemberRole | null {
  return best([
    note.notebook_id ? null : note.owner_id === uid ? "owner" : null,
    note.members.find((m) => m.user_id === uid)?.role ?? null,
    notebook ? roleOf(notebook, uid) : null,
  ]);
}

/** Whether `uid` may move, delete or share a note: a loose note's owner, or an editor of the notebook it sits in. */
export function canManageNote(
  note: NoteAccessFields,
  notebook: { members: Array<{ user_id: string; role: MemberRole }> } | null,
  uid: string,
): boolean {
  if (!note.notebook_id) return note.owner_id === uid;
  return !!notebook && canEdit(notebook, uid);
}

/** A note, and the notebook it is in (null for a loose note), checked for the access `need`. */
export async function loadNote(
  req: Request,
  id: string,
  need: Need,
): Promise<{ note: NoteDoc; notebook: NotebookDoc | null; role: MemberRole }> {
  const uid = callerId(req);
  const note = await XenNote.findById(id);
  if (!note) throw new AppError(404, "Note not found");

  const notebook = note.notebook_id ? await XenNotebook.findById(note.notebook_id) : null;
  const role = noteRole(note.toObject(), notebook?.toObject() ?? null, uid);
  if (!role) throw new AppError(404, "Note not found");
  if (need === "edit" && role === "viewer") throw new AppError(403, "You can only view this note");
  if (need === "manage" && !canManageNote(note.toObject(), notebook?.toObject() ?? null, uid)) {
    throw new AppError(403, "Only the person who owns this note can do that");
  }
  return { note, notebook, role };
}

/**
 * The notes `uid` can see: their own loose notes, every note in a notebook they belong to, and notes shared with them
 * directly. `books` is `myNotebooks(uid)`.
 */
export function visibleNotesFilter(uid: string, books: Array<{ _id: unknown }>) {
  return {
    $or: [
      { notebook_id: null, owner_id: uid },
      { notebook_id: { $in: books.map((b) => b._id) } },
      { "members.user_id": uid },
    ],
  };
}

export const myNotebooks = (uid: string) => XenNotebook.find({ "members.user_id": uid }).sort({ created_at: 1 });

/**
 * Who should hear that something changed: every member of the notebook, or just the owner of a loose note, plus anyone
 * the note is shared with (`extra`, e.g. `note.members` ids).
 */
export function notifyChange(notebook: NotebookDoc | null, ownerId: string, extra: string[] = []) {
  const ids = notebook ? notebook.members.map((m) => m.user_id) : [ownerId];
  SocketManager.getInstance().notifyXenNoteUpdate([...new Set([...ids, ...extra])]);
}

const SIGNED_URL_MINUTES = 60;

async function signedImages(images: Array<{ _id: unknown; file_id?: unknown; gcs_path?: string | null }>) {
  const fileIds = images.filter((i) => i.file_id).map((i) => i.file_id as string);
  const [fileUrls, thumbUrls] = await Promise.all([
    signedUrlsFor(fileIds, SIGNED_URL_MINUTES),
    thumbnailUrlsFor(fileIds),
  ]);
  const signed = await Promise.all(
    images.map(async (img) => ({
      _id: String(img._id),
      // Photos not yet moved to XenDrive still have a storage path.
      url: img.file_id
        ? fileUrls.get(String(img.file_id))
        : img.gcs_path
          ? await generateSignedUrl(img.gcs_path, SIGNED_URL_MINUTES)
          : undefined,
      thumbUrl: img.file_id ? (thumbUrls.get(String(img.file_id)) ?? null) : null,
    })),
  );
  return signed.filter((i): i is { _id: string; url: string; thumbUrl: string | null } => !!i.url);
}

/** A note as its owner or a notebook member sees it. */
/** Display names for the people who last changed notes, and the owners of loose notes, in one lookup. */
export async function namesForNotes(notes: NoteDoc[]): Promise<Map<string, string>> {
  const ids = [
    ...new Set([
      ...notes.filter((n) => n.notebook_id && n.updated_by).map((n) => n.updated_by as string),
      ...notes.filter((n) => !n.notebook_id).map((n) => n.owner_id),
    ]),
  ];
  const users = ids.length ? await User.find({ _id: { $in: ids } }, "username").lean() : [];
  return new Map(users.filter((u) => u.username).map((u) => [String(u._id), u.username as string]));
}

/** The caller's own reminder on a note, or null. */
function reminderFor(note: NoteDoc, uid: string) {
  const mine = note.reminders.find((r) => r.user_id === uid);
  return mine ? { at: mine.at.toISOString(), sent: !!mine.notified_at } : null;
}

export async function serializeNote(
  note: NoteDoc,
  opts: { uid: string; role: MemberRole | null; names?: Map<string, string> },
) {
  // Who last changed it is shown for notes in a shared notebook only. A list passes `names` from one lookup.
  const names = opts.names ?? (await namesForNotes([note]));
  const editable = opts.role === "owner" || opts.role === "editor";
  return {
    _id: note.id as string,
    owner_id: note.owner_id,
    // Whose a directly shared note is, so it can be labelled on someone else's board. Notes in a notebook show who edited.
    owner_name: !note.notebook_id && note.owner_id !== opts.uid ? (names.get(note.owner_id) ?? null) : null,
    // How many people it is shared with directly (not counting a notebook's members).
    shared_with: note.members.length,
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
    // Only my own reminder: other people's are theirs.
    reminder: reminderFor(note, opts.uid),
    can_edit: editable,
    // Moving, deleting and sharing: a loose note's owner, or an editor of its notebook.
    can_manage: note.notebook_id ? editable : note.owner_id === opts.uid,
    // The note's own public link is only shown to people who can change the note.
    share: editable ? { enabled: !!note.share?.enabled, token: note.share?.token ?? null } : null,
    updated_by_name: note.notebook_id && note.updated_by ? (names.get(note.updated_by) ?? null) : null,
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
  const people = ids.length ? await User.find({ _id: { $in: ids } }, PUBLIC_USER_FIELDS).lean() : [];
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
      cosmetics: cosmeticsOf(byId.get(m.user_id)),
    })),
    // Only the owner sees (and manages) the notebook's public link.
    share: role === "owner" ? { enabled: !!book.share?.enabled, token: book.share?.token ?? null } : null,
    created_at: book.created_at.toISOString(),
  };
}

export { escapeRegex } from "@shared/regex";
