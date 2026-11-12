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
