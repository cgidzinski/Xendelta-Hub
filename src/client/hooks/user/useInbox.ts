import { useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";
import { InboxItem, NotificationInboxItem, ConversationInboxItem } from "../../types/InboxItem";
import { Notification } from "./useUserNotifications";
import { Conversation } from "./useUserMessages";
import { userProfileKeys } from "./useUserProfile";
import { useSocket } from "../useSocket";

interface UseInboxReturn {
  inboxItems: InboxItem[];
  isLoading: boolean;
  isFetching: boolean;
  totalUnread: number;
  notificationsUnread: number;
  conversationsUnread: number;
  refetch: () => void;
  markAsRead: (item: InboxItem) => void;
  isMarkingAsRead: boolean;
}

export const inboxKeys = {
  all: ["inbox"] as const,
  inbox: () => [...inboxKeys.all, "items"] as const,
};

// API functions
const fetchNotifications = async (): Promise<Notification[]> => {
  const response = await apiClient.get<ApiResponse<{ notifications: Notification[] }>>("/api/user/notifications");
  return response.data.data!.notifications;
};

const fetchConversations = async (): Promise<Conversation[]> => {
  const response = await apiClient.get<ApiResponse<{ conversations: Conversation[] }>>("/api/user/messages");
  return response.data.data!.conversations;
};

const markNotificationAsRead = async (notificationId: string): Promise<Notification> => {
  const response = await apiClient.put<ApiResponse<{ notification: Notification }>>(`/api/user/notifications/${notificationId}/mark-read`);
  return response.data.data!.notification;
};

const markConversationAsRead = async (conversationId: string): Promise<void> => {
  await apiClient.put(`/api/user/messages/${conversationId}/mark-read`);
};

// Transform helpers
const notificationToInboxItem = (notification: Notification): NotificationInboxItem => ({
  id: notification._id,
  type: "notification",
  title: notification.title,
  preview: notification.message,
  time: notification.time,
  unread: notification.unread,
  icon: notification.icon,
  originalData: notification,
});

const conversationToInboxItem = (conversation: Conversation): ConversationInboxItem => ({
  id: conversation._id,
  type: "conversation",
  title: conversation.name || conversation.participantInfo?.map(p => p.username).join(", ") || "Conversation",
  preview: conversation.lastMessage,
  time: conversation.lastMessageTime,
  unread: conversation.unread,
  participantInfo: conversation.participantInfo,
  messageCount: conversation.messageCount,
  originalData: conversation,
});

export const useInbox = (): UseInboxReturn => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { socket } = useSocket();

  // Socket listener for real-time notification updates
  useEffect(() => {
    if (!socket || !isAuthenticated) return;

    const handleNewNotification = (data: { notification: Notification }) => {
      queryClient.setQueryData(inboxKeys.inbox(), (oldData: any) => {
        if (!oldData) return { notifications: [data.notification], conversations: [] };
        return {
          notifications: [data.notification, ...(oldData.notifications || [])].slice(0, 10),
          conversations: oldData.conversations || [],
        };
      });
      // Update profile unread count
      queryClient.setQueryData(userProfileKeys.profile(), (oldProfileData: any) => {
        if (oldProfileData) {
          return { ...oldProfileData, unread_notifications: true };
        }
        return oldProfileData;
      });
    };

    const handleNewMessage = (data: { conversationId: string; message: any }) => {
      queryClient.invalidateQueries({ queryKey: ["userConversations"], exact: false });
      queryClient.setQueryData(userProfileKeys.profile(), (oldProfileData: any) => {
        if (oldProfileData) {
          return { ...oldProfileData, unread_messages: true };
        }
        return oldProfileData;
      });
    };

    const handleNewConversation = (data: { conversation: Conversation }) => {
      queryClient.invalidateQueries({ queryKey: ["userConversations"], exact: false });
      queryClient.setQueryData(userProfileKeys.profile(), (oldProfileData: any) => {
        if (oldProfileData) {
          return { ...oldProfileData, unread_messages: true };
        }
        return oldProfileData;
      });
    };

    socket.on("notification:new", handleNewNotification);
    socket.on("message:new", handleNewMessage);
    socket.on("conversation:new", handleNewConversation);
    return () => {
      socket.off("notification:new", handleNewNotification);
      socket.off("message:new", handleNewMessage);
      socket.off("conversation:new", handleNewConversation);
    };
  }, [socket, isAuthenticated, queryClient]);

  const {
    data: notifications,
    isLoading: notificationsLoading,
    isFetching: notificationsFetching,
    refetch: refetchNotifications,
  } = useQuery({
    queryKey: inboxKeys.inbox(),
    queryFn: async () => {
      const [notifs, convs] = await Promise.all([fetchNotifications(), fetchConversations()]);
      return { notifications: notifs, conversations: convs };
    },
    enabled: isAuthenticated,
    staleTime: 30 * 1000,
  });

  const inboxItems = useMemo(() => {
    if (!notifications) return [];

    const notificationItems = (notifications.notifications || []).map(notificationToInboxItem);
    const conversationItems = (notifications.conversations || []).map(conversationToInboxItem);

    return [...notificationItems, ...conversationItems].sort((a, b) =>
      new Date(b.time).getTime() - new Date(a.time).getTime()
    );
  }, [notifications]);

  const totalUnread = useMemo(() =>
    inboxItems.reduce((sum, item) => sum + (item.unread ? 1 : 0), 0),
    [inboxItems]
  );

  const notificationsUnread = useMemo(() =>
    inboxItems.filter(item => item.type === "notification" && item.unread).length,
    [inboxItems]
  );

  const conversationsUnread = useMemo(() =>
    inboxItems.filter(item => item.type === "conversation" && item.unread).length,
    [inboxItems]
  );

  const { mutate: markAsReadMutation, isPending: isMarkingAsRead } = useMutation({
    mutationFn: async (item: InboxItem) => {
      if (item.type === "notification") {
        await markNotificationAsRead(item.id);
      } else {
        await markConversationAsRead(item.id);
      }
    },
    onSuccess: (_, item) => {
      // Update inbox cache
      queryClient.setQueryData(inboxKeys.inbox(), (oldData: any) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          notifications: oldData.notifications.map((n: Notification) =>
            item.type === "notification" && n._id === item.id ? { ...n, unread: false } : n
          ),
          conversations: oldData.conversations.map((c: Conversation) =>
            item.type === "conversation" && c._id === item.id ? { ...c, unread: false } : c
          ),
        };
      });
      // Update profile unread count
      queryClient.setQueryData(userProfileKeys.profile(), (oldProfileData: any) => {
        if (oldProfileData) {
          const newUnreadCount = totalUnread - 1;
          return {
            ...oldProfileData,
            unread_notifications: newUnreadCount > 0,
            unread_messages: newUnreadCount > 0,
          };
        }
        return oldProfileData;
      });
    },
  });

  return {
    inboxItems,
    isLoading: notificationsLoading,
    isFetching: notificationsFetching,
    totalUnread,
    notificationsUnread,
    conversationsUnread,
    refetch: refetchNotifications,
    markAsRead: markAsReadMutation,
    isMarkingAsRead,
  };
};