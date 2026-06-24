import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

declare global {
  interface Navigator {
    setAppBadge?(count?: number): Promise<void>;
    clearAppBadge?(): Promise<void>;
  }
}
import { useEffect } from "react";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";
import { useSocket } from "../useSocket";
import { userProfileKeys } from "./useUserProfile";

// Types
export interface Notification {
  _id: string;
  title: string;
  message: string;
  time: string;
  icon: string;
  unread: boolean;
  link?: string;
}

interface UseUserNotificationsReturn {
  notifications: Notification[] | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  markAllAsRead: () => void;
  isMarkingAsRead: boolean;
  markNotificationAsRead: (notificationId: string) => void;
  isMarkingNotificationAsRead: boolean;
  dismissNotification: (notificationId: string) => void;
  isDismissing: boolean;
  clearAllNotifications: () => void;
  isClearing: boolean;
  fetchNotifications: () => void;
}

// Query keys
export const userNotificationKeys = {
  all: ["userNotifications"] as const,
  notifications: () => [...userNotificationKeys.all, "notifications"] as const,
};

// API functions
const fetchUserNotifications = async (): Promise<Notification[]> => {
  const response = await apiClient.get<ApiResponse<{ notifications: Notification[] }>>("/api/user/notifications");
  return response.data.data!.notifications;
};

const markAllNotificationsAsRead = async (): Promise<Notification[]> => {
  const response = await apiClient.put<ApiResponse<{ notifications: Notification[] }>>("/api/user/notifications/mark-read");
  return response.data.data!.notifications;
};

const markNotificationAsRead = async (notificationId: string): Promise<Notification> => {
  const response = await apiClient.put<ApiResponse<{ notification: Notification }>>(`/api/user/notifications/${notificationId}/mark-read`);
  return response.data.data!.notification;
};

const dismissUserNotification = async (notificationId: string): Promise<string> => {
  await apiClient.delete(`/api/user/notifications/${notificationId}`);
  return notificationId;
};

const clearUserNotifications = async (): Promise<void> => {
  await apiClient.delete("/api/user/notifications");
};

