/** A file in the drive, as the owner sees it. */
export interface XenDriveFile {
  _id: string;
  name: string; // What people see (the original file name)
  folder_id: string | null; // null = the top level
  mimeType: string;
  size: number; // bytes
  createdAt: string; // ISO string
  shared: boolean; // the file's own link is on
  shareToken?: string; // the file's link (works only while `shared`)
  hasPassword?: boolean;
  password?: string | null; // plain text, shown to the owner only
  expiry?: string | null; // ISO string or null
  /** A picture link for image files, when the list was asked for thumbnails. */
  previewUrl?: string | null;
}

export interface XenDriveFolder {
  _id: string;
  name: string;
  parent_id: string | null;
  itemCount: number; // files and folders directly inside
  shared: boolean;
  shareToken: string | null; // set while the folder's public link is on
  created_at: string;
}

export interface Crumb {
  _id: string;
  name: string;
}

/** Which way of looking at the drive a listing is. */
export type BrowseView = "folder" | "shared" | "recent" | "search";

/** What is in one folder, or across the drive for the shared / recent / search views. */
export interface BrowseResult {
  folder: Crumb | null;
  breadcrumb: Crumb[];
  folders: XenDriveFolder[];
  files: XenDriveFile[];
  searching: boolean;
  view: BrowseView;
}

export interface FolderStats {
  folders: number;
  files: number;
  size: number;
}

export interface FileNeighbors {
  /** This file's place in the folder, 1-based. */
  index: number;
  total: number;
  prev: { _id: string; name: string } | null;
  next: { _id: string; name: string } | null;
}

export interface FileDetailResult {
  file: XenDriveFile;
  breadcrumb: Crumb[];
  neighbors: FileNeighbors;
  /** A short-lived link to show the file in the page, for images, PDFs, video and audio. */
  previewUrl: string | null;
}

/** A shared folder as the public sees it (no owner details, nothing above the shared folder). */
export interface PublicFolderView {
  root: Crumb;
  folder: Crumb;
  breadcrumb: Crumb[];
  folders: Crumb[];
  files: Array<{
    _id: string;
    name: string;
    mimeType: string;
    size: number;
    createdAt: string;
    previewUrl: string | null;
  }>;
}
