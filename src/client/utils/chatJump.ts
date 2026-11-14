// Moving around a chat's history: links to a message, the first unread one, and what to do when it isn't loaded.
import type { LocalMessage } from "./chatCache";

/** The message number a link points at (`?seq=12`), or null when there is none. */
export function jumpTarget(search: string): number | null {
  const raw = new URLSearchParams(search).get("seq");
  if (!raw || !/^\d{1,9}$/.test(raw)) return null;
  const seq = Number(raw);
  return seq >= 1 ? seq : null;
}

/** A link that opens this chat at one message. */
export const messageLink = (origin: string, pathname: string, seq: number) => `${origin}${pathname}?seq=${seq}`;

/** The first message the person hasn't read, or null if they have read everything. */
export const firstUnreadSeq = (lastReadSeq: number, unread: number): number | null =>
  unread > 0 ? lastReadSeq + 1 : null;

/**
 * Where "new messages" starts in what is loaded: the first message numbered `from` or later. `loaded` says whether the
 * history reaches back that far; if it doesn't (the oldest loaded message is already newer than `from`, and older
 * ones exist), the divider's place is unknown and the person has to jump there.
 */
export function unreadDivider(
  messages: Pick<LocalMessage, "seq">[],
  from: number | null,
  hasOlder: boolean,
): { state: "none" } | { state: "unloaded" } | { state: "at"; seq: number } {
  if (from === null || messages.length === 0) return { state: "none" };
  const first = messages.find((m) => m.seq >= from);
  if (!first) return { state: "none" };
  if (hasOlder && messages[0].seq > from) return { state: "unloaded" };
  return { state: "at", seq: first.seq };
}
