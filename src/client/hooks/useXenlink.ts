import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext";
import { apiClient } from "../config/api";
import { ApiResponse } from "../types/api";
import { enqueueSnackbar, useSnackbar } from "notistack";
import { userProfileKeys } from "./user/useUserProfile";

interface XenLinkResponse {
  status: boolean;
  message: string;
}

// Types
export interface XenLink {
  _id?: string;
  name: string;
  url: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

interface XenLinksResponse {
  links: XenLink[];
}

// Query keys
export const xenLinkKeys = {
  all: ["xenLink"] as const,
  list: () => [...xenLinkKeys.all, "list"] as const,
};

// API functions
const fetchXenLink = async (search?: string): Promise<XenLink[]> => {
  const params = search ? { search } : {};
  const response = await apiClient.get<ApiResponse<XenLinksResponse>>("/api/xenlink/list", { params });
  return response.data.data!.links;
};

const createXenLink = async (link: XenLink): Promise<XenLink> => {
  const response = await apiClient.post<ApiResponse<XenLink>>(`/api/xenlink`, link);
  return response.data.data!;
};

const updateXenLink = async (link: XenLink): Promise<XenLink> => {
  const response = await apiClient.put<ApiResponse<XenLink>>(`/api/xenlink`, link);
  return response.data.data!;
};

const deleteXenLink = async (linkId: string): Promise<XenLink> => {
  const response = await apiClient.delete<ApiResponse<XenLink>>(`/api/xenlink/${linkId}`);
  return response.data.data!;
};

// Hooks
export const useXenLink = (search?: string) => {
  const { user, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const {
    data: xenLink,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: xenLinkKeys.list(),
    queryFn: () => fetchXenLink(search),
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: (failureCount, error) => {
      if (error.message.includes("Unauthorized")) {
        return false;
      }
      return failureCount < 3;
    },
  });

  return { links: xenLink || [], isLoading, isError, error: error as Error | null, refetch };
};

export const useUpdateXenLink = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (link: XenLink) => updateXenLink(link),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: xenLinkKeys.list() });
      queryClient.invalidateQueries({ queryKey: userProfileKeys.profile() });
      enqueueSnackbar("Link updated successfully", { variant: "success" });
    },
    onError: () => {
      enqueueSnackbar("Failed to update link", { variant: "error" });
    },
  });
};

export const useCreateXenLink = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (link: XenLink) => createXenLink(link),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: xenLinkKeys.list() });
      queryClient.invalidateQueries({ queryKey: userProfileKeys.profile() });
      enqueueSnackbar("Link created successfully", { variant: "success" });
    },
    onError: () => {
      enqueueSnackbar("Failed to create link", { variant: "error" });
    },
  });
};

export const useDeleteXenLink = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (linkId: string) => deleteXenLink(linkId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: xenLinkKeys.list() });
      queryClient.invalidateQueries({ queryKey: userProfileKeys.profile() });
      enqueueSnackbar("Link deleted successfully", { variant: "success" });
    },
    onError: () => {
      enqueueSnackbar("Failed to delete link", { variant: "error" });
    },
  });
};
