import { XenNote } from "../models/xenNote";
import { removeNotePhotos } from "./xenNoteFiles";
import { trashCutoff } from "./softDelete";
import { removeVersionsOf } from "./xenNoteVersions";

type Doc = InstanceType<typeof XenNote>;

/** Remove trashed notes for good: their photos go, then the notes. Returns how many were removed. */
export async function deleteNotesForever(notes: Doc[]): Promise<number> {
  for (const note of notes) {
    await removeNotePhotos(note.images).catch((e) => console.error("xennote photo cleanup failed:", e));
    await note.deleteOne();
  }
  await removeVersionsOf(notes.map((n) => n._id)).catch((e) => console.error("xennote history cleanup failed:", e));
  return notes.length;
}

/** The daily purge: notes that have been in the Trash for 30 days. */
export async function purgeExpiredNotes(now = new Date()): Promise<number> {
  const old = await XenNote.find({ deleted_at: { $lte: trashCutoff(now) } })
    .setOptions({ includeDeleted: true })
    .limit(500);
  return deleteNotesForever(old);
}
