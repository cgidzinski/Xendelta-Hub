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
  /** Times the link was followed. */
  clicks?: number;
  last_clicked_at?: string | null;
  /** ISO time after which the link stops working; absent = never. */
  expires_at?: string | null;
}

/** What is sent to create or change a link. */
export interface XenLinkInput {
  _id?: string;
  name: string;
  url: string;
  /** A short name of your own ("" or absent = random on create, unchanged on edit). */
  slug?: string;
  /** ISO time, or null to remove the expiry; absent leaves it as it is. */
  expiresAt?: string | null;
}

export interface XenLinkStats {
  clicks: number;
  lastClickedAt: string | null;
  /** The last 30 days, oldest first, days with none included. */
  days: Array<{ day: string; n: number }>;
}

interface XenLinksResponse {
  links: XenLink[];
}

// Query keys
export const xenLinkKeys = {
  all: ["xenLink"] as const,
  // The search text is part of the key: results for different searches must not share a cache entry.
  list: (search?: string) => [...xenLinkKeys.all, "list", search ?? ""] as const,
  stats: (linkId: string) => [...xenLinkKeys.all, "stats", linkId] as const,
};

// API functions
const fetchXenLink = async (search?: string): Promise<XenLink[]> => {
  const params = search ? { search } : {};
  return (await api.get<XenLinksResponse>("/api/xenlink/list", { params })).links;
};

const createXenLink = async (link: XenLinkInput): Promise<XenLink> => {
  return api.post<XenLink>(`/api/xenlink`, link);
};

const updateXenLink = async (link: XenLinkInput): Promise<XenLink> => {
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
    mutationFn: (link: XenLinkInput) => updateXenLink(link),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: xenLinkKeys.list() });
      queryClient.invalidateQueries({ queryKey: userProfileKeys.profile() });
      enqueueSnackbar("Link updated successfully", { variant: "success" });
    },
    // The server says what was wrong (a short name that's taken, an address that isn't a web address).
    onError: (e: Error) => {
      enqueueSnackbar(e.message || "Failed to update link", { variant: "error" });
    },
  });
};

export const useCreateXenLink = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (link: XenLinkInput) => createXenLink(link),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: xenLinkKeys.list() });
      queryClient.invalidateQueries({ queryKey: userProfileKeys.profile() });
      enqueueSnackbar("Link created successfully", { variant: "success" });
    },
    onError: (e: Error) => {
      enqueueSnackbar(e.message || "Failed to create link", { variant: "error" });
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

/** A link's clicks: total, last time, and per day for the last 30 days. Only fetched while `linkId` is set. */
export const useXenLinkStats = (linkId: string | undefined) =>
  useQuery({
    queryKey: xenLinkKeys.stats(linkId ?? ""),
    queryFn: () => api.get<XenLinkStats>(`/api/xenlink/${linkId}/stats`),
    enabled: !!linkId,
    staleTime: 30_000,
  });
