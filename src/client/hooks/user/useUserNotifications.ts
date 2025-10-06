import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";

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
  const token = localStorage.getItem("token");

  const response = await fetch("/api/user/notifications", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Unauthorized - please log in again");
    } else {
      throw new Error(`Failed to fetch notifications: ${response.statusText}`);
    }
  }

  const data = await response.json();
  return data.data.notifications;
};

const markAllNotificationsAsRead = async (): Promise<Notification[]> => {
  const token = localStorage.getItem("token");

  const response = await fetch("/api/user/notifications/mark-read", {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Unauthorized - please log in again");
    } else {
      throw new Error(`Failed to mark notifications as read: ${response.statusText}`);
    }
  }

  const data = await response.json();
  return data.data.notifications;
};

const markNotificationAsRead = async (notificationId: string): Promise<Notification> => {
  const token = localStorage.getItem("token");

  const response = await fetch(`/api/user/notifications/${notificationId}/mark-read`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Unauthorized - please log in again");
    } else {
      throw new Error(`Failed to mark notification as read: ${response.statusText}`);
    }
  }

  const data = await response.json();
  return data.data.notification;
};

export const useUserNotifications = (): UseUserNotificationsReturn => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

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
