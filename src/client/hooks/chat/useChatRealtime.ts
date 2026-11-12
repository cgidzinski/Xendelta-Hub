import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ChatConversation } from "@shared/chat";
import { useAuth } from "../../contexts/AuthContext";
import { useSocket } from "../useSocket";
import { useRealtime } from "../useRealtime";
import { userProfileKeys } from "../user/useUserProfile";
import { chatKeys } from "./keys";
import { patchMessage, upsertMessage, type MessagesData } from "../../utils/chatCache";

/**
 * Keeps the chat caches current from what the server pushes. Mount it once while signed in (the nav bar does).
 * Changes are patched into the cache in place, so the open thread never refetches its history to show a message.
 */
export function useChatRealtime() {
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();
  const { socket } = useSocket();

  const refreshLists = () => {
    queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
    queryClient.invalidateQueries({ queryKey: chatKeys.unread() });
    queryClient.invalidateQueries({ queryKey: userProfileKeys.profile() });
  };

  useRealtime("chat:message", ({ conversationId, message }) => {
    queryClient.setQueryData<MessagesData>(chatKeys.messages(conversationId), (data) => upsertMessage(data, message));
    // The open chat's own numbers move with the message, so its unread count is right without a refetch.
    queryClient.setQueryData<ChatConversation>(chatKeys.conversation(conversationId), (c) =>
      c
        ? {
            ...c,
            seq: Math.max(c.seq, message.seq),
            unread:
              message.from === user.id
                ? 0
                : Math.max(c.seq, message.seq) - (c.members.find((m) => m.user_id === user.id)?.lastReadSeq ?? 0),
            lastMessage: { seq: message.seq, from: message.from, preview: message.body, at: message.createdAt },
          }
        : c,
    );
    refreshLists();
  });

  useRealtime("chat:message_update", ({ conversationId, message }) => {
    queryClient.setQueryData<MessagesData>(chatKeys.messages(conversationId), (data) => patchMessage(data, message));
    queryClient.invalidateQueries({ queryKey: chatKeys.conversations() });
  });

  // Created, renamed, members changed, or you were removed.
  useRealtime("chat:conversation", ({ conversationId, removed }) => {
    if (removed) {
      queryClient.removeQueries({ queryKey: chatKeys.conversation(conversationId) });
      queryClient.removeQueries({ queryKey: chatKeys.messages(conversationId) });
    } else {
      queryClient.invalidateQueries({ queryKey: chatKeys.conversation(conversationId) });
    }
    refreshLists();
  });

  useRealtime("chat:read", ({ conversationId, userId, seq }) => {
    queryClient.setQueryData<ChatConversation>(chatKeys.conversation(conversationId), (c) =>
      c
        ? {
            ...c,
            members: c.members.map((m) =>
              m.user_id === userId ? { ...m, lastReadSeq: Math.max(m.lastReadSeq, seq) } : m,
            ),
            unread: userId === user.id ? Math.max(0, c.seq - seq) : c.unread,
          }
        : c,
    );
    if (userId === user.id) refreshLists();
  });

  // After a dropped connection, what was missed comes from the server.
  useEffect(() => {
    if (!socket || !isAuthenticated) return;
    const onReconnect = () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.all });
      queryClient.invalidateQueries({ queryKey: userProfileKeys.profile() });
    };
    socket.io.on("reconnect", onReconnect);
    return () => {
      socket.io.off("reconnect", onReconnect);
    };
  }, [socket, isAuthenticated, queryClient]);
}
