import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";
import type { EtransferInfo } from "../../../shared/etransfer";

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
  has_new_notifications: boolean;
  pinnedApps: string[];
  /** Preferred IANA zone; "" means follow the browser. */
  timezone: string;
  /** Whether the account receives emailed notifications (opt-out; default true). */
  emailNotifications: boolean;
  /** Where XenSplit tells others to send this user's settlements. Blank handle means unset. */
  etransfer: EtransferInfo;
  xenbox: {
    fileCount: number;
    spaceUsed: number;
    spaceAllowed: number;
  };
}

export interface UpdateProfileData {
  avatar?: string;
  username?: string;
  /** "" clears the preference and falls back to the browser's zone. */
  timezone?: string;
  emailNotifications?: boolean;
  /** A blank handle clears it. */
  etransfer?: EtransferInfo;
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
    onSuccess: () => {
      // Refetch rather than writing the response into the cache: the update endpoint
      // returns only the handful of fields it touches, so seeding the cache with it
      // would drop pinnedApps, points and the xenbox quota until the next reload.
      queryClient.invalidateQueries({ queryKey: userProfileKeys.profile() });
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
