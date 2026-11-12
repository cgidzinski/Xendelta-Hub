import { useMemo } from "react";
import type { ChatConversation, ChatMessage, ChatPerson } from "@shared/chat";

export type PeopleLookup = (id: string | null | undefined) => ChatPerson | undefined;

/** Look up people by id: the current members first, then anyone who appears in the loaded history (who may have left). */
export function usePeopleLookup(
  conversation: ChatConversation | undefined,
  history: Map<string, ChatPerson>,
): PeopleLookup {
  return useMemo(() => {
    const map = new Map<string, ChatPerson>(history);
    for (const p of conversation?.people ?? []) map.set(p._id, p);
    return (id) => (id ? map.get(id) : undefined);
  }, [conversation, history]);
}

/** A person's name in a sentence: "You" for yourself, "Someone" if they're gone. */
export const nameFor = (lookup: PeopleLookup, id: string | null | undefined, meId: string) =>
  id === meId ? "You" : (lookup(id)?.username ?? "Someone");

const list = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

/** The sentence for a system message, worded for the reader ("You added Jo", "Alex added you"). */
export function systemText(message: ChatMessage, lookup: PeopleLookup, meId: string): string {
  const s = message.system;
  if (!s) return message.body;
  const [actor, ...targets] = s.userIds;
  const who = nameFor(lookup, actor, meId);
  const others = list(targets.map((id) => (id === meId ? "you" : nameFor(lookup, id, meId))));
  const verb = (you: string, they: string) => (actor === meId ? you : they);
  switch (s.event) {
    case "created":
      return `${who} created the group`;
    case "added":
      return `${who} added ${others}`;
    case "removed":
      return `${who} removed ${others}`;
    case "left":
      return `${who} left`;
    case "renamed":
      return s.name ? `${who} named the chat “${s.name}”` : `${who} removed the chat name`;
    case "owner":
      return targets.length > 0 ? `${who} made ${others} the owner` : `${who} ${verb("are", "is")} now the owner`;
    default:
      return message.body;
  }
}

/** "Today", "Yesterday", or the date. */
export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: days < 7 ? "long" : undefined,
    month: "short",
    day: "numeric",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

export const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** Short time for the list: the clock today, otherwise the day. */
export function listTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  return d.toDateString() === now.toDateString() ? clock(iso) : dayLabel(iso, now);
}
