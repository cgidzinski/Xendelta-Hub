import type { BrowseView } from "../../types/XenDriveFile";

export const xendriveKeys = {
  all: ["xendrive"] as const,
  /**
   * One listing: a folder (omit for the top level), the shared or recent views, or search results.
   * `thumbs` is part of the key because the grid asks for picture links and the list does not; `source` because files
   * apps stored for the person only show when asked for.
   */
  browse: (folderId?: string | null, search?: string, view?: BrowseView, thumbs?: boolean, source?: string) =>
    [...xendriveKeys.all, "browse", folderId ?? null, search ?? "", view ?? "folder", !!thumbs, source ?? ""] as const,
  /** Everything under `browse`, to refetch whatever is open. */
  browseAll: () => [...xendriveKeys.all, "browse"] as const,
  file: (fileId: string | undefined) => [...xendriveKeys.all, "file", fileId] as const,
  folderStats: (folderId: string) => [...xendriveKeys.all, "folder-stats", folderId] as const,
  recent: () => [...xendriveKeys.all, "recent"] as const,
  /** What apps have stored in the drive (XenDrive > From apps). */
  appFiles: () => [...xendriveKeys.all, "app-files"] as const,
  // The password (when the link has one) is part of the key so a corrected one fetches again instead of reusing the error.
  publicFolder: (token: string, folderId?: string | null, password?: string) =>
    [...xendriveKeys.all, "public-folder", token, folderId ?? null, ...(password ? [password] : [])] as const,
  publicFolderInfo: (token: string) => [...xendriveKeys.all, "public-folder-info", token] as const,
};
