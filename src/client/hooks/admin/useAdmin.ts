import { useQuery, useMutation } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";

// Types
interface RolesResponse {
  roles: string[];
}

interface SendMessageResponse {
  message: string;
  data?: {
    successCount?: number;
  };
}

interface SendNotificationResponse {
  message: string;
  data?: {
    successCount?: number;
  };
}

interface DeleteMessagesResponse {
  message: string;
  data?: {
    messagesDeleted?: number;
    conversationsDeleted?: number;
  };
}

// Query keys
export const adminKeys = {
  all: ["admin"] as const,
  role: () => [...adminKeys.all, "role"] as const,
};

// API functions
const fetchAdminRole = async (): Promise<string[]> => {
  const response = await apiClient.get<ApiResponse<RolesResponse>>("/api/auth/roles/verify");
  return response.data.data!.roles;
};

const sendMessageToAllUsers = async (message: string, conversationTitle?: string): Promise<SendMessageResponse> => {
  const response = await apiClient.post<ApiResponse<SendMessageResponse>>("/api/admin/messages/all", {
    message,
    conversationTitle: conversationTitle?.trim() || undefined,
  });
  return response.data.data!;
};

const sendNotificationToAllUsers = async (
  title: string,
  message: string,
  icon: string = "announcement"
): Promise<SendNotificationResponse> => {
  const response = await apiClient.post<ApiResponse<SendNotificationResponse>>("/api/admin/notifications/all", {
    title,
    message,
    icon,
  });
  return response.data.data!;
};

const deleteAllMessagesData = async (): Promise<DeleteMessagesResponse> => {
  const response = await apiClient.delete<ApiResponse<DeleteMessagesResponse>>("/api/admin/messages/all");
  return response.data.data!;
};

// Hooks
export const useAdmin = () => {
  // Query for verifying admin role
  const {
    data: roles,
    isLoading: isVerifyingRole,
    refetch: verifyAdminRoleRefetch,
  } = useQuery({
    queryKey: adminKeys.role(),
    queryFn: fetchAdminRole,
    enabled: false, // Manual trigger only
    retry: false,
  });

  const verifyAdminRole = async () => {
    const result = await verifyAdminRoleRefetch();
    return result;
  };

  // Mutation for sending message to all users
  const { mutateAsync: sendMessageToAllMutation, isPending: isSendingMessage } = useMutation({
    mutationFn: ({ message, conversationTitle }: { message: string; conversationTitle?: string }) =>
      sendMessageToAllUsers(message, conversationTitle),
    onError: () => {
      // Error handled by mutation error state
    },
  });

  // Mutation for sending notification to all users
  const { mutateAsync: sendNotificationToAllMutation, isPending: isSendingNotification } = useMutation({
    mutationFn: ({ title, message, icon }: { title: string; message: string; icon?: string }) =>
      sendNotificationToAllUsers(title, message, icon),
    onError: () => {
      // Error handled by mutation error state
    },
  });

  // Mutation for deleting all messages
  const { mutateAsync: deleteAllMessagesMutation, isPending: isDeletingMessages } = useMutation({
    mutationFn: deleteAllMessagesData,
    onError: () => {
      // Error handled by mutation error state
    },
  });

  return {
    roles: roles || [],
    isVerifyingRole,
    verifyAdminRole,
    sendMessageToAll: sendMessageToAllMutation,
    isSendingMessage,
    sendNotificationToAll: sendNotificationToAllMutation,
    isSendingNotification,
    deleteAllMessages: deleteAllMessagesMutation,
    isDeletingMessages,
  };
};
