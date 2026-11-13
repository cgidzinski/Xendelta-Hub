import type { ChangelogEntry } from "@shared/changelog";

// "New since you last looked": the page remembers the newest entry it showed (on this device). Entries are newest first, so
// everything above the remembered one is new. Someone who has never opened the page gets the dot but no "New" chips (it
// would label every entry).

export const SEEN_KEY = "whatsnew:seen";

/** A stable name for an entry (the date and title are unique enough). */
export const entryKey = (e: ChangelogEntry) => `${e.date}|${e.title}`;

/** How many entries are newer than the remembered one. null (never seen) counts as all of them, for the dot only. */
export function unseenCount(entries: ChangelogEntry[], seen: string | null): number {
  if (entries.length === 0) return 0;
  if (!seen) return entries.length;
  const at = entries.findIndex((e) => entryKey(e) === seen);
  return at === -1 ? entries.length : at;
}

/** Which entries get a "New" chip: those above the remembered one, and none for someone who has never looked. */
export function newKeys(entries: ChangelogEntry[], seen: string | null): Set<string> {
  if (!seen || !entries.some((e) => entryKey(e) === seen)) return new Set();
  return new Set(entries.slice(0, unseenCount(entries, seen)).map(entryKey));
}
