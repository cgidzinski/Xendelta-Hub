// What a notebook page is, shared by the server (validation, storage) and the client (editor, tree).
//
// A notebook holds sections, a section holds pages, and a page can hold sub-pages (one level only). A page's
// text lives in a separate body document (ProseMirror JSON); everything the tree and the graph need is
// derived from it and stored on the page itself, so listing pages never loads a body.

import { NOTE_COLORS } from "./notes";

/** Bump when the body's JSON shape changes. Stored on every body so old documents can be upgraded on read. */
export const PAGE_SCHEMA_VERSION = 1;

/** A normal section holds pages. A notebook has at most one journal and one templates section. */
export const SECTION_KINDS = ["normal", "journal", "templates"] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

/** Pages use the same colour names as notes. */
export const PAGE_COLORS = NOTE_COLORS;

export const MAX_SECTION_NAME = 60;
export const MAX_PAGE_TITLE = 200;
export const MAX_PAGE_ALIASES = 10;
export const MAX_PAGE_TAGS = 50;
export const MAX_TAG_LENGTH = 30;
export const MAX_PAGE_LINKS = 500;
export const MAX_PAGE_FILES = 200;
export const MAX_PAGE_PEOPLE = 50;
export const MAX_SECTIONS_PER_NOTEBOOK = 100;
export const MAX_PAGES_PER_NOTEBOOK = 5000;

/** Pages can have sub-pages, but a sub-page can't have its own. */
export const MAX_PAGE_DEPTH = 1;

/** The body's JSON, measured as UTF-8 bytes. A MongoDB document is capped at 16 MB; this leaves a wide margin. */
export const MAX_PAGE_DOC_BYTES = 1_000_000;
/** Plain text kept for search and for "mentions this page" lookups. */
export const MAX_SEARCH_TEXT = 100_000;
export const MAX_EXCERPT = 200;

/** Earlier versions kept per page, and how long a deleted page or section waits in the trash. */
export const MAX_PAGE_VERSIONS = 20;
export const PAGE_TRASH_DAYS = 30;

/** Any file type, up to this size (images and PDFs preview in the page). */
export const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;

/** `YYYY-MM-DD`: which day a journal page belongs to. */
export const JOURNAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isJournalDate(value: string): boolean {
  if (!JOURNAL_DATE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** A tag as stored: no leading "#", lower case, inner spaces and punctuation collapsed to "-", cut to the limit. */
export function normalizeTag(raw: string): string {
  return raw
    .trim()
    .replace(/^#+/, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}_/-]+/gu, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_TAG_LENGTH);
}

/** What the page tree needs for one page, never the body. */
export interface PageTreeEntry {
  id: string;
  section_id: string;
  parent_id: string | null;
  order: string;
  title: string;
  icon: string | null;
  color: string;
  archived: boolean;
  /** Whether the caller starred it (favourites are personal). */
  favorite: boolean;
  tags: string[];
  excerpt: string;
  journal_date: string | null;
  todo: { open: number; done: number };
  updated_at: string;
}
