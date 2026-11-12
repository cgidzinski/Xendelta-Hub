import { useCallback, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../config/api";
import type { AttentionResponse, FeedPage, FeedPrefs } from "@shared/feed";
import { useRealtime } from "../useRealtime";
import { useSocketInvalidate } from "../useSocketEvent";
import { feedKeys } from "./keys";

/** The activity feed, a page at a time. `app` narrows it to one sub-app. */
export const useFeed = (app?: string) =>
  useInfiniteQuery({
    queryKey: feedKeys.list(app),
    initialPageParam: "",
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) params.set("cursor", pageParam);
      if (app) params.set("app", app);
      const qs = params.toString();
      return api.get<FeedPage>(`/api/feed${qs ? `?${qs}` : ""}`);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

/** What is waiting on the person, kept fresh when the things it is made from change. */
export const useAttention = () => {
  const keys = [feedKeys.attention()];
  useSocketInvalidate("xensplit:groups_updated", keys);
  useSocketInvalidate("xensplit:group_update", keys);
  useSocketInvalidate("xenbudget:book_update", keys);
  useSocketInvalidate("chat:message", keys);
  useSocketInvalidate("chat:read", keys);
  return useQuery({
    queryKey: feedKeys.attention(),
    queryFn: () => api.get<AttentionResponse>("/api/feed/attention"),
    staleTime: 30_000,
  });
};

/**
 * How many new events arrived since the feed was last loaded. The feed does not reshuffle under the reader; it
 * shows a "N new" pill and loads them on request.
 */
export const useNewFeedCount = () => {
  const [count, setCount] = useState(0);
  useRealtime("feed:new", () => setCount((n) => n + 1));
  const reset = useCallback(() => setCount(0), []);
  return { count, reset };
};

export const useFeedPrefs = () => {
  const queryClient = useQueryClient();
  const prefs = useQuery({ queryKey: feedKeys.prefs(), queryFn: () => api.get<FeedPrefs>("/api/feed/prefs") });
  const refreshLists = () => queryClient.invalidateQueries({ queryKey: feedKeys.lists() });

  const save = useMutation({
    mutationFn: (next: FeedPrefs) => api.put<FeedPrefs>("/api/feed/prefs", next),
    onSuccess: (data) => {
      queryClient.setQueryData(feedKeys.prefs(), data);
      return refreshLists();
    },
  });
  const hide = useMutation({
    mutationFn: (ids: string[]) => api.post("/api/feed/hide", { ids }),
    onSuccess: refreshLists,
  });
  return { prefs: prefs.data, savePrefs: save.mutateAsync, hide: hide.mutateAsync };
};
