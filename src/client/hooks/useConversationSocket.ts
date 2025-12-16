import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Socket } from "socket.io-client";
import { Conversation, Message } from "../../types";
import { userMessagesKeys } from "./user/useUserMessages";
import { userProfileKeys } from "./user/useUserProfile";

interface UseConversationSocketProps {
  socket: Socket | null;
  conversationId: string | undefined;
}

export const useConversationSocket = ({ socket, conversationId }: UseConversationSocketProps) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!socket || !conversationId) return;

    const handleNewMessage = (data: { conversationId: string; message: Message }) => {
      if (data.conversationId === conversationId) {
        // Update conversation query cache
        queryClient.setQueryData<Conversation>(["conversation", conversationId], (prevConv) => {
          if (!prevConv) return prevConv;
          // Check if message already exists to avoid duplicates (including optimistic temp messages)
          const messageExists = prevConv.messages?.some(
            (msg) =>
              msg._id === data.message._id ||
              (msg._id?.startsWith("temp-") &&
                msg.message === data.message.message &&
                Math.abs(new Date(msg.time).getTime() - new Date(data.message.time).getTime()) < 5000)
          );
          if (messageExists) {
            // Replace temp message with real one
            return {
              ...prevConv,
              messages: (prevConv.messages || [])
                .map((msg) =>
                  msg._id?.startsWith("temp-") && msg.message === data.message.message
                    ? data.message
                    : msg
                )
                .filter((msg, index, arr) => {
                  // Remove duplicate temp messages, keep only the real one
                  if (msg._id === data.message._id) return true;
                  if (msg._id?.startsWith("temp-") && msg.message === data.message.message) {
                    return false; // Remove temp message
                  }
                  return true;
                }),
              lastMessage: data.message.message,
              lastMessageTime: data.message.time,
            };
          }
          return {
            ...prevConv,
            messages: [...(prevConv.messages || []), data.message],
            lastMessage: data.message.message,
            lastMessageTime: data.message.time,
          };
        });
        // Invalidate queries to refresh UI (list view, profile)
        queryClient.invalidateQueries({ queryKey: userMessagesKeys.conversations() });
        queryClient.invalidateQueries({ queryKey: userProfileKeys.profile() });
      }
    };

    const handleMessageDeleted = (data: { conversationId: string; messageId: string }) => {
      if (data.conversationId === conversationId) {
        // Update conversation query cache
        queryClient.setQueryData<Conversation>(["conversation", conversationId], (prevConv) => {
          if (!prevConv) return prevConv;
          return {
            ...prevConv,
            messages: (prevConv.messages || []).filter((msg) => msg._id !== data.messageId),
          };
        });
        queryClient.invalidateQueries({ queryKey: userMessagesKeys.conversations() });
      }
    };

    const handleConversationUpdate = (data: { conversationId: string; update: Record<string, unknown> }) => {
      if (data.conversationId === conversationId) {
        // Update conversation query cache
        queryClient.setQueryData<Conversation>(["conversation", conversationId], (prevConv) => {
          if (!prevConv) return prevConv;
          return {
            ...prevConv,
            ...data.update,
          };
        });
        queryClient.invalidateQueries({ queryKey: userMessagesKeys.conversations() });
      }
    };

    socket.on("message:new", handleNewMessage);
    socket.on("message:deleted", handleMessageDeleted);
    socket.on("conversation:update", handleConversationUpdate);

    return () => {
      socket.off("message:new", handleNewMessage);
      socket.off("message:deleted", handleMessageDeleted);
      socket.off("conversation:update", handleConversationUpdate);
    };
  }, [socket, conversationId, queryClient]);
};

