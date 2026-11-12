import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { api } from "../../config/api";
import { enqueueSnackbar, useSnackbar } from "notistack";
import { userProfileKeys } from "../user/useUserProfile";

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
  // The search text is part of the key: results for different searches must not share a cache entry.
  list: (search?: string) => [...xenLinkKeys.all, "list", search ?? ""] as const,
};

// API functions
const fetchXenLink = async (search?: string): Promise<XenLink[]> => {
  const params = search ? { search } : {};
  return (await api.get<XenLinksResponse>("/api/xenlink/list", { params })).links;
};

const createXenLink = async (link: XenLink): Promise<XenLink> => {
  return api.post<XenLink>(`/api/xenlink`, link);
};

const updateXenLink = async (link: XenLink): Promise<XenLink> => {
  return api.put<XenLink>(`/api/xenlink`, link);
};

const deleteXenLink = async (linkId: string): Promise<XenLink> => {
  return api.delete<XenLink>(`/api/xenlink/${linkId}`);
};

// Hooks
export const useXenLink = (search?: string) => {
  const { isAuthenticated } = useAuth();
  useSnackbar();
  const {
    data: xenLink,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: xenLinkKeys.list(search),
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
