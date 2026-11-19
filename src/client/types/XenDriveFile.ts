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
  hasPassword?: boolean; // there is one; it is stored as a hash and can't be shown
  expiry?: string | null; // ISO string or null
  /** Public downloads of this file (through its own link or a shared folder's). */
  downloads?: number;
  lastDownloadedAt?: string | null;
  /** A cacheable link to the small WebP beside the original, once the background job has made it. */
  thumbUrl?: string | null;
  /** Set when an app stored the file for the person (a photo on an expense, a chat attachment). */
  source?: { app: string; label: string } | null;
}

export interface XenDriveFolder {
  _id: string;
  name: string;
  parent_id: string | null;
  itemCount: number; // files and folders directly inside
  shared: boolean;
  shareToken: string | null; // set while the folder's public link is on
  hasPassword?: boolean; // the link has a password (stored as a hash, can't be shown)
  expiry?: string | null; // when the link stops working
  /** Files downloaded through the link. */
  downloads?: number;
  lastDownloadedAt?: string | null;
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
  /** For videos with a poster: the cacheable link the player shows before it plays. */
  posterUrl: string | null;
}

/** What a visitor learns about a folder link before opening it. */
export interface PublicFolderInfo {
  name: string;
  requiresPassword: boolean;
  expiry: string | null;
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
    thumbUrl: string | null;
  }>;
}

/** What apps have stored in the drive on the person's behalf (XenDrive > From apps). */
export interface AppFilesResult {
  count: number;
  size: number;
  apps: Array<{
    app: string;
    /** "Chat" */
    label: string;
    count: number;
    size: number;
    groups: Array<{
      /** Where the files came from (a conversation id for chat). */
      ref: string;
      /** "Weekend trip" */
      label: string;
      count: number;
      size: number;
      files: XenDriveFile[];
    }>;
  }>;
}

/** A file in the Trash: what it is, and when it goes for good. */
export interface TrashedXenDriveFile {
  _id: string;
  name: string;
  mimeType: string;
  size: number;
  deleted_at: string;
  purge_at: string;
}
