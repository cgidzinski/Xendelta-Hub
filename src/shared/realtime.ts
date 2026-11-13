// Every event the server pushes to a signed-in client, with its payload. The server sends through `realtime`
// (server/realtime) and the client listens with `useRealtime` (client/hooks/useRealtime), both typed from this map,
// so a renamed event or a changed payload is a compile error on both sides.
//
// Events go to a person's own room (`user:<id>`), never to a room a client joins itself, so nobody can listen in on a
// conversation by guessing its id.
import type { ChatMessage } from "./chat";

export interface RealtimeEvents {
  // Chat
  "chat:message": { conversationId: string; message: ChatMessage };
  /** A message was edited, deleted or reacted to. */
  "chat:message_update": { conversationId: string; message: ChatMessage };
  /** The chat itself changed: it was created, renamed, or its members changed. `removed` means you are out of it. */
  "chat:conversation": { conversationId: string; removed?: boolean };
  "chat:read": { conversationId: string; userId: string; seq: number };
  "chat:typing": { conversationId: string; userId: string; username: string; typing: boolean };

  // Spaces: the space changed (renamed, members, roles). `removed` means you are out of it or it was deleted.
  "space:updated": { spaceId: string; removed?: boolean };

  /** You were invited to a space, or an invite to you was taken back. Your list of invites changed. */
  "space:invite": { spaceId: string };
  /** A channel in the space was added, changed, reordered or deleted. */
  "space:channels": { spaceId: string };

  // Calls: names reserved for the calls feature, not sent yet.
  "call:started": { conversationId: string; startedBy: string };
  "call:ended": { conversationId: string };

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
  "xennote:update": undefined;
}

export type RealtimeEvent = keyof RealtimeEvents;

/** Events a client may send to the server. */
export interface ClientEvents {
  "chat:typing": { conversationId: string; typing: boolean };
}
