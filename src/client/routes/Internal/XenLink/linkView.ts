import type { XenLink } from "../../../hooks/xenlink/useXenlink";

export type LinkSort = "oldest" | "newest" | "clicks" | "name" | "expiry";

export const LINK_SORTS: Array<{ value: LinkSort; label: string }> = [
  { value: "oldest", label: "Oldest first" },
  { value: "newest", label: "Newest first" },
  { value: "clicks", label: "Most clicks" },
  { value: "name", label: "Name (A to Z)" },
  { value: "expiry", label: "Expired and expiring first" },
];

/** Links matching every word of the search, in the name, address or short name. */
export function filterLinks(links: XenLink[], search: string): XenLink[] {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return links;
  return links.filter((l) => {
    const hay = `${l.name} ${l.url} ${l.slug}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

const created = (l: XenLink) => new Date(l.createdAt).getTime();
// Links with an expiry come first (the earliest, so already-expired ones, at the top); the rest keep their order.
const expiry = (l: XenLink) => (l.expires_at ? new Date(l.expires_at).getTime() : Infinity);

export function sortLinks(links: XenLink[], sort: LinkSort): XenLink[] {
  const copy = [...links];
  switch (sort) {
    case "newest":
      return copy.sort((a, b) => created(b) - created(a));
    case "clicks":
      return copy.sort((a, b) => (b.clicks ?? 0) - (a.clicks ?? 0) || created(b) - created(a));
    case "name":
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    case "expiry":
      return copy.sort((a, b) => (expiry(a) === expiry(b) ? 0 : expiry(a) < expiry(b) ? -1 : 1));
    default:
      return copy.sort((a, b) => created(a) - created(b));
  }
}