// Hooks
export const useUserNotifications = (): UseUserNotificationsReturn => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { socket } = useSocket();

  // Query for fetching user notifications - lazy by default
  const {
    data: notifications,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: userNotificationKeys.notifications(),
    queryFn: fetchUserNotifications,
    enabled: false, // Lazy - only runs when manually triggered
    staleTime: 2 * 60 * 1000, // 2 minutes (shorter than profile since notifications change more frequently)
    retry: (failureCount, error) => {
      // Don't retry on 401 errors
      if (error.message.includes("Unauthorized")) {
        return false;
      }
      return failureCount < 3;
    },
  });

  // Set up socket listeners for real-time notification updates
  useEffect(() => {
    if (!socket || !isAuthenticated) return;

    const handleNewNotification = (data: { notification: Notification }) => {
      // Add new notification to cache
      queryClient.setQueryData(userNotificationKeys.notifications(), (oldData: Notification[] | undefined) => {
        if (!oldData) return [data.notification];
        return [data.notification, ...oldData].slice(0, 10);
      });

      // Update user profile to reflect unread notification
      queryClient.setQueryData(userProfileKeys.profile(), (oldProfileData: any) => {
        if (oldProfileData) {
          return {
            ...oldProfileData,
            unread_notifications: true,
          };
        }
        return oldProfileData;
      });
    };

    const handleNotificationUpdate = (data: { notificationId: string; update: any }) => {
      if (data.notificationId === "all") {
        // All notifications marked as read
        queryClient.setQueryData(userNotificationKeys.notifications(), (oldData: Notification[] | undefined) => {
          if (!oldData) return oldData;
          return oldData.map(notif => ({ ...notif, unread: false }));
        });
        queryClient.setQueryData(userProfileKeys.profile(), (oldProfileData: any) => {
          if (oldProfileData) {
            return {
              ...oldProfileData,
              unread_notifications: false,
            };
          }
          return oldProfileData;
        });
      } else {
        // Single notification updated
        queryClient.setQueryData(userNotificationKeys.notifications(), (oldData: Notification[] | undefined) => {
          if (!oldData) return oldData;
          return oldData.map(notif =>
            notif._id === data.notificationId ? { ...notif, ...data.update } : notif
          );
        });

        // Check if all notifications are now read
        queryClient.setQueryData(userNotificationKeys.notifications(), (oldData: Notification[] | undefined) => {
          if (!oldData) return oldData;
          const hasUnreadNotifications = oldData.some(notification => notification.unread);

          queryClient.setQueryData(userProfileKeys.profile(), (oldProfileData: any) => {
            if (oldProfileData) {
              return {
                ...oldProfileData,
                unread_notifications: hasUnreadNotifications,
              };
            }
            return oldProfileData;
          });

          return oldData;
        });
      }
    };

    socket.on("notification:new", handleNewNotification);
    socket.on("notification:update", handleNotificationUpdate);

    return () => {
      socket.off("notification:new", handleNewNotification);
      socket.off("notification:update", handleNotificationUpdate);
    };
  }, [socket, isAuthenticated, queryClient]);

  // Update the app icon badge count when installed
  useEffect(() => {
    if (!("setAppBadge" in navigator)) return;
    const unread = notifications?.filter((n) => n.unread).length ?? 0;
    if (unread > 0) {
      navigator.setAppBadge!(unread).catch(() => {});
    } else {
      navigator.clearAppBadge?.().catch(() => {});
    }
  }, [notifications]);

  // Function to manually trigger the notifications fetch
  const fetchNotifications = () => {
    if (isAuthenticated) {
      refetch();
    }
  };

  // Mutation for marking all notifications as read
  const { mutate: markAllAsRead, isPending: isMarkingAsRead } = useMutation({
    mutationFn: markAllNotificationsAsRead,
    onSuccess: (updatedNotifications) => {
      // Update the notifications cache with the updated data
      queryClient.setQueryData(userNotificationKeys.notifications(), updatedNotifications);

      // Also update the user profile cache to reflect the unread_notifications change
      queryClient.setQueryData(userProfileKeys.profile(), (oldData: any) => {
        if (oldData) {
          return {
            ...oldData,
            unread_notifications: false,
          };
        }
        return oldData;
      });
    },
    onError: () => {
      // Error handled by mutation error state
    },
  });

  // Mutation for marking individual notification as read
  const { mutate: markSingleNotificationAsRead, isPending: isMarkingNotificationAsRead } = useMutation({
    mutationFn: markNotificationAsRead,
    onSuccess: (updatedNotification: Notification) => {
      // Update the notifications cache with the updated notification
      queryClient.setQueryData(userNotificationKeys.notifications(), (oldData: Notification[] | undefined) => {
        if (!oldData) return oldData;
        return oldData.map(notification =>
          notification._id === updatedNotification._id ? updatedNotification : notification
        );
      });

      // Check if all notifications are now read to update the user profile cache
      queryClient.setQueryData(userNotificationKeys.notifications(), (oldData: Notification[] | undefined) => {
        if (!oldData) return oldData;
        const hasUnreadNotifications = oldData.some(notification => notification.unread);

        queryClient.setQueryData(userProfileKeys.profile(), (oldProfileData: any) => {
          if (oldProfileData) {
            return {
              ...oldProfileData,
              unread_notifications: hasUnreadNotifications,
            };
          }
          return oldProfileData;
        });

        return oldData;
      });
    },
    onError: () => {
      // Error handled by mutation error state
    },
  });

  // Mutation for dismissing (deleting) a single notification
  const { mutate: dismissSingleNotification, isPending: isDismissing } = useMutation({
    mutationFn: dismissUserNotification,
    onSuccess: (notificationId: string) => {
      queryClient.setQueryData(userNotificationKeys.notifications(), (oldData: Notification[] | undefined) => {
        if (!oldData) return oldData;
        const remaining = oldData.filter((n) => n._id !== notificationId);
        const hasUnread = remaining.some((n) => n.unread);
        queryClient.setQueryData(userProfileKeys.profile(), (oldProfileData: any) => {
          if (oldProfileData) return { ...oldProfileData, unread_notifications: hasUnread };
          return oldProfileData;
        });
        return remaining;
      });
    },
  });

  // Mutation for clearing all notifications
  const { mutate: clearAllNotifications, isPending: isClearing } = useMutation({
    mutationFn: clearUserNotifications,
    onSuccess: () => {
      queryClient.setQueryData(userNotificationKeys.notifications(), []);
      queryClient.setQueryData(userProfileKeys.profile(), (oldData: any) => {
        if (oldData) return { ...oldData, unread_notifications: false };
        return oldData;
      });
    },
  });

  return {
    notifications,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    markAllAsRead,
    isMarkingAsRead,
    markNotificationAsRead: markSingleNotificationAsRead,
    isMarkingNotificationAsRead,
    dismissNotification: dismissSingleNotification,
    isDismissing,
    clearAllNotifications,
    isClearing,
    fetchNotifications,
  };
};
