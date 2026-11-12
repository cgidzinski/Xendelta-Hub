import { format, formatDistanceStrict, isSameDay, isSameYear, subDays } from "date-fns";

/** "Today, 9:41", "Yesterday", "Nov 3", or "Nov 3, 2025" for another year. */
export function formatModified(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (isSameDay(date, now)) return `Today, ${format(date, "h:mm a")}`;
  if (isSameDay(date, subDays(now, 1))) return "Yesterday";
  return format(date, isSameYear(date, now) ? "MMM d" : "MMM d, yyyy");
}

/** "Expires in 2 days", "Expired", or "No expiry". */
export function expiryLabel(expiry: string | null | undefined, now: Date = new Date()): string {
  if (!expiry) return "No expiry";
  const when = new Date(expiry);
  if (when <= now) return "Expired";
  return `Expires in ${formatDistanceStrict(when, now)}`;
}

/** The short form for a chip: "2 days". */
export function expiryShort(expiry: string, now: Date = new Date()): string {
  return formatDistanceStrict(new Date(expiry), now);
}

/** "Empty", "1 item", "9 items". */
export function itemCountLabel(count: number): string {
  if (count === 0) return "Empty";
  return count === 1 ? "1 item" : `${count} items`;
}

/** "3 folders and 82 files", or "no files" when the folder has none. */
export function folderContentsLabel(stats: { folders: number; files: number }): string {
  const files = `${stats.files} ${stats.files === 1 ? "file" : "files"}`;
  const folders = `${stats.folders} ${stats.folders === 1 ? "folder" : "folders"}`;
  if (stats.files === 0 && stats.folders === 0) return "Nothing yet";
  if (stats.folders === 0) return files;
  if (stats.files === 0) return folders;
  return `${folders} and ${files}`;
}
