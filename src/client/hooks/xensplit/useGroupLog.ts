import { useInfiniteQuery } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import type { XenSplitLogPage } from "./types";

/**
 * The group's activity log, newest first. Owner only - the server answers 403 to anyone
 * else, so callers pass `enabled: isCreator`.
 *
 * Keyed under ["xensplit", "group", groupId] so every mutation and socket update that
 * invalidates the group invalidates the log with it.
 */
export function useXenSplitGroupLog(groupId: string, enabled: boolean) {
  const query = useInfiniteQuery({
    queryKey: ["xensplit", "group", groupId, "log"],
    queryFn: async ({ pageParam }) => {
      const res = await apiClient.get(`/api/xensplit/groups/${groupId}/log`, {
        params: pageParam ? { before: pageParam } : {},
      });
      return res.data.data as XenSplitLogPage;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: !!groupId && enabled,
    staleTime: 0,
  });

  return {
    entries: query.data?.pages.flatMap((p) => p.entries) ?? [],
    users: Object.assign({}, ...(query.data?.pages.map((p) => p.users) ?? [])) as XenSplitLogPage["users"],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    hasMore: query.hasNextPage,
    loadMore: query.fetchNextPage,
    isLoadingMore: query.isFetchingNextPage,
  };
}
