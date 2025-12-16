import { useEffect } from "react";
import { useSocket } from "./useSocket";
import { useUserProfile } from "./user/useUserProfile";
import { useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { Conversation } from "./user/useUserMessages";

interface UseNavBarSocketOptions {
  onNewNotification?: () => void;
  showSystemMessageNotifications?: boolean;
}

/**
 * Shared socket handling logic for NavBar components
 */
export function useNavBarSocket(options: UseNavBarSocketOptions = {}) {
  const { socket } = useSocket();
  const { refetch: refetchProfile } = useUserProfile();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { onNewNotification, showSystemMessageNotifications = false } = options;

  useEffect(() => {
    if (!socket) return;

    const handleNewNotification = () => {
      if (onNewNotification) {
        onNewNotification();
      }
    };

    const handleNewMessage = (data?: { conversationId: string; message: any }) => {
      queryClient.invalidateQueries({ queryKey: ["userConversations"], exact: false });
      refetchProfile();

      if (showSystemMessageNotifications) {
        const isSystemMessage =
          data?.message.senderUsername === "System" ||
          data?.message.isSystemMessage ||
          data?.message.from === "system";

        if (isSystemMessage) {
          const messagePreview = data?.message.message?.substring(0, 50) || "New system message";
          enqueueSnackbar(`System message: ${messagePreview}${data?.message.message?.length > 50 ? "..." : ""}`, {
            variant: "info",
            autoHideDuration: 5000,
          });
        }
      }
    };

    const handleNewConversation = (data?: { conversation: Conversation }) => {
      queryClient.invalidateQueries({ queryKey: ["userConversations"], exact: false });
      refetchProfile();

      if (showSystemMessageNotifications) {
        const isSystemConversation =
          data?.conversation.participants?.includes("system") || data?.conversation.name === "System Messages";

        if (isSystemConversation) {
          enqueueSnackbar("You have received a new system message", {
            variant: "info",
            autoHideDuration: 5000,
          });
        }
      }
    };

    socket.on("notification:new", handleNewNotification);
    socket.on("message:new", handleNewMessage);
    socket.on("conversation:new", handleNewConversation);

    return () => {
      socket.off("notification:new", handleNewNotification);
      socket.off("message:new", handleNewMessage);
      socket.off("conversation:new", handleNewConversation);
    };
  }, [socket, queryClient, refetchProfile, enqueueSnackbar, onNewNotification, showSystemMessageNotifications]);
}

