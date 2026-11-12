import type { XenDriveFile } from "../../../../types/XenDriveFile";
import { fileKindOf, type FileKind } from "./fileKind";

// The Type and Link chips above the list. They narrow what is already on screen.

export type TypeFilter = "all" | "image" | "pdf" | "archive" | "text" | "other";
export type LinkFilter = "all" | "shared" | "password" | "expiring";

export const TYPE_FILTERS: Array<{ value: TypeFilter; label: string }> = [
  { value: "all", label: "Any type" },
  { value: "image", label: "Images" },
  { value: "pdf", label: "PDFs" },
  { value: "archive", label: "Archives" },
  { value: "text", label: "Text" },
  { value: "other", label: "Other" },
];

export const LINK_FILTERS: Array<{ value: LinkFilter; label: string }> = [
  { value: "all", label: "Any link" },
  { value: "shared", label: "Link on" },
  { value: "password", label: "Has a password" },
  { value: "expiring", label: "Expires soon" },
];

/** "Expires soon" means within a week and not already over. */
const SOON_MS = 7 * 24 * 60 * 60 * 1000;

const matchesType = (kind: FileKind, type: TypeFilter): boolean => {
  if (type === "all") return true;
  if (type === "other") return kind === "file" || kind === "video" || kind === "audio";
  return kind === type;
};

export function matchesLink(file: XenDriveFile, link: LinkFilter, now: Date = new Date()): boolean {
  if (link === "all") return true;
  if (link === "shared") return file.shared;
  if (link === "password") return !!file.hasPassword;
  if (!file.expiry) return false;
  const left = new Date(file.expiry).getTime() - now.getTime();
  return left > 0 && left <= SOON_MS;
}

export function applyFilters(
  files: XenDriveFile[],
  filters: { type: TypeFilter; link: LinkFilter },
  now: Date = new Date(),
): XenDriveFile[] {
  if (filters.type === "all" && filters.link === "all") return files;
  return files.filter((f) => matchesType(fileKindOf(f.mimeType), filters.type) && matchesLink(f, filters.link, now));
}

/** Filters only narrow files: a folder has no type or link status of its own, so folders hide while one is on. */
export const filtersActive = (filters: { type: TypeFilter; link: LinkFilter }) =>
  filters.type !== "all" || filters.link !== "all";
