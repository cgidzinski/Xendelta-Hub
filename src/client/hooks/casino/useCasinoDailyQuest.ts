import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";
import { casinoBalanceKeys } from "./useCasinoBalance";
import { casinoLedgerKeys } from "./useCasinoLedger";

export interface DailyQuestItem {
  key: string;
  label: string;
  target: number;
  reward: number;
  progress: number;
  claimed: boolean;
  canClaim: boolean;
}

export interface CasinoDailyQuestStatus {
  quests: DailyQuestItem[];
}

export const casinoDailyQuestKeys = {
  all: ["casinoDailyQuest"] as const,
};

const fetchDailyQuest = async (): Promise<CasinoDailyQuestStatus> => {
  const response = await apiClient.get<ApiResponse<CasinoDailyQuestStatus>>("/api/casino/daily-quest");
  return response.data.data!;
};

const claimDailyQuest = async (key: string): Promise<{ balance: string; key: string; reward: number }> => {
  const response = await apiClient.post<ApiResponse<{ balance: string; key: string; reward: number }>>("/api/casino/daily-quest/claim", { key });
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

  const { mutateAsync: claimRaw, isPending: isClaiming } = useMutation({
    mutationFn: claimDailyQuest,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: casinoDailyQuestKeys.all });
      queryClient.invalidateQueries({ queryKey: casinoBalanceKeys.all });
      queryClient.invalidateQueries({ queryKey: casinoLedgerKeys.all });
    },
  });

  const quests = data?.quests ?? [];

  const claim = async (key: string) => {
    return claimRaw(key);
  };

  return {
    quests,
    isLoading,
    claim,
    isClaiming,
    refetch,
  };
};
