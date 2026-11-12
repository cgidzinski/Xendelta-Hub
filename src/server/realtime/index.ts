import type { RealtimeEvent, RealtimeEvents } from "@shared/realtime";
import { SocketManager } from "../infrastructure/SocketManager";

// The one way the server pushes an event to people. Every event goes to the recipient's own room, `user:<id>`
// (a person may have several tabs open and each is in it), and the event name and payload are checked against
// shared/realtime.ts. Clients join no rooms of their own.

type Args<E extends RealtimeEvent> = RealtimeEvents[E] extends undefined ? [] : [payload: RealtimeEvents[E]];

export const realtime = {
  /** Send `event` to each of these people (duplicates are sent once). */
  toUsers<E extends RealtimeEvent>(userIds: Iterable<string>, event: E, ...args: Args<E>): void {
    SocketManager.getInstance().emitToUsers(userIds, event, args[0]);
  },

  /** Whether the person has at least one tab connected right now. */
  isOnline(userId: string): boolean {
    return SocketManager.getInstance().isOnline(userId);
  },
};
