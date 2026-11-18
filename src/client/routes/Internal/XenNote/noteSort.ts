import type { XenNote } from "../../../types/XenNote";

export type NoteSort = "edited" | "created" | "title";

export const NOTE_SORTS: Array<{ value: NoteSort; label: string }> = [
  { value: "edited", label: "Last edited" },
  { value: "created", label: "Date created" },
  { value: "title", label: "Title A–Z" },
];

export const isNoteSort = (v: unknown): v is NoteSort => NOTE_SORTS.some((s) => s.value === v);

const time = (iso: string) => new Date(iso).getTime() || 0;

/** The board's order. "edited" is how the server already sends them; untitled notes go last when sorting by title. */
export function sortNotes(notes: XenNote[], sort: NoteSort): XenNote[] {
  const out = [...notes];
  if (sort === "created") return out.sort((a, b) => time(b.created_at) - time(a.created_at));
  if (sort === "title")
    return out.sort((a, b) => {
      const x = a.title.trim();
      const y = b.title.trim();
      if (!x !== !y) return x ? -1 : 1;
      return x.localeCompare(y, undefined, { numeric: true, sensitivity: "base" });
    });
  return out.sort((a, b) => time(b.updated_at) - time(a.updated_at));
}
