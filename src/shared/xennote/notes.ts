// What a XenNote note is, shared by the server (validation, storage) and the client (editor, board).
//
// A note has a `type`, and every type shares colour, pin, archive, labels and the notebook it lives in:
//   text       a title and some text
//   checklist  a title and items you tick off (the ticks are saved)
//   image      one or more photos and optional text
//   link       a web address with a title and a description you write (the server never fetches the page)

export const NOTE_TYPES = ["text", "checklist", "image", "link"] as const;
export type NoteType = (typeof NOTE_TYPES)[number];

/** Colour names, not hex: the client tints each with a theme colour so they work in light and dark. */
export const NOTE_COLORS = ["default", "red", "orange", "green", "teal", "blue", "purple"] as const;
export type NoteColor = (typeof NOTE_COLORS)[number];

export const MAX_TITLE = 200;
export const MAX_BODY = 20_000;
export const MAX_CHECKLIST_ITEMS = 200;
export const MAX_CHECKLIST_TEXT = 500;
export const MAX_LABELS = 10;
export const MAX_LABEL_LENGTH = 30;
export const MAX_NOTE_IMAGES = 10;
export const MAX_URL_LENGTH = 2000;
export const MAX_NOTEBOOKS_OWNED = 30;
export const MAX_NOTEBOOK_PEOPLE = 50;

export interface ChecklistItem {
  text: string;
  done: boolean;
}

/** A label as stored: trimmed, inner spaces collapsed, cut to the limit. Empty means "not a label". */
export function normalizeLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, MAX_LABEL_LENGTH);
}

/** Normalise a list of labels: drop empties, drop repeats (ignoring case), keep the first spelling, cap the count. */
export function normalizeLabels(raw: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const label of raw) {
    const clean = normalizeLabel(label);
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length === MAX_LABELS) break;
  }
  return out;
}

/** Only web addresses: `javascript:`, `data:` and the like must never become a clickable link. */
export function isSafeUrl(value: string): boolean {
  if (value.length > MAX_URL_LENGTH) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Turning a text note into a checklist: each non-empty line becomes an item. */
export function textToChecklist(text: string): ChecklistItem[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\[[ xX]?\])\s*/, "").trim())
    .filter(Boolean)
    .slice(0, MAX_CHECKLIST_ITEMS)
    .map((text) => ({ text: text.slice(0, MAX_CHECKLIST_TEXT), done: false }));
}

/** Turning a checklist back into text: one line per item, ticked ones marked so nothing is lost. */
export function checklistToText(items: readonly ChecklistItem[]): string {
  return items.map((i) => (i.done ? `[x] ${i.text}` : i.text)).join("\n");
}
