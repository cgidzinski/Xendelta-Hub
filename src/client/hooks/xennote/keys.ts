import type { NoteFilters } from "../../types/XenNote";

export const xennoteKeys = {
  all: ["xennote"] as const,
  notes: (filters?: NoteFilters) => [...xennoteKeys.all, "notes", filters ?? {}] as const,
  /** Every notes query, whatever the filters (to refetch the open board). */
  notesAll: () => [...xennoteKeys.all, "notes"] as const,
  notebooks: () => [...xennoteKeys.all, "notebooks"] as const,
  /** The notes that link to one note with [[its title]]. */
  backlinks: (noteId: string) => [...xennoteKeys.all, "backlinks", noteId] as const,
  counts: () => [...xennoteKeys.all, "counts"] as const,
  /** Who one note is open to. */
  sharing: (noteId: string) => [...xennoteKeys.all, "sharing", noteId] as const,
  trash: () => [...xennoteKeys.all, "trash"] as const,
  versions: (noteId: string) => [...xennoteKeys.all, "versions", noteId] as const,
  version: (noteId: string, versionId: string) => [...xennoteKeys.all, "version", noteId, versionId] as const,
  labels: () => [...xennoteKeys.all, "labels"] as const,
  publicNote: (token: string) => [...xennoteKeys.all, "public-note", token] as const,
  sharedLink: (kind: string, token: string) => [...xennoteKeys.all, "shared-link", kind, token] as const,
  /** A notebook's sections and the pages in them (no bodies). */
  tree: (notebookId: string) => [...xennoteKeys.all, "tree", notebookId] as const,
  /** One page with its text. */
  page: (pageId: string) => [...xennoteKeys.all, "page", pageId] as const,
  /** What a link to one page should show (its name, or that it is locked). */
  peek: (pageId: string) => [...xennoteKeys.all, "peek", pageId] as const,
  peekAll: () => [...xennoteKeys.all, "peek"] as const,
  /** The pages that link to one page, and those that only mention it. */
  pageBacklinks: (pageId: string) => [...xennoteKeys.all, "page-backlinks", pageId] as const,
  pageUnlinked: (pageId: string) => [...xennoteKeys.all, "page-unlinked", pageId] as const,
  /** Page search, by text, notebook and tag. */
  pageSearch: (q: string, notebook?: string, tag?: string) =>
    [...xennoteKeys.all, "page-search", q, notebook ?? "", tag ?? ""] as const,
  /** What was deleted from a notebook's sections and pages. */
  notebookTrash: (notebookId: string) => [...xennoteKeys.all, "notebook-trash", notebookId] as const,
  pageHistory: (id: string) => [...xennoteKeys.all, "page-history", id] as const,
  pageVersion: (id: string, version: string) => [...xennoteKeys.all, "page-version", id, version] as const,
  pagePeople: (pageId: string) => [...xennoteKeys.all, "page-people", pageId] as const,
  sharedItems: () => [...xennoteKeys.all, "shared-items"] as const,
  publicPage: (token: string, pageId?: string) => [...xennoteKeys.all, "public-page", token, pageId ?? ""] as const,
  publicNotebook: (token: string) => [...xennoteKeys.all, "public-notebook", token] as const,
};
