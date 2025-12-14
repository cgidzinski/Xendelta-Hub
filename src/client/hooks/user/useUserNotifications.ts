import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { get, put } from "../../utils/apiClient";
import { useSocket } from "../useSocket";
import { useEffect } from "react";

export interface Notification {
  _id: string;
  title: string;
  message: string;
  time: string;
  icon: string;
  unread: boolean;
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
  fetchNotifications: () => void;
}

const fetchUserNotifications = async (): Promise<Notification[]> => {
  const data = await get<{ notifications: Notification[] }>("/api/user/notifications");
  return data.notifications;
};

const markAllNotificationsAsRead = async (): Promise<Notification[]> => {
  const data = await put<{ notifications: Notification[] }>("/api/user/notifications/mark-read");
  return data.notifications;
};

const markNotificationAsRead = async (notificationId: string): Promise<Notification> => {
  const data = await put<{ notification: Notification }>(`/api/user/notifications/${notificationId}/mark-read`);
  return data.notification;
};

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
    queryKey: ["userNotifications"],
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
      queryClient.setQueryData(["userNotifications"], (oldData: Notification[] | undefined) => {
        if (!oldData) return [data.notification];
        return [data.notification, ...oldData].slice(0, 10);
      });

      // Update user profile to reflect unread notification
      queryClient.setQueryData(["userProfile"], (oldProfileData: any) => {
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
        queryClient.setQueryData(["userNotifications"], (oldData: Notification[] | undefined) => {
          if (!oldData) return oldData;
          return oldData.map(notif => ({ ...notif, unread: false }));
        });
        queryClient.setQueryData(["userProfile"], (oldProfileData: any) => {
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
        queryClient.setQueryData(["userNotifications"], (oldData: Notification[] | undefined) => {
          if (!oldData) return oldData;
          return oldData.map(notif => 
            notif._id === data.notificationId ? { ...notif, ...data.update } : notif
          );
        });

        // Check if all notifications are now read
        queryClient.setQueryData(["userNotifications"], (oldData: Notification[] | undefined) => {
          if (!oldData) return oldData;
          const hasUnreadNotifications = oldData.some(notification => notification.unread);
          
          queryClient.setQueryData(["userProfile"], (oldProfileData: any) => {
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
      queryClient.setQueryData(["userNotifications"], updatedNotifications);

      // Also update the user profile cache to reflect the unread_notifications change
      queryClient.setQueryData(["userProfile"], (oldData: any) => {
        if (oldData) {
          return {
            ...oldData,
            unread_notifications: false,
          };
        }
        return oldData;
      });
    },
    onError: (error) => {
      console.error("Failed to mark notifications as read:", error);
    },
  });

  // Mutation for marking individual notification as read
  const { mutate: markSingleNotificationAsRead, isPending: isMarkingNotificationAsRead } = useMutation({
    mutationFn: markNotificationAsRead,
    onSuccess: (updatedNotification: Notification) => {
      // Update the notifications cache with the updated notification
      queryClient.setQueryData(["userNotifications"], (oldData: Notification[] | undefined) => {
        if (!oldData) return oldData;
        return oldData.map(notification => 
          notification._id === updatedNotification._id ? updatedNotification : notification
        );
      });

      // Check if all notifications are now read to update the user profile cache
      queryClient.setQueryData(["userNotifications"], (oldData: Notification[] | undefined) => {
        if (!oldData) return oldData;
        const hasUnreadNotifications = oldData.some(notification => notification.unread);
        
        queryClient.setQueryData(["userProfile"], (oldProfileData: any) => {
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
    onError: (error) => {
      console.error("Failed to mark notification as read:", error);
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
    fetchNotifications,
  };
};
