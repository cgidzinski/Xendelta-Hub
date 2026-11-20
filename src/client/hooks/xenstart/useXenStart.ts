import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { XenStartConfig } from "@shared/xenstart";
import { api, type ApiError } from "../../config/api";
import { useAuth } from "../../contexts/AuthContext";
import { feedKeys } from "../feed/keys";
import { useSocketInvalidate } from "../useSocketEvent";
import { xenstartKeys } from "./keys";

const path = "/api/xenstart";

export function useXenStart() {
  const { user } = useAuth();
  const client = useQueryClient();
  const key = xenstartKeys.config(user.id);
  const query = useQuery({ queryKey: key, queryFn: () => api.get<XenStartConfig>(path), staleTime: 0 });
  useSocketInvalidate("xenstart:update", [key, feedKeys.usage()]);

  const save = useMutation({
    mutationFn: (config: XenStartConfig) => api.put<XenStartConfig>(path, config),
    onSuccess: (config) => {
      client.setQueryData<XenStartConfig>(key, (current) =>
        current && current.revision > config.revision ? current : config,
      );
      void client.invalidateQueries({ queryKey: feedKeys.usage() });
    },
    onError: async (error: ApiError) => {
      if (error.status === 409) await client.invalidateQueries({ queryKey: key });
    },
  });

  return { query, save };
}
