import { useCallback, useEffect, useRef, useState } from "react";
import { useSocket } from "../useSocket";
import { useRealtime } from "../useRealtime";

const TYPING_TTL_MS = 5000;
const STOP_AFTER_MS = 3000;

/** Who else is typing in this chat right now (their names). An entry expires if "stopped" never arrives. */
export function useTypingUsers(conversationId: string | undefined): string[] {
  const [typing, setTyping] = useState<Record<string, { name: string; until: number }>>({});

  useRealtime("chat:typing", (e) => {
    if (e.conversationId !== conversationId) return;
    setTyping((current) => {
      const next = { ...current };
      if (e.typing) next[e.userId] = { name: e.username, until: Date.now() + TYPING_TTL_MS };
      else delete next[e.userId];
      return next;
    });
  });

  useEffect(() => setTyping({}), [conversationId]);

  useEffect(() => {
    if (Object.keys(typing).length === 0) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setTyping((current) => {
        const next = Object.fromEntries(Object.entries(current).filter(([, v]) => v.until > now));
        return Object.keys(next).length === Object.keys(current).length ? current : next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [typing]);

  return Object.values(typing).map((t) => t.name);
}

/** Call `onInput` as the person types; it tells the others they are typing, and that they stopped after a pause. */
export function useTypingSender(conversationId: string) {
  const { sendTyping } = useSocket();
  const active = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (active.current) {
      active.current = false;
      sendTyping(conversationId, false);
    }
  }, [conversationId, sendTyping]);

  const onInput = useCallback(() => {
    if (!active.current) {
      active.current = true;
      sendTyping(conversationId, true);
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(stop, STOP_AFTER_MS);
  }, [conversationId, sendTyping, stop]);

  useEffect(() => stop, [stop]);
  return { onInput, stop };
}
