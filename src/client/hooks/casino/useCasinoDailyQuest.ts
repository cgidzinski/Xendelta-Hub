import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";
import { casinoBalanceKeys } from "./useCasinoBalance";
import { casinoLedgerKeys } from "./useCasinoLedger";

export interface CasinoDailyQuestStatus {
  target: number;
  roundsPlayed: number;
  claimed: boolean;
  canClaim: boolean;
  reward: number;
}

export const casinoDailyQuestKeys = {
  all: ["casinoDailyQuest"] as const,
};

const fetchDailyQuest = async (): Promise<CasinoDailyQuestStatus> => {
  const response = await apiClient.get<ApiResponse<CasinoDailyQuestStatus>>("/api/casino/daily-quest");
  return response.data.data!;
};

const claimDailyQuest = async (): Promise<{ balance: string }> => {
  const response = await apiClient.post<ApiResponse<{ balance: string }>>("/api/casino/daily-quest/claim");
  return response.data.data!;
};

export const useCasinoDailyQuest = () => {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: casinoDailyQuestKeys.all,
    queryFn: fetchDailyQuest,
    enabled: isAuthenticated,
    staleTime: 15 * 1000,
  });

  const { mutateAsync: claim, isPending: isClaiming } = useMutation({
    mutationFn: claimDailyQuest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: casinoDailyQuestKeys.all });
      queryClient.invalidateQueries({ queryKey: casinoBalanceKeys.all });
      queryClient.invalidateQueries({ queryKey: casinoLedgerKeys.all });
    },
  });

  return {
    target: data?.target ?? 0,
    roundsPlayed: data?.roundsPlayed ?? 0,
    claimed: data?.claimed ?? false,
    canClaim: data?.canClaim ?? false,
    reward: data?.reward ?? 0,
    isLoading,
    claim,
    isClaiming,
    refetch,
  };
};
