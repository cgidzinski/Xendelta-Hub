import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";
import { userProfileKeys } from "../user/useUserProfile";

// Types
export interface User {
  _id: string;
  username: string;
  email: string;
  roles?: string[];
  avatar?: string;
  points?: number;
  inventory?: Array<{
    itemKey: string;
    name: string;
    description: string;
    image: string;
    redeemable: boolean;
    purchasedAt: string;
    used: boolean;
  }>;
  xenbox?: {
    fileCount: number;
    spaceUsed: number;
    spaceAllowed: number;
  };
}

interface UsersResponse {
  users: User[];
}

// Query keys
export const adminUsersKeys = {
  all: ["adminUsers"] as const,
  users: () => [...adminUsersKeys.all, "users"] as const,
};

// API functions
const fetchUsers = async (): Promise<User[]> => {
  const response = await apiClient.get<ApiResponse<UsersResponse>>("/api/admin/users");
  return response.data.data!.users;
};

const updateUser = async (userId: string, updates: { roles?: string[]; xenboxQuota?: number }): Promise<void> => {
  await apiClient.put(`/api/admin/users/${userId}`, updates);
};

const deleteUser = async (userId: string): Promise<void> => {
  await apiClient.delete(`/api/admin/users/${userId}`);
};

const resetUserAvatar = async (userId: string): Promise<void> => {
  await apiClient.post(`/api/admin/users/${userId}/avatar/reset`);
};

const giveItemToUser = async (userId: string, itemKey: string): Promise<void> => {
  await apiClient.post(`/api/admin/users/${userId}/give-item`, { itemKey });
};

const removeItemFromUser = async (userId: string, itemKey: string): Promise<void> => {
  await apiClient.delete(`/api/admin/users/${userId}/inventory/${itemKey}`);
};

// Hooks
export const useAdminUsers = () => {
  const queryClient = useQueryClient();

  // Query for fetching users
  const {
    data: users,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: adminUsersKeys.users(),
    queryFn: fetchUsers,
    staleTime: 1 * 60 * 1000, // 1 minute
    retry: (failureCount, error) => {
      if (error.message.includes("Unauthorized")) {
        return false;
      }
      return failureCount < 3;
    },
  });

  // Mutation for updating user
  const { mutateAsync: updateUserMutation, isPending: isUpdatingUser } = useMutation({
    mutationFn: ({ userId, updates }: { userId: string; updates: { roles?: string[]; xenboxQuota?: number } }) =>
      updateUser(userId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminUsersKeys.users() });
      queryClient.invalidateQueries({ queryKey: userProfileKeys.profile() });
    },
    onError: () => {
      // Error handled by mutation error state
    },
  });

  // Mutation for deleting user
  const { mutateAsync: deleteUserMutation, isPending: isDeletingUser } = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminUsersKeys.users() });
    },
    onError: () => {
      // Error handled by mutation error state
    },
  });

  // Mutation for resetting user avatar
  const { mutateAsync: resetAvatarMutation, isPending: isResettingAvatar } = useMutation({
    mutationFn: resetUserAvatar,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminUsersKeys.users() });
      queryClient.invalidateQueries({ queryKey: userProfileKeys.profile() });
    },
    onError: () => {
      // Error handled by mutation error state
    },
  });

  // Mutation for giving item to user
  const { mutateAsync: giveItemMutation, isPending: isGivingItem } = useMutation({
    mutationFn: ({ userId, itemKey }: { userId: string; itemKey: string }) => giveItemToUser(userId, itemKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminUsersKeys.users() });
    },
    onError: () => {
      // Error handled by mutation error state
    },
  });

  // Mutation for removing item from user
  const { mutateAsync: removeItemMutation, isPending: isRemovingItem } = useMutation({
    mutationFn: ({ userId, itemKey }: { userId: string; itemKey: string }) => removeItemFromUser(userId, itemKey),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminUsersKeys.users() });
    },
    onError: () => {
      // Error handled by mutation error state
    },
  });

  return {
    users: users || [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
    updateUser: (userId: string, updates: { roles?: string[]; xenboxQuota?: number }) => updateUserMutation({ userId, updates }),
    isUpdatingUser,
    deleteUser: (userId: string) => deleteUserMutation(userId),
    isDeletingUser,
    resetAvatar: (userId: string) => resetAvatarMutation(userId),
    isResettingAvatar,
    giveItem: (userId: string, itemKey: string) => giveItemMutation({ userId, itemKey }),
    isGivingItem,
    removeItem: (userId: string, itemKey: string) => removeItemMutation({ userId, itemKey }),
    isRemovingItem,
  };
};
