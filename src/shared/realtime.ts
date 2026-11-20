// Every event the server pushes to a signed-in client, with its payload. The server sends through `realtime`
// (server/realtime) and the client listens with `useRealtime` (client/hooks/useRealtime), both typed from this map,
// so a renamed event or a changed payload is a compile error on both sides.
//
// Events go to a person's own room (`user:<id>`), never to a room a client joins itself, so nobody can listen in on a
// conversation by guessing its id.
import type { ChatMessage } from "./chat";
import type { PresenceEntry } from "./presence";
import type { CallState } from "./calls";

export interface RealtimeEvents {
  // Chat
  "chat:message": { conversationId: string; message: ChatMessage };
  /** A message was edited, deleted or reacted to. */
  "chat:message_update": { conversationId: string; message: ChatMessage };
  /** The chat itself changed: it was created, renamed, or its members changed. `removed` means you are out of it. */
  "chat:conversation": { conversationId: string; removed?: boolean };
  "chat:read": { conversationId: string; userId: string; seq: number };
  "chat:typing": { conversationId: string; userId: string; username: string; typing: boolean };

  /** Someone who shares a chat or community with you came online, went idle or away, or changed their status line. */
  "presence:update": PresenceEntry;

  // Communities: the community changed (renamed, members, roles). `removed` means you are out of it or it was deleted.
  "community:updated": { communityId: string; removed?: boolean };

  /** A community's or group chat's custom emoji changed. `scopeId` is the community or conversation. */
  "emoji:changed": { scopeId: string };
  /** You were invited to a community, or an invite to you was taken back. Your list of invites changed. */
  "community:invite": { communityId: string };
  /** A channel in the community was added, changed, reordered or deleted. */
  "community:channels": { communityId: string };
  /** The community's fund changed (a donation or a bill payment). Only its members get this. */
  "community:fund": { communityId: string; fund: number };

  // Calls. `call` is null once the call has ended. A person who may join is told when it starts, and everyone in the chat
  // hears of each change, so "Join call" and the participant list stay right.
  "call:state": { conversationId: string; call: CallState | null };
  /** Billing cut a call short: a warning first, then the call ends for whoever can no longer pay. */
  "call:billing": { conversationId: string; message: string; ending: boolean };
  /** Someone is calling you: it rings until you join or decline, or it times out. */
  "call:ring": { conversationId: string; fromUserId: string; fromName: string; video: boolean; ringing: boolean };

  // Notifications
  "notification:new": { notification: unknown };
  "notification:update": { notificationId: string; update: { unread?: boolean; deleted?: boolean } };

  // Home feed: something new was recorded for you. The client shows a "N new" pill, it does not refetch by itself.
  "feed:new": { activityId: string; app: string };

  // Apps
  "xensplit:group_update": { groupId: string };
  "xensplit:groups_updated": undefined;
  "xenbudget:book_update": { bookId: string };
  "xenbudget:books_updated": undefined;
  "xenstart:update": undefined;
  "xennote:update": undefined;
  /** A notebook's sections or pages changed (created, renamed, moved, deleted, shared): refetch its tree. */
  "xennote:notebook_update": { notebookId: string };
  /** A page's text was saved. `rev` is the new revision and `by` who saved it and `client` which editor (a random id the editor sent with its save), so an open editor can tell its own saves from the same person's other tab or device. */
  "xennote:page_update": { pageId: string; notebookId: string; rev: number; by: string; client?: string };
  /** A recipe, category or meal-plan entry in a book changed. */
  "xenkitchen:book_update": { bookId: string };
  /** The books themselves changed: one was created, renamed or deleted, or its people changed. */
  "xenkitchen:books_updated": undefined;
  /** A routine changed: edited, ticked, completed, postponed, or its people did. */
  "xenroutine:update": undefined;
}

export type RealtimeEvent = keyof RealtimeEvents;

/** Events a client may send to the server. */
export interface ClientEvents {
  "chat:typing": { conversationId: string; typing: boolean };
  /** This tab has been left alone (idle) or is in use again. */
  "presence:activity": { idle: boolean };
}
