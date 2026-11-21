import type { PageTreeEntry, XenNoteSection } from "../../../../types/XenNotePage";

// Turning a notebook's flat list of pages into what the screen draws, and working out where a move puts a page. The
// server keeps pages in order by a key; these helpers only ever compare keys, never make them.

/** Pages in display order: by key, then by id so two equal keys (made at the same moment) still have one order. */
export const byOrder = (a: { order: string; id: string }, b: { order: string; id: string }): number =>
  a.order < b.order ? -1 : a.order > b.order ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** What to show for a page with no title. */
export const pageTitle = (title: string): string => title.trim() || "Untitled";

/** The pages of a section in display order. */
export function pagesInSection(pages: PageTreeEntry[], sectionId: string, includeArchived = false): PageTreeEntry[] {
  return pages.filter((page) => page.section_id === sectionId && (includeArchived || !page.archived)).sort(byOrder);
}

export type PageDrop = { id: string; edge: "before" | "after" };

/** The API position for a drop, or null if the page would stay in the same spot. */
export function pageDropPosition(ids: string[], source: string, target: PageDrop) {
  const from = ids.indexOf(source);
  const anchor = ids.indexOf(target.id);
  if (from < 0 || anchor < 0 || from === anchor) return null;
  if (target.edge === "before") return from === anchor - 1 ? null : { before: target.id };
  return from === anchor + 1 ? null : { after: target.id };
}

/**
 * The section to show: the one holding the open page, else the one already chosen if it still exists, else the first.
 * Null when the notebook has no sections yet.
 */
export function activeSectionId(
  sections: XenNoteSection[],
  pages: PageTreeEntry[],
  openPageId: string | undefined,
  chosen: string | null,
): string | null {
  const open = openPageId ? pages.find((p) => p.id === openPageId) : undefined;
  if (open && sections.some((s) => s.id === open.section_id)) return open.section_id;
  if (chosen && sections.some((s) => s.id === chosen)) return chosen;
  return sections[0]?.id ?? null;
}
