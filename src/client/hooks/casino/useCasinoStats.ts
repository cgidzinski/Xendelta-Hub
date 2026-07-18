import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";

export interface CasinoGameStats {
    slug: string;
    label: string;
    winAmount: string;
    lossAmount: string;
    roundsPlayed: number;
}

export type StatsRange = "today" | "week" | "all";

export const casinoStatsKeys = {
    all: ["casinoStats"] as const,
    byRange: (range: StatsRange) => ["casinoStats", range] as const,
};

const fetchCasinoStats = async (range: StatsRange): Promise<CasinoGameStats[]> => {
    const response = await apiClient.get<ApiResponse<{ range: string; games: CasinoGameStats[] }>>(
        `/api/casino/stats?range=${range}`
    );
    return response.data.data!.games;
};

export const useCasinoStats = (range: StatsRange) => {
    const { isAuthenticated } = useAuth();
    const { data, isLoading, isError, error, refetch } = useQuery({
        queryKey: casinoStatsKeys.byRange(range),
        queryFn: () => fetchCasinoStats(range),
        enabled: isAuthenticated,
        staleTime: 30 * 1000,
    });

    return {
        games: data ?? [],
        isLoading,
        isError,
        error: error as Error | null,
        refetch,
    };
};
