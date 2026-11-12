/** A file in the drive, as the owner sees it. */
export interface XenDriveFile {
  _id: string;
  name: string; // What people see (the original file name)
  folder_id: string | null; // null = the top level
  mimeType: string;
  size: number; // bytes
  createdAt: string; // ISO string
  shareToken?: string; // the file's own public link
  hasPassword?: boolean;
  password?: string | null; // plain text, shown to the owner only
  expiry?: string | null; // ISO string or null
}

export interface XenDriveFolder {
  _id: string;
  name: string;
  parent_id: string | null;
  shared: boolean;
  shareToken: string | null; // set while the folder's public link is on
  created_at: string;
}

export interface Crumb {
  _id: string;
  name: string;
}

/** What is in one folder (or the search results across the whole drive). */
export interface BrowseResult {
  folder: Crumb | null;
  breadcrumb: Crumb[];
  folders: XenDriveFolder[];
  files: XenDriveFile[];
  searching: boolean;
}

export interface FolderStats {
  folders: number;
  files: number;
  size: number;
}

/** A shared folder as the public sees it (no owner details, nothing above the shared folder). */
export interface PublicFolderView {
  root: Crumb;
  folder: Crumb;
  breadcrumb: Crumb[];
  folders: Crumb[];
  files: Array<{ _id: string; name: string; mimeType: string; size: number; createdAt: string }>;
}
