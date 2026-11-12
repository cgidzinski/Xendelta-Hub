import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../config/api";

export interface ApiKeyInfo {
  _id: string;
  name: string;
  /** "xd_AbC1…": enough to tell keys apart. The full key is only ever shown when it is created. */
  preview: string;
  /** Empty = every app. */
  apps: string[];
  readOnly: boolean;
  expiresAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface NewApiKey {
  name: string;
  apps?: string[];
  readOnly?: boolean;
  expiresInDays?: number;
}

export const apiKeyKeys = {
  all: ["user", "api-keys"] as const,
};

export const useApiKeys = () => {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: apiKeyKeys.all });

  const { data, isLoading } = useQuery({
    queryKey: apiKeyKeys.all,
    queryFn: async () => (await api.get<{ apiKeys: ApiKeyInfo[] }>("/api/user/api-keys")).apiKeys,
  });

  const create = useMutation({
    mutationFn: (body: NewApiKey) => api.post<{ key: string; apiKey: ApiKeyInfo }>("/api/user/api-keys", body),
    onSuccess: invalidate,
  });

  const revoke = useMutation({
    mutationFn: (keyId: string) => api.delete<unknown>(`/api/user/api-keys/${keyId}`),
    onSuccess: invalidate,
  });

  return { apiKeys: data ?? [], isLoading, create, revoke };
};
