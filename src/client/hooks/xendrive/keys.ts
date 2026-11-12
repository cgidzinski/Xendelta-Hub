import type { BrowseView } from "../../types/XenDriveFile";

export const xendriveKeys = {
  all: ["xendrive"] as const,
  /**
   * One listing: a folder (omit for the top level), the shared or recent views, or search results.
   * `thumbs` is part of the key because the grid asks for picture links and the list does not.
   */
  browse: (folderId?: string | null, search?: string, view?: BrowseView, thumbs?: boolean) =>
    [...xendriveKeys.all, "browse", folderId ?? null, search ?? "", view ?? "folder", !!thumbs] as const,
  /** Everything under `browse`, to refetch whatever is open. */
  browseAll: () => [...xendriveKeys.all, "browse"] as const,
  file: (fileId: string | undefined) => [...xendriveKeys.all, "file", fileId] as const,
  folderStats: (folderId: string) => [...xendriveKeys.all, "folder-stats", folderId] as const,
  recent: () => [...xendriveKeys.all, "recent"] as const,
  publicFolder: (token: string, folderId?: string | null) =>
    [...xendriveKeys.all, "public-folder", token, folderId ?? null] as const,
};
