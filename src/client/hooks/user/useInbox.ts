import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../config/api";
import { Notification } from "./useUserNotifications";
import { useChatUnread } from "../chat/useChat";
import { useRealtime } from "../useRealtime";
import { useQueryClient } from "@tanstack/react-query";

export const inboxKeys = {
  all: ["inbox"] as const,
  notifications: () => [...inboxKeys.all, "notifications"] as const,
};

interface UseInboxReturn {
  isLoading: boolean;
  /** Notifications not yet read. */
  notificationsUnread: number;
  /** Conversations with something unread. */
  conversationsUnread: number;
  totalUnread: number;
}

/** The two unread counts shown on Home: notifications, and conversations with new messages. */
export const useInbox = (): UseInboxReturn => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { count: conversationsUnread, isLoading: chatLoading } = useChatUnread();

  const { data: notifications, isLoading: notificationsLoading } = useQuery({
    queryKey: inboxKeys.notifications(),
    queryFn: async () => (await api.get<{ notifications: Notification[] }>("/api/user/notifications")).notifications,
    enabled: isAuthenticated,
    staleTime: 30 * 1000,
  });

  useRealtime("notification:new", () => queryClient.invalidateQueries({ queryKey: inboxKeys.notifications() }));
  useRealtime("notification:update", () => queryClient.invalidateQueries({ queryKey: inboxKeys.notifications() }));

  const notificationsUnread = (notifications ?? []).filter((n) => n.unread).length;
  return {
    isLoading: notificationsLoading || chatLoading,
    notificationsUnread,
    conversationsUnread,
    totalUnread: notificationsUnread + conversationsUnread,
  };
};
