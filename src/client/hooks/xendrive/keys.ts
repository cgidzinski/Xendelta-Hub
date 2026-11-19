import type { BrowseView } from "../../types/XenDriveFile";

export const xendriveKeys = {
  all: ["xendrive"] as const,
  /** One listing: a folder (omit for the top level), the shared or recent views, or search results. */
  browse: (folderId?: string | null, search?: string, view?: BrowseView) =>
    [...xendriveKeys.all, "browse", folderId ?? null, search ?? "", view ?? "folder"] as const,
  /** Everything under `browse`, to refetch whatever is open. */
  browseAll: () => [...xendriveKeys.all, "browse"] as const,
  file: (fileId: string | undefined) => [...xendriveKeys.all, "file", fileId] as const,
  folderStats: (folderId: string) => [...xendriveKeys.all, "folder-stats", folderId] as const,
  trash: () => [...xendriveKeys.all, "trash"] as const,
  recent: () => [...xendriveKeys.all, "recent"] as const,
  // The password (when the link has one) is part of the key so a corrected one fetches again instead of reusing the error.
  publicFolder: (token: string, folderId?: string | null, password?: string) =>
    [...xendriveKeys.all, "public-folder", token, folderId ?? null, ...(password ? [password] : [])] as const,
  publicFolderInfo: (token: string) => [...xendriveKeys.all, "public-folder-info", token] as const,
};
