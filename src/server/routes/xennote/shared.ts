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

type NoteAccessFields = Pick<NoteDoc, "owner_id" | "members">;

export function noteRole(note: NoteAccessFields, uid: string): MemberRole | null {
  return note.owner_id === uid ? "owner" : (note.members.find((member) => member.user_id === uid)?.role ?? null);
}

export async function loadNote(req: Request, id: string, need: Need): Promise<{ note: NoteDoc; role: MemberRole }> {
  const uid = callerId(req);
  const note = await XenNote.findById(id);
  if (!note) throw new AppError(404, "Note not found");

  const role = noteRole(note, uid);
  if (!role) throw new AppError(404, "Note not found");
  if (need === "edit" && role === "viewer") throw new AppError(403, "You can only view this note");
  if (need === "manage" && role !== "owner") {
    throw new AppError(403, "Only the person who owns this note can do that");
  }
  return { note, role };
}

export function visibleNotesFilter(uid: string) {
  return { $or: [{ owner_id: uid }, { "members.user_id": uid }] };
}

export const myNotebooks = (uid: string) => XenNotebook.find({ "members.user_id": uid }).sort({ created_at: 1 });

export function notifyNoteUsers(users: string[]) {
  SocketManager.getInstance().notifyXenNoteUpdate([...new Set(users)]);
}

export const noteUsers = (note: NoteAccessFields) => [note.owner_id, ...note.members.map((member) => member.user_id)];

export function notifyChange(note: NoteAccessFields, extra: string[] = []) {
  notifyNoteUsers([...noteUsers(note), ...extra]);
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

export async function namesForNotes(notes: NoteDoc[]): Promise<Map<string, string>> {
  const ids = [...new Set(notes.map((note) => note.owner_id))];
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
  const names = opts.names ?? (await namesForNotes([note]));
  const editable = opts.role === "owner" || opts.role === "editor";
  return {
    _id: note.id as string,
    owner_id: note.owner_id,
    owner_name: note.owner_id !== opts.uid ? (names.get(note.owner_id) ?? null) : null,
    shared_with: note.members.length,
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
    can_manage: note.owner_id === opts.uid,
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

export async function serializeNotebook(book: NotebookDoc, uid: string, pageCount: number) {
  const role = roleOf(book.toObject(), uid);
  const ids = book.members.map((m) => m.user_id);
  const people = ids.length ? await User.find({ _id: { $in: ids } }, PUBLIC_USER_FIELDS).lean() : [];
  const byId = new Map(people.map((u) => [String(u._id), u]));
  return {
    _id: book.id as string,
    name: book.name,
    color: book.color,
    my_role: role,
    page_count: pageCount,
    journal_template_id: book.journal_template_id ? String(book.journal_template_id) : null,
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
