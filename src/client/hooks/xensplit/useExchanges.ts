import { xensplitKeys } from "./keys";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient, api } from "../../config/api";
import type { CreateExchangeInput } from "./types";

export function useXenSplitExchanges(groupId: string) {
  const queryClient = useQueryClient();

  const addExchangeMutation = useMutation({
    mutationFn: async (input: CreateExchangeInput) => {
      const res = await apiClient.post(`/api/xensplit/groups/${groupId}/exchanges`, input);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: xensplitKeys.group(groupId) });
      queryClient.invalidateQueries({ queryKey: xensplitKeys.balances(groupId) });
    },
  });

  const deleteExchangeMutation = useMutation({
    mutationFn: async (exchangeId: string) => {
      const res = await apiClient.delete(`/api/xensplit/groups/${groupId}/exchanges/${exchangeId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: xensplitKeys.group(groupId) });
      queryClient.invalidateQueries({ queryKey: xensplitKeys.balances(groupId) });
    },
  });

  const liveRateMutation = useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      return api.get<{ rate: number }>(`/api/xensplit/exchange-rate`, { params: { from, to } });
    },
  });

  // Restore a soft-deleted exchange. Group owner only, server-side.
  const restoreExchangeMutation = useMutation({
    mutationFn: async (exchangeId: string) => {
      const res = await apiClient.post(`/api/xensplit/groups/${groupId}/exchanges/${exchangeId}/restore`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: xensplitKeys.group(groupId) });
      queryClient.invalidateQueries({ queryKey: xensplitKeys.balances(groupId) });
    },
  });

  return {
    addExchange: addExchangeMutation.mutate,
    isAddingExchange: addExchangeMutation.isPending,
    restoreExchange: restoreExchangeMutation.mutate,
    isRestoringExchange: restoreExchangeMutation.isPending,
    deleteExchange: deleteExchangeMutation.mutate,
    isDeletingExchange: deleteExchangeMutation.isPending,
    fetchLiveRate: liveRateMutation.mutateAsync,
    isFetchingLiveRate: liveRateMutation.isPending,
  };
}

// Passive, cacheable read of the live rate for a currency pair — backed by the server's own
// few-hours cache, so this just avoids redundant client-side refetches on every remount.
export function useLiveRateQuery(from: string, to: string, enabled: boolean) {
  return useQuery({
    queryKey: xensplitKeys.rate(from, to),
    queryFn: async () => {
      return api.get<{ rate: number; fetchedAt: number }>(`/api/xensplit/exchange-rate`, { params: { from, to } });
    },
    enabled,
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}
