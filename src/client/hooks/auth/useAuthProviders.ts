import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";
import { useAuth } from "../../contexts/AuthContext";

// Types
export interface AuthProvider {
  provider: string;
  providerId: string;
  email: string;
  linkedAt: string;
  isActive: boolean;
}

export interface AuthProvidersData {
  providers: AuthProvider[];
  canUnlinkLocal: boolean;
}

export type LinkableProvider = "google" | "github" | "discord";

interface UnlinkProviderResponse {
  success: boolean;
  message?: string;
}

interface AddPasswordResponse {
  success: boolean;
  message?: string;
}

// Query keys
export const authProviderKeys = {
  all: ["authProviders"] as const,
  providers: () => [...authProviderKeys.all, "providers"] as const,
};

// API functions
const fetchAuthProvidersData = async (): Promise<AuthProvidersData> => {
  // Note: This endpoint returns { success, providers, canUnlinkLocal } directly
  // Not wrapped in data field like standard ApiResponse
  const response = await apiClient.get<AuthProvidersData>("/api/user/auth-providers");
  return response.data;
};

// Link hrefs are fully deterministic from the current user id, so they're built
// client-side (see getProviderLinkHref below) instead of round-tripping through the
// server first. Opening them as a real anchor (target="_blank") rather than a JS
// window.location.href navigation keeps the app's own tab alive the whole time -
// on iOS PWAs, navigating the standalone tab itself out to an OAuth provider and
// back is what causes the app to freeze/stop responding to touches afterward.
export const getProviderLinkHref = (provider: LinkableProvider, userId: string): string =>
  `/api/auth/${provider}?state=link&userId=${userId}`;

const unlinkProviderRequest = async (provider: string): Promise<UnlinkProviderResponse> => {
  const response = await apiClient.post<ApiResponse<UnlinkProviderResponse>>("/api/user/unlink-provider", {
    provider,
  });
  return response.data.data!;
};

const addPasswordRequest = async (password: string): Promise<AddPasswordResponse> => {
  const response = await apiClient.post<ApiResponse<AddPasswordResponse>>("/api/user/add-password", {
    password,
  });
  return response.data.data!;
};

// Hooks
export const useAuthProviders = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Query for fetching auth providers
  const {
    data: authProviders,
    isLoading: loading,
    isError,
    error,
    refetch: fetchAuthProviders,
  } = useQuery({
    queryKey: authProviderKeys.providers(),
    queryFn: fetchAuthProvidersData,
    retry: (failureCount, error) => {
      if (error.message.includes("Unauthorized") || error.message.includes("No authentication token")) {
        return false;
      }
      return failureCount < 3;
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
  });

  // Mutation for unlinking provider
  const { mutateAsync: unlinkProviderMutation } = useMutation({
    mutationFn: unlinkProviderRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authProviderKeys.providers() });
    },
    onError: () => {
      // Error handled by mutation error state
    },
  });

  // Mutation for adding password
  const { mutateAsync: addPasswordMutation } = useMutation({
    mutationFn: addPasswordRequest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: authProviderKeys.providers() });
    },
    onError: () => {
      // Error handled by mutation error state
    },
  });

  const unlinkProvider = async (provider: string) => {
    const result = await unlinkProviderMutation(provider);
    if (result.success) {
      return { success: true, message: result.message || "Provider unlinked successfully" };
    } else {
      return { success: false, message: result.message || "Failed to unlink provider" };
    }
  };

  const addPassword = async (password: string) => {
    const result = await addPasswordMutation(password);
    if (result.success) {
      return { success: true, message: result.message || "Password added successfully" };
    } else {
      return { success: false, message: result.message || "Failed to add password" };
    }
  };

  return {
    authProviders: authProviders || null,
    loading,
    error: error ? (error as Error).message : null,
    fetchAuthProviders,
    googleLinkHref: user ? getProviderLinkHref("google", user.id) : undefined,
    githubLinkHref: user ? getProviderLinkHref("github", user.id) : undefined,
    discordLinkHref: user ? getProviderLinkHref("discord", user.id) : undefined,
    unlinkProvider,
    addPassword,
  };
};
