import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";

export type LeaderboardRange = "today" | "week" | "all";

export interface LeaderboardPlayerEntry {
  rank: number;
  userId: string;
  username: string;
  avatar: string | null;
  netWinnings: string;
  totalWagered: string;
  roundsPlayed: number;
}

export interface LeaderboardBiggestWinEntry {
  rank: number;
  userId: string;
  username: string;
  avatar: string | null;
  game: string;
  amount: string;
  createdAt: string;
}

interface CasinoLeaderboardResponse {
  range: string;
  netWinners: LeaderboardPlayerEntry[];
  netLosers: LeaderboardPlayerEntry[];
  mostRounds: LeaderboardPlayerEntry[];
  biggestWins: LeaderboardBiggestWinEntry[];
}

export const casinoLeaderboardKeys = {
  byRange: (range: LeaderboardRange) => ["casinoLeaderboard", range] as const,
};

const fetchCasinoLeaderboard = async (range: LeaderboardRange): Promise<CasinoLeaderboardResponse> => {
  const response = await apiClient.get<ApiResponse<CasinoLeaderboardResponse>>(`/api/casino/leaderboard?range=${range}`);
  return response.data.data!;
};

export const useCasinoLeaderboard = (range: LeaderboardRange) => {
  const { isAuthenticated } = useAuth();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: casinoLeaderboardKeys.byRange(range),
    queryFn: () => fetchCasinoLeaderboard(range),
    enabled: isAuthenticated,
    staleTime: 30 * 1000,
  });

  return {
    netWinners: data?.netWinners ?? [],
    netLosers: data?.netLosers ?? [],
    mostRounds: data?.mostRounds ?? [],
    biggestWins: data?.biggestWins ?? [],
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
  };
};
