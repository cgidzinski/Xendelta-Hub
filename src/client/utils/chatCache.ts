import type { InfiniteData } from "@tanstack/react-query";
import type { ChatMessage, ChatPerson } from "@shared/chat";

/** A message as the client holds it: the stored one, or one that is still being sent (or failed to send). */
export type LocalMessage = ChatMessage & { status?: "sending" | "failed" };

export interface MessagesPage {
  /** Newest first. */
  messages: LocalMessage[];
  hasMore: boolean;
  people: ChatPerson[];
}

export type MessagesData = InfiniteData<MessagesPage, number | undefined>;

/**
 * Put a message into the cached history. A message already there (same id) is replaced; one being sent with the same
 * clientId is replaced by the stored copy, so the optimistic bubble turns into the real one in place. A new message
 * goes into the newest page.
 */
export function upsertMessage(data: MessagesData | undefined, message: LocalMessage): MessagesData | undefined {
  if (!data || data.pages.length === 0) return data;
  // A reply in a thread belongs to its thread (upsertReply), never the main history.
  if (typeof message.threadRoot === "number") return data;
  const matches = (m: LocalMessage) =>
    m._id === message._id || (!!message.clientId && m.clientId === message.clientId && m._id !== message._id);

  let replaced = false;
  const pages = data.pages.map((page) => ({
    ...page,
    messages: page.messages.flatMap((m) => {
      if (!matches(m)) return [m];
      if (replaced) return []; // never leave a duplicate behind
      replaced = true;
      return [message];
    }),
  }));
  if (replaced) return { ...data, pages };

  const [first, ...rest] = pages;
  const messages = [message, ...first.messages].sort((a, b) => b.seq - a.seq);
  return { ...data, pages: [{ ...first, messages }, ...rest] };
}

/** Change one message in place (an edit, a delete, a reaction). */
export function patchMessage(data: MessagesData | undefined, message: LocalMessage): MessagesData | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      messages: page.messages.map((m) => (m._id === message._id ? message : m)),
    })),
  };
}

/** Drop a message that failed and was dismissed. */
export function removeLocalMessage(data: MessagesData | undefined, id: string): MessagesData | undefined {
  if (!data) return data;
  return { ...data, pages: data.pages.map((p) => ({ ...p, messages: p.messages.filter((m) => m._id !== id) })) };
}

/** Everything cached for a chat, oldest first, ready to draw. */
export function chronological(data: MessagesData | undefined): LocalMessage[] {
  if (!data) return [];
  const all = data.pages.flatMap((p) => p.messages);
  // Messages still being sent have no real number yet and sort last.
  return all.sort((a, b) => a.seq - b.seq);
}

/** Everyone who appears in the cached history, by id (including people who have since left). */
export function peopleInHistory(data: MessagesData | undefined): Map<string, ChatPerson> {
  const map = new Map<string, ChatPerson>();
  for (const page of data?.pages ?? []) for (const p of page.people) map.set(p._id, p);
  return map;
}

/** An open thread as the client holds it: its first message, the latest replies (oldest first), and whether you follow it. */
export interface ThreadData {
  root: LocalMessage;
  replies: LocalMessage[];
  hasMore: boolean;
  following: boolean;
  people: ChatPerson[];
}

/** Put a reply into a thread (the same rules as `upsertMessage`: a sent copy replaces its optimistic one). */
export function upsertReply(data: ThreadData | undefined, reply: LocalMessage): ThreadData | undefined {
  if (!data || reply.threadRoot !== data.root.seq) return data;
  const same = (m: LocalMessage) =>
    m._id === reply._id || (!!reply.clientId && m.clientId === reply.clientId && m._id !== reply._id);
  const rest = data.replies.filter((m) => !same(m));
  return { ...data, replies: [...rest, reply].sort((a, b) => a.seq - b.seq) };
}

/** Change the first message or a reply of a thread in place (an edit, a delete, a reaction, a new reply count). */
export function patchThread(data: ThreadData | undefined, message: LocalMessage): ThreadData | undefined {
  if (!data) return data;
  if (data.root._id === message._id) return { ...data, root: message };
  return { ...data, replies: data.replies.map((m) => (m._id === message._id ? message : m)) };
}

/** Drop a reply that failed and was dismissed. */
export function removeLocalReply(data: ThreadData | undefined, id: string): ThreadData | undefined {
  return data && { ...data, replies: data.replies.filter((m) => m._id !== id) };
}

/** Whether a thread has had no reply for `days` days (shown as archived; a new reply brings it back). */
export function isArchivedThread(lastAt: string | null | undefined, days: number, now = Date.now()): boolean {
  return !!lastAt && now - new Date(lastAt).getTime() > days * 86_400_000;
}
