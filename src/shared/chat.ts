// Chat wire types and limits, shared by the server and the client.
//
// Everything is a conversation. A conversation with two members is what people call a DM; there is no separate kind.
// Messages are numbered 1, 2, 3... per conversation (`seq`), which is what paging, replies and "read up to here" use.
import type { Cosmetics } from "./cosmetics";

export const CHAT_BODY_MAX = 10_000;
export const CHAT_NAME_MAX = 100;
export const CHAT_MAX_MEMBERS = 100;
export const CHAT_MAX_ATTACHMENTS = 10;
export const CHAT_PAGE_SIZE = 50;
export const CHAT_REACTIONS_PER_MESSAGE = 20;
export const CHAT_PREVIEW_MAX = 140;

export type ChatRole = "owner" | "member";
export type ChatMessageKind = "text" | "system" | "call";

/** What other people may see of a person (the same fields every app shows). */
export interface ChatPerson {
  _id: string;
  username: string;
  avatar: string;
  cosmetics?: Cosmetics;
}

export interface ChatMember {
  user_id: string;
  role: ChatRole;
  joinedAt: string;
  /** The highest message number this person has read. */
  lastReadSeq: number;
}

export interface ChatAttachment {
  /** The XenDrive file. */
  fileId: string;
  name: string;
  mimeType: string;
  size: number;
  /** True when the file was deleted in XenDrive after it was sent. */
  removed?: boolean;
}

export interface ChatReaction {
  emoji: string;
  userIds: string[];
}

/**
 * A line in the history that explains what happened to the chat itself. In a system message `userIds[0]` is who did
 * it and the rest are who it happened to (the people added or removed).
 */
export type ChatSystemEvent = "created" | "added" | "removed" | "left" | "renamed" | "owner";

export interface ChatMessage {
  _id: string;
  conversationId: string;
  seq: number;
  /** The sender's user id; null for system messages. */
  from: string | null;
  kind: ChatMessageKind;
  body: string;
  system?: { event: ChatSystemEvent; userIds: string[]; name?: string };
  attachments: ChatAttachment[];
  /** The `seq` of the message this one replies to. */
  replyTo?: number | null;
  reactions: ChatReaction[];
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  /** Echoed back so the sender's client can match an optimistic message to the stored one. */
  clientId?: string | null;
}

export interface ChatConversation {
  _id: string;
  /** Set when the chat was given a name; otherwise the client shows the other members' names. */
  name: string | null;
  members: ChatMember[];
  /** Public info for the current members. */
  people: ChatPerson[];
  /** The number of the newest message. */
  seq: number;
  lastMessage?: { seq: number; from: string | null; preview: string; at: string } | null;
  /** Messages the caller has not read. */
  unread: number;
  muted: boolean;
  createdAt: string;
}

/** The default title: the other members' names, or the chat's own name. */
export function chatTitle(conversation: Pick<ChatConversation, "name" | "people">, meId: string): string {
  if (conversation.name) return conversation.name;
  const others = conversation.people.filter((p) => p._id !== meId).map((p) => p.username);
  return others.length > 0 ? others.join(", ") : "Just you";
}

/** The members of a chat, sorted and joined, so "the chat with exactly these people" can be found by one value. */
export function rosterKeyOf(userIds: readonly string[]): string {
  return [...new Set(userIds)].sort().join(",");
}
