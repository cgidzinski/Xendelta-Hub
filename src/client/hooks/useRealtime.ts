import type { RealtimeEvent, RealtimeEvents } from "@shared/realtime";
import { useSocketEvent } from "./useSocketEvent";

/**
 * Run `handler` whenever the server pushes `event`. The event name and payload are typed from
 * shared/realtime.ts, so a renamed event or a changed payload is a compile error here. The latest handler is always
 * used, so an inline function is fine.
 */
export function useRealtime<E extends RealtimeEvent>(event: E, handler: (payload: RealtimeEvents[E]) => void): void {
  useSocketEvent<RealtimeEvents[E]>(event, handler);
}
