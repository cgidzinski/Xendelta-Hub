import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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

export interface AdminCasinoGame {
    slug: string;
    label: string;
    disabled: boolean;
}

export interface AdminCasinoStatus {
    open: boolean;
    reason: "manual" | "broke" | null;
    bankBalance: number;
    disabledGames: string[];
}

interface AdminCasinoGamesResponse {
    games: AdminCasinoGame[];
    casino: AdminCasinoStatus;
}

export const adminCasinoKeys = {
    all: ["adminCasino"] as const,
    byRange: (range: StatsRange) => ["adminCasino", range] as const,
    dailyStats: (days: number) => ["adminCasino", "dailyStats", days] as const,
    games: ["adminCasino", "games"] as const,
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

const clearJackpots = async (): Promise<void> => {
    await apiClient.post("/api/admin/casino/jackpots/clear");
};

const clearStats = async (): Promise<void> => {
    await apiClient.post("/api/admin/casino/stats/clear");
};

const fetchAdminCasinoGames = async (): Promise<AdminCasinoGamesResponse> => {
    const response = await apiClient.get<ApiResponse<AdminCasinoGamesResponse>>("/api/admin/casino/games");
    return response.data.data!;
};

const toggleGame = async ({ slug, disabled }: { slug: string; disabled: boolean }): Promise<void> => {
    await apiClient.post(`/api/admin/casino/games/${slug}/toggle`, { disabled });
};

const toggleCasinoOpen = async (open: boolean): Promise<void> => {
    await apiClient.post("/api/admin/casino/toggle-open", { open });
};

export const useAdminCasino = (range: StatsRange) => {
    const queryClient = useQueryClient();
    const { data, isLoading, isError, error, refetch } = useQuery({
        queryKey: adminCasinoKeys.byRange(range),
        queryFn: () => fetchAdminCasinoStats(range),
        staleTime: 30 * 1000,
    });

    const { mutateAsync: clearJackpotsMutation, isPending: isClearingJackpots } = useMutation({
        mutationFn: clearJackpots,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: adminCasinoKeys.all });
        },
    });

    const { mutateAsync: clearStatsMutation, isPending: isClearingStats } = useMutation({
        mutationFn: clearStats,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: adminCasinoKeys.all });
        },
    });

    return {
        games: data?.games ?? [],
        isLoading,
        isError,
        error: error as Error | null,
        refetch,
        clearJackpots: clearJackpotsMutation,
        isClearingJackpots,
        clearStats: clearStatsMutation,
        isClearingStats,
    };
};

export const useAdminCasinoGames = () => {
    const queryClient = useQueryClient();
    const { data, isLoading, isError, error } = useQuery({
        queryKey: adminCasinoKeys.games,
        queryFn: fetchAdminCasinoGames,
        staleTime: 15 * 1000,
    });

    const { mutateAsync: toggleGameMutation, isPending: isTogglingGame } = useMutation({
        mutationFn: toggleGame,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: adminCasinoKeys.games });
        },
    });

    const { mutateAsync: toggleCasinoOpenMutation, isPending: isTogglingCasinoOpen } = useMutation({
        mutationFn: toggleCasinoOpen,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: adminCasinoKeys.games });
        },
    });

    return {
        games: data?.games ?? [],
        casino: data?.casino,
        isLoading,
        isError,
        error: error as Error | null,
        toggleGame: toggleGameMutation,
        isTogglingGame,
        toggleCasinoOpen: toggleCasinoOpenMutation,
        isTogglingCasinoOpen,
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
