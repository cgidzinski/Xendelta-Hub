// [[Note title]] links between notes, shared by the server (which notes link here) and the client (rendering them, and
// suggesting titles while typing). A link names a note by its title: `[[Groceries]]`, or `[[Groceries|the shopping list]]`
// to show different words. Titles aren't unique, so a link means the most recently changed visible note with that title.

/** One [[title]] or [[title|label]]. Titles and labels can't contain brackets, a line break, or (for the title) a "|". */
export const WIKI_LINK = /\[\[([^[\]\n|]{1,200}?)(?:\|([^[\]\n]{1,200}?))?\]\]/g;

/** A title compared loosely: trimmed, runs of spaces collapsed, case ignored. */
export const normalizeTitle = (title: string) => title.trim().replace(/\s+/g, " ").toLowerCase();

export interface WikiLink {
  title: string;
  label: string;
}

/** Every [[link]] in some text, in order (a repeated one is listed each time). */
export function wikiLinksIn(text: string): WikiLink[] {
  const out: WikiLink[] = [];
  for (const m of text.matchAll(WIKI_LINK)) {
    const title = m[1].trim();
    if (title) out.push({ title, label: (m[2] ?? m[1]).trim() || title });
  }
  return out;
}

/** True when `text` has a [[link]] to a note with this title. */
export function linksTo(text: string, title: string): boolean {
  const want = normalizeTitle(title);
  return !!want && wikiLinksIn(text).some((l) => normalizeTitle(l.title) === want);
}

/**
 * If the caret is inside an unfinished `[[...` (no closing brackets yet), what has been typed after the brackets, and
 * where the link starts. Otherwise null. Used to suggest titles while typing.
 */
export function openWikiLink(text: string, caret: number): { query: string; start: number } | null {
  const before = text.slice(0, caret);
  const start = before.lastIndexOf("[[");
  if (start === -1) return null;
  const typed = before.slice(start + 2);
  // Closed already, spans a line, or has gone past a title's length: not completing a link.
  if (typed.includes("]") || typed.includes("[") || typed.includes("\n") || typed.length > 200) return null;
  if (typed.includes("|")) return null; // choosing a label now, not a title
  return { query: typed, start };
}

/** Finish an open `[[` at the caret with this title: replaces what was typed, adds the closing brackets. */
export function completeWikiLink(text: string, caret: number, title: string): { text: string; caret: number } | null {
  const open = openWikiLink(text, caret);
  if (!open) return null;
  const clean = title
    .replace(/[[\]|\n]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Text after the caret that already closes the link ("]]") is replaced rather than doubled.
  const after = text.slice(caret).replace(/^\]{0,2}/, "");
  const inserted = `[[${clean}]]`;
  return { text: text.slice(0, open.start) + inserted + after, caret: open.start + inserted.length };
}
