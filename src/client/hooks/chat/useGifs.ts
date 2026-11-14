import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { ChatGif } from "@shared/gif";
import { api } from "../../config/api";
import { useAuth } from "../../contexts/AuthContext";

/** Whether GIFs are set up on this server (the picker's button is left out when they aren't). */
export function useGifsEnabled() {
  const { isAuthenticated } = useAuth();
  const query = useQuery({
    queryKey: ["gifs", "status"],
    queryFn: async () => (await api.get<{ enabled: boolean }>("/api/gifs/status")).enabled,
    enabled: isAuthenticated,
    staleTime: Infinity,
    retry: false,
  });
  return !!query.data;
}

/** Search GIFs, or trending ones with no words. A page at a time. */
export function useGifSearch(q: string, enabled: boolean) {
  const { isAuthenticated } = useAuth();
  return useInfiniteQuery({
    queryKey: ["gifs", "search", q],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api.get<{ gifs: ChatGif[]; next: number | null }>("/api/gifs", { params: { q, offset: pageParam } }),
    getNextPageParam: (last) => last.next ?? undefined,
    enabled: isAuthenticated && enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}
