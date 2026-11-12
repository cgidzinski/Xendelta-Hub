export const xendriveKeys = {
  all: ["xendrive"] as const,
  /** One folder's contents (omit for the top level), or search results when `search` is given. */
  browse: (folderId?: string | null, search?: string) =>
    [...xendriveKeys.all, "browse", folderId ?? null, search ?? ""] as const,
  /** Everything under `browse`, to refetch whatever folder is open. */
  browseAll: () => [...xendriveKeys.all, "browse"] as const,
  file: (fileId: string | undefined) => [...xendriveKeys.all, "file", fileId] as const,
  folderStats: (folderId: string) => [...xendriveKeys.all, "folder-stats", folderId] as const,
  recent: () => [...xendriveKeys.all, "recent"] as const,
  publicFolder: (token: string, folderId?: string | null) =>
    [...xendriveKeys.all, "public-folder", token, folderId ?? null] as const,
};
