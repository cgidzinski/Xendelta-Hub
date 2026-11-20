import type { PageTreeEntry, XenNoteSection } from "../../../../types/XenNotePage";

// Turning a notebook's flat list of pages into what the screen draws, and working out where a move puts a page. The
// server keeps pages in order by a key; these helpers only ever compare keys, never make them.

export interface PageNode {
  page: PageTreeEntry;
  children: PageTreeEntry[];
}

/** Pages in display order: by key, then by id so two equal keys (made at the same moment) still have one order. */
export const byOrder = (a: { order: string; id: string }, b: { order: string; id: string }): number =>
  a.order < b.order ? -1 : a.order > b.order ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** What to show for a page with no title. */
export const pageTitle = (title: string): string => title.trim() || "Untitled";

/**
 * The top-level pages of a section, each with its sub-pages, in order. Archived pages are left out unless asked for
 * (an archived page takes its sub-pages with it).
 */
export function pageNodes(pages: PageTreeEntry[], sectionId: string, includeArchived = false): PageNode[] {
  const inSection = pages.filter((p) => p.section_id === sectionId && (includeArchived || !p.archived));
  const children = new Map<string, PageTreeEntry[]>();
  for (const p of inSection) {
    if (!p.parent_id) continue;
    children.set(p.parent_id, [...(children.get(p.parent_id) ?? []), p]);
  }
  return inSection
    .filter((p) => !p.parent_id)
    .sort(byOrder)
    .map((page) => ({ page, children: (children.get(page.id) ?? []).sort(byOrder) }));
}

/** The pages next to this one: the same section and the same parent, in order, this page included. */
export function siblingsOf(pages: PageTreeEntry[], page: PageTreeEntry): PageTreeEntry[] {
  return pages.filter((p) => p.section_id === page.section_id && p.parent_id === page.parent_id).sort(byOrder);
}

/** Where moving a page one place up or down among its siblings puts it, or null when it is already at that end. */
export function moveNeighbour(
  pages: PageTreeEntry[],
  page: PageTreeEntry,
  direction: "up" | "down",
): { before: string } | { after: string } | null {
  const list = siblingsOf(pages, page);
  const at = list.findIndex((p) => p.id === page.id);
  if (direction === "up") return at > 0 ? { before: list[at - 1].id } : null;
  return at !== -1 && at < list.length - 1 ? { after: list[at + 1].id } : null;
}

/** Which page is the previous top-level page of the same section: what "make it a sub-page" nests under. */
export function previousTopLevel(pages: PageTreeEntry[], page: PageTreeEntry): PageTreeEntry | null {
  if (page.parent_id) return null;
  const list = siblingsOf(pages, page);
  const at = list.findIndex((p) => p.id === page.id);
  return at > 0 ? list[at - 1] : null;
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
