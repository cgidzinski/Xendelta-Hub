import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import type { XenSplitBalancesData, SettleDebtInput } from "./types";

export function useXenSplitBalances(groupId: string) {
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["xensplit", "balances", groupId],
    queryFn: async () => {
      const res = await apiClient.get(`/api/xensplit/groups/${groupId}/balances`);
      return res.data.data as XenSplitBalancesData;
    },
    enabled: !!groupId,
    staleTime: 0, // Always refetch in background
    placeholderData: (prev) => prev,
  });

  const settleDebtMutation = useMutation({
    mutationFn: async (input: SettleDebtInput) => {
      const res = await apiClient.post(`/api/xensplit/groups/${groupId}/settle`, input);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["xensplit", "balances", groupId] });
      queryClient.invalidateQueries({ queryKey: ["xensplit", "group", groupId] });
    },
  });

  const deleteSettlementMutation = useMutation({
    mutationFn: async (settlementId: string) => {
      const res = await apiClient.delete(`/api/xensplit/groups/${groupId}/settlements/${settlementId}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["xensplit", "balances", groupId] });
      queryClient.invalidateQueries({ queryKey: ["xensplit", "group", groupId] });
    },
  });

  return {
    balancesData: data,
    isLoading,
    isError,
    error,
    settleDebt: settleDebtMutation.mutate,
    isSettlingDebt: settleDebtMutation.isPending,
    settleDebtError: settleDebtMutation.error,
    deleteSettlement: deleteSettlementMutation.mutate,
    isDeletingSettlement: deleteSettlementMutation.isPending,
  };
}