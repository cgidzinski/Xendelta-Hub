// XenNote photos and attachments are files tagged `source: { app: "xennote", ref: <id> }` (utils/appFiles.ts). The ref is
// the note or the page, not its notebook, because they can move between notebooks and their files go with them. A page
// keeps the id of the note it was made from, so the two never collide.

import { Types } from "mongoose";
import { XenNote, XenNotebook } from "../models/xenNote";
import { XenNotePage } from "../models/xenNotePage";
import { SocketManager } from "../infrastructure/SocketManager";
import { canEdit } from "./membership";
import { registerDriveSource } from "./driveSources";
import { deleteFromStorage } from "./storageUtils";
import { removeAppFiles } from "./appFiles";

export const XENNOTE_SOURCE = "xennote";

registerDriveSource(XENNOTE_SOURCE, {
  label: "XenNote",
  verify: async (userId, ref) => {
    if (!Types.ObjectId.isValid(ref)) return false;
    const note = await XenNote.findById(ref, "owner_id").lean();
    if (note) return note.owner_id === userId;
    const page = await XenNotePage.findById(ref, "notebook_id").lean();
    const notebook = page ? await XenNotebook.findById(page.notebook_id, "members").lean() : null;
    return !!notebook && canEdit(notebook, userId);
  },
  describe: async (userId, refs) => {
    const valid = refs.filter((r) => Types.ObjectId.isValid(r));
    const notes = await XenNote.find({ _id: { $in: valid }, owner_id: userId }, "title").lean();
    const names = new Map(notes.map((note) => [String(note._id), note.title?.trim() || "Untitled note"]));
    // Pages are visible through notebook membership.
    const pages = valid.length > 0 ? await XenNotePage.find({ _id: { $in: valid } }, "notebook_id title").lean() : [];
    const pageBooks = new Set(
      (
        await XenNotebook.find(
          { _id: { $in: pages.map((p) => p.notebook_id) }, "members.user_id": userId },
          "_id",
        ).lean()
      ).map((b) => String(b._id)),
    );
    for (const page of pages) {
      if (pageBooks.has(String(page.notebook_id))) names.set(String(page._id), page.title?.trim() || "Untitled page");
    }
    // A note or page the person can no longer see (or that was deleted) keeps its files until they delete them.
    return new Map(refs.map((ref) => [ref, names.get(ref) ?? "A note you can't see anymore"]));
  },
  // The person deleted the photo from XenDrive: take it off the note, so it doesn't show a broken image.
  onRemoved: async (ref, fileIds) => {
    if (!Types.ObjectId.isValid(ref)) return;
    const note = await XenNote.findOneAndUpdate(
      { _id: ref },
      { $pull: { images: { file_id: { $in: fileIds.map((id) => new Types.ObjectId(id)) } } } },
      { projection: { owner_id: 1, "members.user_id": 1 } },
    ).lean();
    if (note) {
      SocketManager.getInstance().notifyXenNoteUpdate([note.owner_id, ...note.members.map((member) => member.user_id)]);
      return;
    }
    // A page: stop counting the file as shown on it. Its block stays in the text and shows "File removed"; the next save
    // drops the file from the block, because it no longer belongs to the page.
    const page = await XenNotePage.findOneAndUpdate(
      { _id: ref },
      { $pull: { files: { $in: fileIds.map((id) => new Types.ObjectId(id)) } } },
      { projection: { notebook_id: 1 } },
    ).lean();
    if (page) {
      const notebook = await XenNotebook.findById(page.notebook_id, "members").lean();
      if (notebook) {
        SocketManager.getInstance().notifyXenNoteNotebookUpdate(
          notebook.members.map((m) => m.user_id),
          String(page.notebook_id),
        );
      }
    }
  },
});

type Photo = { file_id?: unknown; gcs_path?: string | null };

/** Delete photos from storage: XenDrive files, and any older photo that hasn't been migrated yet. */
export async function removeNotePhotos(images: Photo[]): Promise<void> {
  const fileIds = images.filter((i) => i.file_id).map((i) => String(i.file_id));
  const legacy = images.filter((i) => !i.file_id && i.gcs_path).map((i) => i.gcs_path as string);
  await Promise.all([
    removeAppFiles(fileIds),
    ...legacy.map((path) => deleteFromStorage(path, true).catch(() => undefined)),
  ]);
}
