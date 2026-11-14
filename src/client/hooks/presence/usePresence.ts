import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IDLE_AFTER_MS,
  activeCustomStatus,
  type CustomStatus,
  type MyPresence,
  type PresenceChoice,
  type PresenceEntry,
  type PresenceStatus,
} from "@shared/presence";
import type { ClientEvents } from "@shared/realtime";
import { api } from "../../config/api";
import { useAuth } from "../../contexts/AuthContext";
import { useRealtime } from "../useRealtime";
import { useSocket } from "../useSocket";
import { presenceKeys } from "./keys";

interface PresenceData {
  me: MyPresence;
  presence: PresenceEntry[];
}

/** Your own presence settings, and how everyone you share a chat or community with looks (people not listed are offline). */
export function usePresence() {
  const { isAuthenticated } = useAuth();
  const query = useQuery({
    queryKey: presenceKeys.list(),
    queryFn: () => api.get<PresenceData>("/api/presence"),
    enabled: isAuthenticated,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const byId = useMemo(() => new Map((query.data?.presence ?? []).map((e) => [e.userId, e])), [query.data]);
  /** How a person looks right now: offline unless they are listed, and a status line that has run out is dropped. */
  const of = useCallback(
    (userId: string | null | undefined): { status: PresenceStatus; customStatus: CustomStatus | null } => {
      const entry = userId ? byId.get(userId) : undefined;
      return { status: entry?.status ?? "offline", customStatus: activeCustomStatus(entry?.customStatus) };
    },
    [byId],
  );
  return { me: query.data?.me, of, isLoading: query.isLoading };
}

/** Keep the presence list live. Mounted once, with the other realtime hooks. */
export function usePresenceRealtime() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  useRealtime("presence:update", (entry) => {
    if (entry.userId === user.id) {
      // Your own line changed (maybe from another tab): your settings are the thing to refresh.
      void queryClient.invalidateQueries({ queryKey: presenceKeys.list() });
      return;
    }
    queryClient.setQueryData<PresenceData>(presenceKeys.list(), (data) => {
      if (!data) return data;
      const rest = data.presence.filter((e) => e.userId !== entry.userId);
      return { ...data, presence: entry.status === "offline" ? rest : [...rest, entry] };
    });
  });
}

/** Tell the server when this tab has been left alone for a while, and when it is in use again. */
export function usePresenceActivity() {
  const { socket } = useSocket();
  const idle = useRef(false);
  useEffect(() => {
    if (!socket) return;
    let timer: ReturnType<typeof setTimeout>;
    let lastSeen = 0;
    const report = (value: boolean) => {
      if (idle.current === value) return;
      idle.current = value;
      socket.emit("presence:activity", { idle: value } satisfies ClientEvents["presence:activity"]);
    };
    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => report(true), IDLE_AFTER_MS);
    };
    const active = () => {
      // Moving the mouse fires constantly: look at it once a second.
      const now = Date.now();
      if (now - lastSeen < 1000) return;
      lastSeen = now;
      report(false);
      arm();
    };
    const events = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel"] as const;
    for (const e of events) window.addEventListener(e, active, { passive: true });
    document.addEventListener("visibilitychange", active);
    arm();
    // A fresh connection starts out active on the server.
    idle.current = false;
    return () => {
      clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, active);
      document.removeEventListener("visibilitychange", active);
    };
  }, [socket]);
}

export function useSetPresence() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      choice?: PresenceChoice;
      customStatus?: { text: string; emoji: string; expiresAt: string | null } | null;
    }) => api.put<{ me: MyPresence }>("/api/presence", body),
    onSuccess: ({ me }) =>
      queryClient.setQueryData<PresenceData>(presenceKeys.list(), (data) => (data ? { ...data, me } : data)),
  });
}
