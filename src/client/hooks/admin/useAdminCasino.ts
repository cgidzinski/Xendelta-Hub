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
    minBankBalance: number;
}

interface AdminCasinoGamesResponse {
    games: AdminCasinoGame[];
    casino: AdminCasinoStatus;
}

export interface DiscordLinkedUser {
    _id: string;
    username: string;
    avatar: string | null;
    discordId: string;
}

export interface AdminUserWallet {
    linked: boolean;
    balance: string | null;
}

export interface AdminCasinoPlayerStats {
    userId: string;
    username: string;
    avatar: string | null;
    winAmount: string;
    lossAmount: string;
    roundsPlayed: number;
    net: string;
}

export interface AdminCasinoPlayerStatsTotals {
    winAmount: string;
    lossAmount: string;
    roundsPlayed: number;
    playerCount: number;
}

interface AdminCasinoPlayerStatsResponse {
    range: string;
    players: AdminCasinoPlayerStats[];
    totals: AdminCasinoPlayerStatsTotals;
    truncated: boolean;
}

export const adminCasinoKeys = {
    all: ["adminCasino"] as const,
    byRange: (range: StatsRange) => ["adminCasino", range] as const,
    dailyStats: (days: number) => ["adminCasino", "dailyStats", days] as const,
    games: ["adminCasino", "games"] as const,
    discordUsers: ["adminCasino", "discordUsers"] as const,
    wallet: (userId: string) => ["adminCasino", "wallet", userId] as const,
    playerStatsByRange: (range: StatsRange) => ["adminCasino", "playerStats", range] as const,
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

const fetchDiscordUsers = async (): Promise<DiscordLinkedUser[]> => {
    const response = await apiClient.get<ApiResponse<{ users: DiscordLinkedUser[] }>>("/api/admin/casino/discord-users");
    return response.data.data!.users;
};

const fetchUserWallet = async (userId: string): Promise<AdminUserWallet> => {
    const response = await apiClient.get<ApiResponse<AdminUserWallet>>(`/api/admin/casino/users/${userId}/wallet`);
    return response.data.data!;
};

const fetchAdminCasinoPlayerStats = async (range: StatsRange): Promise<AdminCasinoPlayerStatsResponse> => {
    const response = await apiClient.get<ApiResponse<AdminCasinoPlayerStatsResponse>>(
        `/api/admin/casino/player-stats?range=${range}`
    );
    return response.data.data!;
};

const sendMoney = async (params: { userId: string; amount: number; note: string; requestId: string }): Promise<{ balance: string }> => {
    const response = await apiClient.post<ApiResponse<{ balance: string }>>(`/api/admin/casino/users/${params.userId}/send-money`, {
        amount: params.amount,
        note: params.note,
        requestId: params.requestId,
    });
    return response.data.data!;
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

export const useAdminCasinoPlayerStats = (range: StatsRange) => {
    const { data, isLoading, isError, error, refetch } = useQuery({
        queryKey: adminCasinoKeys.playerStatsByRange(range),
        queryFn: () => fetchAdminCasinoPlayerStats(range),
        staleTime: 30 * 1000,
    });

    return {
        players: data?.players ?? [],
        totals: data?.totals ?? null,
        truncated: data?.truncated ?? false,
        isLoading,
        isError,
        error: error as Error | null,
        refetch,
    };
};

export const useAdminCasinoDiscordUsers = () => {
    const { data, isLoading, isError, error } = useQuery({
        queryKey: adminCasinoKeys.discordUsers,
        queryFn: fetchDiscordUsers,
        staleTime: 60 * 1000,
    });

    return {
        users: data ?? [],
        isLoading,
        isError,
        error: error as Error | null,
    };
};

export const useAdminUserWallet = (userId: string | null) => {
    const { data, isLoading, isError, error } = useQuery({
        queryKey: adminCasinoKeys.wallet(userId ?? ""),
        queryFn: () => fetchUserWallet(userId as string),
        enabled: !!userId,
    });

    return {
        wallet: data,
        isLoading,
        isError,
        error: error as Error | null,
    };
};

export const useAdminSendMoney = () => {
    const queryClient = useQueryClient();
    const { mutateAsync: sendMoneyMutation, isPending: isSendingMoney } = useMutation({
        mutationFn: sendMoney,
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: adminCasinoKeys.wallet(variables.userId) });
        },
    });

    return {
        sendMoney: sendMoneyMutation,
        isSendingMoney,
    };
};
