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
  trash: () => [...xennoteKeys.all, "trash"] as const,
  versions: (noteId: string) => [...xennoteKeys.all, "versions", noteId] as const,
  version: (noteId: string, versionId: string) => [...xennoteKeys.all, "version", noteId, versionId] as const,
  labels: () => [...xennoteKeys.all, "labels"] as const,
  publicNote: (token: string) => [...xennoteKeys.all, "public-note", token] as const,
  publicNotebook: (token: string) => [...xennoteKeys.all, "public-notebook", token] as const,
};
