import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";

export interface UserProfile {
  _id: string;
  username: string;
  email: string;
  avatar: string;
  unread_messages: boolean;
  unread_notifications: boolean;
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

const fetchCurrentUserProfile = async (): Promise<UserProfile> => {
  const token = localStorage.getItem("token");

  const response = await fetch("/api/user/profile", {
    method: "GET",
    headers: {
      Authorization: token || "",
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Unauthorized - please log in again");
    } else {
      throw new Error(`Failed to fetch profile: ${response.statusText}`);
    }
  }

  const data = await response.json();
  return data.data.user;
};

const updateCurrentUserProfile = async (data: UpdateProfileData) => {
  const token = localStorage.getItem("token");

  const response = await fetch("/api/user/profile", {
    method: "PUT",
    headers: {
      Authorization: token || "",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Unauthorized - please log in again");
    } else if (response.status === 400) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Invalid profile data");
    } else {
      throw new Error(`Failed to update profile: ${response.statusText}`);
    }
  }

  const responseData = await response.json();
  return responseData.data.user;
};

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
    queryKey: ["userProfile"],
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
      queryClient.setQueryData(["userProfile"], updatedProfile);
    },
    onError: (error) => {
      console.error("Profile update error:", error);
    },
  });

  const updateProfile = async (data: UpdateProfileData): Promise<boolean> => {
    if (!isAuthenticated) {
      return false;
    }

    try {
      await updateMutation.mutateAsync(data);
      return true;
    } catch (error) {
      return false;
    }
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
