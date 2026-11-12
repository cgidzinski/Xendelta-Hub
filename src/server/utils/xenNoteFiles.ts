// XenNote photos are XenDrive files tagged `source: { app: "xennote", ref: <noteId> }` (utils/appFiles.ts). The ref is
// the note, not its notebook, because a note can move between notebooks and its photos go with it.

import { Types } from "mongoose";
import { XenNote, XenNotebook } from "../models/xenNote";
import { SocketManager } from "../infrastructure/SocketManager";
import { canEdit } from "./membership";
import { registerDriveSource } from "./driveSources";
import { deleteFromGCS } from "./gcsUtils";
import { removeAppFiles } from "./appFiles";

export const XENNOTE_SOURCE = "xennote";

/** The people who can see this note: its owner for a loose note, else the notebook's members. */
async function audienceOf(note: { owner_id: string; notebook_id?: unknown }): Promise<string[]> {
  if (!note.notebook_id) return [note.owner_id];
  const notebook = await XenNotebook.findById(note.notebook_id, "members").lean();
  return notebook ? notebook.members.map((m) => m.user_id) : [note.owner_id];
}

registerDriveSource(XENNOTE_SOURCE, {
  label: "XenNote",
  // Exempt from the quota for now, like every app's files. Intended rule: a note in a shared notebook stays exempt.
  counts: async () => false,
  // May this person add photos to the note? Its owner (loose note) or an editor of its notebook.
  verify: async (userId, ref) => {
    if (!Types.ObjectId.isValid(ref)) return false;
    const note = await XenNote.findById(ref, "owner_id notebook_id").lean();
    if (!note) return false;
    if (!note.notebook_id) return note.owner_id === userId;
    const notebook = await XenNotebook.findById(note.notebook_id, "members").lean();
    return !!notebook && canEdit(notebook, userId);
  },
  describe: async (userId, refs) => {
    const valid = refs.filter((r) => Types.ObjectId.isValid(r));
    const notes =
      valid.length > 0 ? await XenNote.find({ _id: { $in: valid } }, "owner_id notebook_id title").lean() : [];
    const books = await XenNotebook.find(
      { _id: { $in: notes.flatMap((n) => (n.notebook_id ? [n.notebook_id] : [])) }, "members.user_id": userId },
      "_id",
    ).lean();
    const visibleBooks = new Set(books.map((b) => String(b._id)));
    const names = new Map(
      notes
        .filter((n) => (n.notebook_id ? visibleBooks.has(String(n.notebook_id)) : n.owner_id === userId))
        .map((n) => [String(n._id), n.title?.trim() || "Untitled note"]),
    );
    // A note the person can no longer see (or that was deleted) keeps its photos until they delete them.
    return new Map(refs.map((ref) => [ref, names.get(ref) ?? "A note you can't see anymore"]));
  },
  // The person deleted the photo from XenDrive: take it off the note, so it doesn't show a broken image.
  onRemoved: async (ref, fileIds) => {
    if (!Types.ObjectId.isValid(ref)) return;
    const note = await XenNote.findOneAndUpdate(
      { _id: ref },
      { $pull: { images: { file_id: { $in: fileIds.map((id) => new Types.ObjectId(id)) } } } },
      { projection: { owner_id: 1, notebook_id: 1 } },
    ).lean();
    if (note) SocketManager.getInstance().notifyXenNoteUpdate(await audienceOf(note));
  },
});

type Photo = { file_id?: unknown; gcs_path?: string | null };

/** Delete photos from storage: XenDrive files, and any older photo that hasn't been migrated yet. */
export async function removeNotePhotos(images: Photo[]): Promise<void> {
  const fileIds = images.filter((i) => i.file_id).map((i) => String(i.file_id));
  const legacy = images.filter((i) => !i.file_id && i.gcs_path).map((i) => i.gcs_path as string);
  await Promise.all([
    removeAppFiles(fileIds),
    ...legacy.map((path) => deleteFromGCS(path, true).catch(() => undefined)),
  ]);
}
