import {
  checklistToText,
  normalizeLabels,
  textToChecklist,
  type NoteColor,
  type NoteType,
} from "@shared/xennote/notes";
import type { XenNote, XenNoteInput, XenNoteItem, XenNoteLink } from "../../../types/XenNote";

// The values of the note editor, and the pure helpers around them (what the tests cover).

export interface NoteDraft {
  type: NoteType;
  title: string;
  body: string;
  checklist: XenNoteItem[];
  link: XenNoteLink;
  color: NoteColor;
  pinned: boolean;
  archived: boolean;
  labels: string[];
  notebook_id: string | null;
  /** Photos chosen for a note that has not been saved yet; uploaded right after it is created. */
  pendingImages: File[];
}

export const emptyLink = (): XenNoteLink => ({ url: "", title: "", description: "" });

export const emptyDraft = (overrides: Partial<NoteDraft> = {}): NoteDraft => ({
  type: "text",
  title: "",
  body: "",
  checklist: [],
  link: emptyLink(),
  color: "default",
  pinned: false,
  archived: false,
  labels: [],
  notebook_id: null,
  pendingImages: [],
  ...overrides,
});

export const draftFromNote = (note: XenNote): NoteDraft => ({
  type: note.type,
  title: note.title,
  body: note.body,
  checklist: note.checklist.map((c) => ({ ...c })),
  link: { ...note.link },
  color: note.color,
  pinned: note.pinned,
  archived: note.archived,
  labels: [...note.labels],
  notebook_id: note.notebook_id,
  pendingImages: [],
});

/**
 * Switch a note's type without losing what was written. Text and checklist convert into each other
 * (lines become items, items become lines); everything else just changes the view.
 */
export function changeType(draft: NoteDraft, type: NoteType): NoteDraft {
  if (type === draft.type) return draft;
  const next = { ...draft, type };
  if (draft.type === "text" && type === "checklist") {
    next.checklist = textToChecklist(draft.body);
    next.body = "";
  } else if (draft.type === "checklist" && type === "text") {
    next.body = checklistToText(draft.checklist);
    next.checklist = [];
  }
  return next;
}

/** True when there is nothing worth saving: a note you opened and closed without typing. */
export function isEmptyDraft(d: NoteDraft): boolean {
  return (
    !d.title.trim() &&
    !d.body.trim() &&
    d.checklist.every((i) => !i.text.trim()) &&
    !d.link.url.trim() &&
    !d.link.title.trim() &&
    !d.link.description.trim() &&
    d.pendingImages.length === 0
  );
}

/** What is sent to the server: only what belongs to the note's type. */
export function toInput(d: NoteDraft): XenNoteInput {
  const base: XenNoteInput = {
    type: d.type,
    title: d.title,
    color: d.color,
    pinned: d.pinned,
    archived: d.archived,
    labels: normalizeLabels(d.labels),
    notebook_id: d.notebook_id,
  };
  if (d.type === "checklist") return { ...base, body: "", checklist: d.checklist.filter((i) => i.text.trim()) };
  if (d.type === "link") return { ...base, body: "", link: d.link };
  return { ...base, body: d.body };
}

/** Whether two drafts differ in what would be saved (photos still waiting to upload count by number). */
export function isDirty(a: NoteDraft, b: NoteDraft): boolean {
  return (
    JSON.stringify({ ...a, pendingImages: a.pendingImages.length }) !==
    JSON.stringify({ ...b, pendingImages: b.pendingImages.length })
  );
}

/** The web address's host, for showing a link note compactly. Falls back to the raw text. */
export function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Move checklist item `from` to position `to` (drag to reorder). Out-of-range moves change nothing. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Ticked items out of those with text, for the card's progress bar. */
export function checklistProgress(items: Array<{ text: string; done: boolean }>): { done: number; total: number } {
  const real = items.filter((i) => i.text.trim());
  return { done: real.filter((i) => i.done).length, total: real.length };
}

/** What the board's filter chips narrow to. Photos and links are not note types: they are found in the note. */
export type NoteKind = "all" | "notes" | "lists" | "photos" | "links";

const URL_IN_TEXT = /https?:\/\/\S+/i;

export function matchesKind(
  note: {
    type: string;
    body: string;
    checklist: ReadonlyArray<{ text: string }>;
    images: ReadonlyArray<unknown>;
  },
  kind: NoteKind,
): boolean {
  switch (kind) {
    case "all":
      return true;
    case "lists":
      return note.type === "checklist";
    case "notes":
      return note.type !== "checklist";
    case "photos":
      return note.images.length > 0;
    case "links":
      return (
        note.type === "link" || URL_IN_TEXT.test(note.body) || note.checklist.some((i) => URL_IN_TEXT.test(i.text))
      );
  }
}

/** Split text into plain pieces and web addresses (trailing punctuation stays outside the address). */
export function splitLinks(text: string): Array<{ text: string; url?: string }> {
  const parts: Array<{ text: string; url?: string }> = [];
  const re = /https?:\/\/[^\s<>"']+/gi;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const start = m.index ?? 0;
    const url = m[0].replace(/[.,;:!?)\]]+$/, "");
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: url, url });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}
