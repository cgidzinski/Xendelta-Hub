import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { XenStartConfig } from "@shared/xenstart";
import { api, apiClient, type ApiError } from "../../config/api";
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
    mutationFn: ({ config, background }: { config: XenStartConfig; background?: File }) => {
      if (!background) return api.put<XenStartConfig>(path, config);
      const form = new FormData();
      form.append("config", JSON.stringify(config));
      form.append("background", background);
      return api.put<XenStartConfig>(path, form);
    },
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

  const imageId = query.data?.backgroundImageId;
  const background = useQuery({
    queryKey: xenstartKeys.background(user.id, imageId),
    enabled: !!imageId,
    staleTime: Infinity,
    placeholderData: imageId && save.data?.backgroundImageId === imageId ? save.variables?.background : undefined,
    queryFn: async ({ signal }) =>
      (await apiClient.get<Blob>(`${path}/background/${imageId}`, { responseType: "blob", signal })).data,
  });

  return { query, save, background: background.data };
}
