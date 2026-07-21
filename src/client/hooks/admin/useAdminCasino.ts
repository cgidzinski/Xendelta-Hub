import { useQuery } from "@tanstack/react-query";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";

export interface AdminCasinoGameStats {
    slug: string;
    label: string;
    winAmount: string;
    lossAmount: string;
    roundsPlayed: number;
    jackpotPool: number | null;
}

export interface DailyStatsRow {
    date: string;
    balance: number;
    amountIn: number;
    amountOut: number;
    net: number;
    roundsPlayed: number;
}

export type StatsRange = "today" | "week" | "all";

interface AdminCasinoResponse {
    range: string;
    games: AdminCasinoGameStats[];
}

export const adminCasinoKeys = {
    all: ["adminCasino"] as const,
    byRange: (range: StatsRange) => ["adminCasino", range] as const,
    dailyStats: (days: number) => ["adminCasino", "dailyStats", days] as const,
};

const fetchAdminCasinoStats = async (range: StatsRange): Promise<AdminCasinoResponse> => {
    const response = await apiClient.get<ApiResponse<AdminCasinoResponse>>(
        `/api/admin/casino/stats?range=${range}`
    );
    return response.data.data!;
};

const fetchDailyStats = async (days: number): Promise<DailyStatsRow[]> => {
    const response = await apiClient.get<ApiResponse<{ days: DailyStatsRow[] }>>(
        `/api/admin/casino/daily-stats?days=${days}`
    );
    return response.data.data!.days;
};

export const useAdminCasino = (range: StatsRange) => {
    const { data, isLoading, isError, error, refetch } = useQuery({
        queryKey: adminCasinoKeys.byRange(range),
        queryFn: () => fetchAdminCasinoStats(range),
        staleTime: 30 * 1000,
    });

    return {
        games: data?.games ?? [],
        isLoading,
        isError,
        error: error as Error | null,
        refetch,
    };
};

export const useAdminCasinoDailyStats = (days: number = 5) => {
    const { data, isLoading, isError, error } = useQuery({
        queryKey: adminCasinoKeys.dailyStats(days),
        queryFn: () => fetchDailyStats(days),
        staleTime: 30 * 1000,
    });

    return {
        dailyStats: data ?? [],
        isLoading,
        isError,
        error: error as Error | null,
    };
};
