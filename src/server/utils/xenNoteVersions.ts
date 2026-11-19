import { XenNote, XenNoteVersion } from "../models/xenNote";

// A note's version history. Before an edit changes what a note says (its title, text, checklist or link), the content it
// had is kept. Editing autosaves as you type, so a version is only kept when the newest one is older than
// VERSION_GAP_MS (otherwise a few minutes of typing would use up every slot), and at most MAX_VERSIONS are kept.
// Colour, labels, pinning and archiving are not content and keep nothing.

export const MAX_VERSIONS = 20;
export const VERSION_GAP_MS = 10 * 60 * 1000;

type NoteDoc = InstanceType<typeof XenNote>;
type Content = Pick<NoteDoc, "type" | "title" | "body"> & {
  checklist: Array<{ text: string; done: boolean }>;
  link?: { url?: string | null; title?: string | null; description?: string | null } | null;
};

/** What a note says right now, as plain data (checklist ids and ticks are not part of the wording). */
export function contentOf(note: NoteDoc | Content): Content {
  return {
    type: note.type,
    title: note.title,
    body: note.body,
    checklist: note.checklist.map((c) => ({ text: c.text ?? "", done: !!c.done })),
    link: { url: note.link?.url ?? "", title: note.link?.title ?? "", description: note.link?.description ?? "" },
  };
}

/** Whether two states of a note say different things. */
export function contentChanged(a: NoteDoc | Content, b: NoteDoc | Content): boolean {
  return JSON.stringify(contentOf(a)) !== JSON.stringify(contentOf(b));
}

/**
 * Keep `before` (how the note stood, last saved at `at` by `by`) as a version, unless the newest one is recent enough
 * to stand in for it. `force` skips that wait (restoring a version keeps what it replaced). Then trims to MAX_VERSIONS.
 */
export async function keepVersion(
  noteId: unknown,
  before: Content,
  at: Date,
  by: string | null,
  force = false,
): Promise<boolean> {
  if (!force) {
    const newest = await XenNoteVersion.findOne({ note_id: noteId }, "captured_at").sort({ captured_at: -1 }).lean();
    if (newest && Date.now() - newest.captured_at.getTime() < VERSION_GAP_MS) return false;
  }
  await XenNoteVersion.create({ note_id: noteId, at, by, ...contentOf(before) });
  const extra = await XenNoteVersion.find({ note_id: noteId }, "_id")
    .sort({ captured_at: -1 })
    .skip(MAX_VERSIONS)
    .lean();
  if (extra.length > 0) await XenNoteVersion.deleteMany({ _id: { $in: extra.map((v) => v._id) } });
  return true;
}

/** Remove the history of notes that are gone for good. */
export async function removeVersionsOf(noteIds: unknown[]): Promise<void> {
  if (noteIds.length > 0) await XenNoteVersion.deleteMany({ note_id: { $in: noteIds } });
}
