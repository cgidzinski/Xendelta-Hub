import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";
import { casinoBalanceKeys } from "./useCasinoBalance";
import { casinoLedgerKeys } from "./useCasinoLedger";

export interface StillBatch {
    startedAt: string;
    ingredientCost: number;
    peakAt: string;
    lastBribeAt: string;
    bribeCount: number;
    nextBribeCost: number;
    raided: boolean;
    currentMultiplier: number;
    raidRiskPercent: number;
}

export interface StillState {
    stillLevel: number;
    maxStillLevel: number;
    batch: StillBatch | null;
    ingredientCost: number;
    bribeCost: number;
    upgradeCost: number;
}

export const casinoStillKeys = {
    all: ["casinoStill"] as const,
};

const fetchStill = async (): Promise<StillState> =>
    (await apiClient.get<ApiResponse<StillState>>("/api/casino/still")).data.data!;

export const useCasinoStill = () => {
    const { isAuthenticated } = useAuth();
    const queryClient = useQueryClient();

    const { data, isLoading, refetch } = useQuery({
        queryKey: casinoStillKeys.all,
        queryFn: fetchStill,
        enabled: isAuthenticated,
        staleTime: 2 * 1000,
        refetchInterval: 5 * 1000,
    });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: casinoStillKeys.all });
        queryClient.invalidateQueries({ queryKey: casinoBalanceKeys.all });
        queryClient.invalidateQueries({ queryKey: casinoLedgerKeys.all });
    };

    const { mutateAsync: start, isPending: isStarting } = useMutation({
        mutationFn: async () => (await apiClient.post<ApiResponse<{ batch: StillBatch; balance: string }>>("/api/casino/still/start")).data.data!,
        onSuccess: invalidate,
    });

    const { mutateAsync: bribe, isPending: isBribing } = useMutation({
        mutationFn: async () => (await apiClient.post<ApiResponse<{ batch: StillBatch; balance: string }>>("/api/casino/still/bribe")).data.data!,
        onSuccess: invalidate,
    });

    const { mutateAsync: collect, isPending: isCollecting } = useMutation({
        mutationFn: async () =>
            (await apiClient.post<ApiResponse<{ raided: boolean; payout: number; balance?: string }>>("/api/casino/still/collect")).data.data!,
        onSuccess: invalidate,
    });

    const { mutateAsync: upgrade, isPending: isUpgrading } = useMutation({
        mutationFn: async () =>
            (await apiClient.post<ApiResponse<{ stillLevel: number; balance: string }>>("/api/casino/still/upgrade")).data.data!,
        onSuccess: invalidate,
    });

    return {
        stillLevel: data?.stillLevel ?? 1,
        maxStillLevel: data?.maxStillLevel ?? 1,
        batch: data?.batch ?? null,
        ingredientCost: data?.ingredientCost ?? 0,
        bribeCost: data?.bribeCost ?? 0,
        upgradeCost: data?.upgradeCost ?? 0,
        isLoading,
        refetch,
        start,
        isStarting,
        bribe,
        isBribing,
        collect,
        isCollecting,
        upgrade,
        isUpgrading,
    };
};
