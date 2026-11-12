import { useEffect, useRef } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useSocket } from "./useSocket";

/**
 * Run `handler` whenever the shared socket receives `event`. The latest handler is always used, so
 * callers can pass an inline function without re-subscribing on every render.
 */
export function useSocketEvent<T = unknown>(event: string, handler: (data: T) => void): void {
  const { socket } = useSocket();
  const latest = useRef(handler);
  latest.current = handler;

  useEffect(() => {
    if (!socket) return;
    const listener = (data: T) => latest.current(data);
    socket.on(event, listener);
    return () => {
      socket.off(event, listener);
    };
  }, [socket, event]);
}

/**
 * Refetch the given queries when `event` arrives. `applies` narrows it to the payloads that matter
 * (for example only the group that is open).
 */
export function useSocketInvalidate<T = unknown>(
  event: string,
  queryKeys: readonly QueryKey[],
  applies: (data: T) => boolean = () => true,
): void {
  const queryClient = useQueryClient();
  useSocketEvent<T>(event, (data) => {
    if (!applies(data)) return;
    for (const queryKey of queryKeys) queryClient.invalidateQueries({ queryKey });
  });
}
