import { useQuery } from "@tanstack/react-query";
import type { CallState } from "@shared/calls";
import type { ChatPerson } from "@shared/chat";
import { api } from "../../config/api";
import { useAuth } from "../../contexts/AuthContext";
import { callKeys } from "./keys";

/** The call going on in a chat (null if none) and who is in it. Kept live by the call provider's realtime listener. */
export function useChatCall(conversationId: string | undefined, enabled = true) {
  const { isAuthenticated } = useAuth();
  const query = useQuery({
    queryKey: callKeys.chat(conversationId ?? ""),
    queryFn: () => api.get<{ call: CallState | null; people: ChatPerson[] }>(`/api/calls/${conversationId}`),
    enabled: isAuthenticated && !!conversationId && enabled,
    staleTime: 30_000,
    retry: false,
  });
  return { call: query.data?.call ?? null, people: query.data?.people ?? [] };
}
