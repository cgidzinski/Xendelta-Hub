import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import type { CreateExchangeInput } from "./types";

export function useXenSplitExchanges(groupId: string) {
  const queryClient = useQueryClient();

  const addExchangeMutation = useMutation({
    mutationFn: async (input: CreateExchangeInput) => {
      const res = await apiClient.post(`/api/xensplit/groups/${groupId}/exchanges`, input);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["xensplit", "group", groupId] });
      queryClient.invalidateQueries({ queryKey: ["xensplit", "balances", groupId] });
    },
  });

  const deleteExchangeMutation = useMutation({
    mutationFn: async (exchangeId: string) => {
      const res = await apiClient.delete(`/api/xensplit/groups/${groupId}/exchanges/${exchangeId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["xensplit", "group", groupId] });
      queryClient.invalidateQueries({ queryKey: ["xensplit", "balances", groupId] });
    },
  });

  const liveRateMutation = useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      const res = await apiClient.get(`/api/xensplit/exchange-rate`, { params: { from, to } });
      return res.data.data as { rate: number };
    },
  });

  return {
    addExchange: addExchangeMutation.mutate,
    isAddingExchange: addExchangeMutation.isPending,
    deleteExchange: deleteExchangeMutation.mutate,
    isDeletingExchange: deleteExchangeMutation.isPending,
    fetchLiveRate: liveRateMutation.mutateAsync,
    isFetchingLiveRate: liveRateMutation.isPending,
  };
}
