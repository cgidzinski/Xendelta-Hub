import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient, getApiUrl } from "../../config/api";
import { ApiResponse } from "../../types/api";

// Types
export interface User {
  _id: string;
  username: string;
  email: string;
  avatar?: string;
}

interface UsersResponse {
  users: User[];
}

// Query keys
export const usersKeys = {
  all: ["users"] as const,
  list: () => [...usersKeys.all, "list"] as const,
};

// API functions
const fetchUsers = async (): Promise<User[]> => {
  const response = await apiClient.get<ApiResponse<UsersResponse>>(getApiUrl("api/users"));
  return response.data.data!.users;
};

// Hooks
export const useUsers = () => {
  const { profile, isAuthenticated } = useAuth();

  const {
    data: users,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: usersKeys.list(),
    queryFn: fetchUsers,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      if (error.message.includes("Unauthorized")) {
        return false;
      }
      return failureCount < 3;
    },
  });

  // Filter out current user
  const otherUsers = users?.filter((user) => user._id !== profile?._id) || [];

  return {
    users: otherUsers,
    allUsers: users || [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
};
