import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../config/api";
import { userProfileKeys } from "./useUserProfile";

interface PinnedAppsResponse {
  pinnedApps: string[];
}

interface UpdatePinnedAppsData {
  pinnedApps: string[];
}

const updatePinnedApps = async (data: UpdatePinnedAppsData): Promise<PinnedAppsResponse> => {
  return api.put<PinnedAppsResponse>("/api/user/pinned-apps", data);
};

export const usePinnedApps = () => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  const {
    mutateAsync: updatePinnedAppsMutation,
    isPending: isUpdating,
    error: updateError,
  } = useMutation({
    mutationFn: updatePinnedApps,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userProfileKeys.profile() });
    },
  });

  const setPinnedApps = async (apps: string[]): Promise<boolean> => {
    if (!isAuthenticated) {
      return false;
    }
    await updatePinnedAppsMutation({ pinnedApps: apps });
    return true;
  };

  const togglePinnedApp = async (appKey: string, currentPinned: string[]): Promise<boolean> => {
    const isPinned = currentPinned.includes(appKey);
    const newPinned = isPinned ? currentPinned.filter((key) => key !== appKey) : [...currentPinned, appKey];
    return setPinnedApps(newPinned);
  };

  return {
    setPinnedApps,
    togglePinnedApp,
    isUpdating,
    updateError: updateError as Error | null,
  };
};
