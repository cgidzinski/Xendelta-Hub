import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";

// Types
export interface UserProfile {
  _id: string;
  username: string;
  email: string;
  avatar: string;
  roles?: string[];
  points: number;
  unread_messages: boolean;
  unread_notifications: boolean;
  xenbox: {
    fileCount: number;
    spaceUsed: number;
    spaceAllowed: number;
  };
}

export interface UpdateProfileData {
  avatar?: string;
}

interface UseUserProfileReturn {
  profile: UserProfile | undefined;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  // Update profile functionality
  updateProfile: (data: UpdateProfileData) => Promise<boolean>;
  isUpdating: boolean;
  updateError: Error | null;
}

// Query keys
export const userProfileKeys = {
  all: ["userProfile"] as const,
  profile: () => [...userProfileKeys.all, "profile"] as const,
};

// API functions
const fetchCurrentUserProfile = async (): Promise<UserProfile> => {
  const response = await apiClient.get<ApiResponse<{ user: UserProfile }>>("/api/user/profile");
  return response.data.data!.user;
};

const updateCurrentUserProfile = async (data: UpdateProfileData): Promise<UserProfile> => {
  const response = await apiClient.put<ApiResponse<{ user: UserProfile }>>("/api/user/profile", data);
  return response.data.data!.user;
};

// Hooks
export const useUserProfile = (): UseUserProfileReturn => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  // Query for fetching current user's profile
  const {
    data: profile,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: userProfileKeys.profile(),
    queryFn: fetchCurrentUserProfile,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      // Don't retry on 401 errors
      if (error.message.includes("Unauthorized")) {
        return false;
      }
      return failureCount < 3;
    },
  });

  // Mutation for updating user profile
  const updateMutation = useMutation({
    mutationFn: updateCurrentUserProfile,
    onSuccess: (updatedProfile) => {
      // Update the profile cache with the updated data
      queryClient.setQueryData(userProfileKeys.profile(), updatedProfile);
    },
    onError: () => {
      // Error handled by mutation error state
    },
  });

  const updateProfile = async (data: UpdateProfileData): Promise<boolean> => {
    if (!isAuthenticated) {
      return false;
    }

    await updateMutation.mutateAsync(data);
    return true;
  };

  return {
    profile,
    isLoading,
    isError,
    error,
    refetch,
    updateProfile,
    isUpdating: updateMutation.isPending,
    updateError: updateMutation.error,
  };
};
