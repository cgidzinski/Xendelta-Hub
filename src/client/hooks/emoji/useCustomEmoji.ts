import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosProgressEvent } from "axios";
import type { CustomEmoji, CustomEmojiScope } from "@shared/emoji";
import { api } from "../../config/api";
import { useAuth } from "../../contexts/AuthContext";
import { useRealtime } from "../useRealtime";
import { emojiKeys } from "./keys";

/** Every custom emoji the person can use (their communities' and chats'), with lookups by id and by owner. */
export function useCustomEmoji() {
  const { isAuthenticated } = useAuth();
  const query = useQuery({
    queryKey: emojiKeys.list(),
    queryFn: async () => (await api.get<{ emoji: CustomEmoji[] }>("/api/emoji")).emoji,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
  const emoji = useMemo(() => query.data ?? [], [query.data]);
  const byId = useMemo(() => new Map(emoji.map((e) => [e._id, e])), [emoji]);
  return { ...query, emoji, byId };
}

/** The emoji that belong to one community or chat. */
export const emojiOfScope = (emoji: CustomEmoji[], scope: CustomEmojiScope) =>
  emoji.filter((e) => e.scope.type === scope.type && e.scope.id === scope.id);

/** Add, rename and remove custom emoji. Each refreshes the list. */
export function useEmojiActions() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: emojiKeys.list() });

  const upload = useMutation({
    mutationFn: async (input: {
      scope: CustomEmojiScope;
      name: string;
      file: File;
      onUploadProgress?: (event: AxiosProgressEvent) => void;
    }) => {
      const form = new FormData();
      form.append("name", input.name);
      form.append("scopeType", input.scope.type);
      form.append("scopeId", input.scope.id);
      form.append("file", input.file);
      return (await api.post<{ emoji: CustomEmoji }>("/api/emoji", form, { onUploadProgress: input.onUploadProgress }))
        .emoji;
    },
    onSuccess: refresh,
  });
  const rename = useMutation({
    mutationFn: async (input: { emojiId: string; name: string }) =>
      (await api.patch<{ emoji: CustomEmoji }>(`/api/emoji/${input.emojiId}`, { name: input.name })).emoji,
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (emojiId: string) => api.delete<unknown>(`/api/emoji/${emojiId}`),
    onSuccess: refresh,
  });
  return { upload, rename, remove };
}

/** Keeps the list current when someone adds, renames or removes an emoji. Mounted once while signed in. */
export function useEmojiRealtime() {
  const queryClient = useQueryClient();
  useRealtime("emoji:changed", () => {
    queryClient.invalidateQueries({ queryKey: emojiKeys.list() });
  });
}
