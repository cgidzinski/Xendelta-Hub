import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";
import { userProfileKeys } from "./useUserProfile";

// Types
interface AvatarUploadResponseData {
  avatar: string;
}

interface MakeAdminResponse {
  status: boolean;
  message: string;
}

// Query keys
export const userAvatarKeys = {
  all: ["userAvatar"] as const,
};

// API functions
const uploadAvatar = async (file: File): Promise<AvatarUploadResponseData> => {
  const formData = new FormData();
  formData.append("avatar", file);

  const response = await apiClient.post<ApiResponse<AvatarUploadResponseData>>("/api/user/avatar", formData);
  return response.data.data!;
};

const makeAdmin = async (): Promise<MakeAdminResponse> => {
  const response = await apiClient.post<ApiResponse<MakeAdminResponse>>("/api/user/make-admin");
  return response.data.data!;
};

// Hooks
export const useUserAvatar = () => {
  const queryClient = useQueryClient();

  // Mutation for uploading avatar
  const { mutateAsync: uploadAvatarMutation, isPending: isUploading } = useMutation({
    mutationFn: uploadAvatar,
    onSuccess: () => {
      // Invalidate profile to refetch fresh data from server
      queryClient.invalidateQueries({ queryKey: userProfileKeys.profile() });
    },
    onError: () => {
      // Error handled by mutation error state
    },
  });

  // Mutation for making user admin
  const { mutateAsync: makeAdminMutation, isPending: isMakingAdmin } = useMutation({
    mutationFn: makeAdmin,
    onSuccess: () => {
      // Invalidate profile to refresh roles
      queryClient.invalidateQueries({ queryKey: userProfileKeys.profile() });
    },
    onError: () => {
      // Error handled by mutation error state
    },
  });

  return {
    uploadAvatar: uploadAvatarMutation,
    isUploading,
    makeAdmin: makeAdminMutation,
    isMakingAdmin,
  };
};
