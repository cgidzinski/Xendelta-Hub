import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";
import { casinoBalanceKeys } from "./useCasinoBalance";
import { casinoLedgerKeys } from "./useCasinoLedger";
import { casinoRanchKeys, RanchItem } from "./useCasinoRanch";

export interface GardenSquare {
    squareId: number;
    seedType: string | null;
    seedLabel: string | null;
    plantedAt: string | null;
    readyAt: string | null;
    lastWateredAt: string | null;
    waterAmount: number;
    waterCount: number;
    verminHits: number;
    // Per-square, not the page-level base - shorter than the base once bonemeal has been
    // bought for this square.
    waterCooldownMs: number;
    cost: number;
    baseMultiplier: number;
    variance: number;
    verminChance: number;
    diseaseChance: number;
    protection: { pesticide: boolean; fungicide: boolean; fertilized: boolean; bonemeal: boolean };
    status: "empty" | "growing" | "ready" | "dead";
}

export interface SeedTier {
    key: string;
    label: string;
    cost: number;
    growDurationMs: number;
    waterAmount: number;
    verminChance: number;
    diseaseChance: number;
    baseMultiplier: number;
    variance: number;
}

export interface GardenState {
    squares: GardenSquare[];
    seedTiers: SeedTier[];
    protectionCost: { pesticide: number; fungicide: number; fertilizer: number; bonemeal: number };
    waterCooldownMs: number;
    neglectGraceMs: number;
    cleanupFee: number;
}

export const casinoGardenKeys = {
    all: ["casinoGarden"] as const,
};

const fetchGarden = async (): Promise<GardenState> =>
    (await apiClient.get<ApiResponse<GardenState>>("/api/casino/ranch/garden")).data.data!;

export const useCasinoGarden = () => {
    const { isAuthenticated } = useAuth();
    const queryClient = useQueryClient();

    const { data, isLoading, refetch } = useQuery({
        queryKey: casinoGardenKeys.all,
        queryFn: fetchGarden,
        enabled: isAuthenticated,
        staleTime: 5 * 1000,
        refetchInterval: 10 * 1000,
    });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: casinoGardenKeys.all });
        queryClient.invalidateQueries({ queryKey: casinoBalanceKeys.all });
        queryClient.invalidateQueries({ queryKey: casinoLedgerKeys.all });
    };

    const { mutateAsync: plant, isPending: isPlanting } = useMutation({
        mutationFn: async (params: { squareId: number; seedType: string }) =>
            (await apiClient.post<ApiResponse<{ square: GardenSquare; balance: string }>>("/api/casino/ranch/garden/plant", params)).data.data!,
        onSuccess: invalidate,
    });

    const { mutateAsync: water, isPending: isWatering } = useMutation({
        mutationFn: async (params: { squareId: number }) =>
            (await apiClient.post<ApiResponse<{ square: GardenSquare }>>("/api/casino/ranch/garden/water", params)).data.data!,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: casinoGardenKeys.all }),
    });

    const { mutateAsync: protect, isPending: isProtecting } = useMutation({
        mutationFn: async (params: { squareId: number; item: "pesticide" | "fungicide" | "fertilizer" | "bonemeal" }) =>
            (await apiClient.post<ApiResponse<{ square: GardenSquare; balance: string }>>("/api/casino/ranch/garden/protect", params)).data.data!,
        onSuccess: invalidate,
    });

    // Harvest no longer moves cheddar - it credits a produce item to the shared ranch
    // inventory (sold later from the Inventory tab), so there's no balance/ledger change
    // to invalidate here, just the ranch query that holds the inventory.
    const { mutateAsync: harvest, isPending: isHarvesting } = useMutation({
        mutationFn: async (params: { squareId: number }) =>
            (
                await apiClient.post<ApiResponse<{ item: { key: string; label: string; quantity: number }; items: RanchItem[] }>>(
                    "/api/casino/ranch/garden/harvest",
                    params
                )
            ).data.data!,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: casinoGardenKeys.all });
            queryClient.invalidateQueries({ queryKey: casinoRanchKeys.all });
        },
    });

    const { mutateAsync: clear, isPending: isClearing } = useMutation({
        mutationFn: async (params: { squareId: number }) =>
            (await apiClient.post<ApiResponse<{ square: GardenSquare; balance: string }>>("/api/casino/ranch/garden/clear", params)).data.data!,
        onSuccess: invalidate,
    });

    return {
        squares: data?.squares ?? [],
        seedTiers: data?.seedTiers ?? [],
        protectionCost: data?.protectionCost ?? { pesticide: 0, fungicide: 0, fertilizer: 0, bonemeal: 0 },
        waterCooldownMs: data?.waterCooldownMs ?? 60 * 60 * 1000,
        neglectGraceMs: data?.neglectGraceMs ?? 24 * 60 * 60 * 1000,
        cleanupFee: data?.cleanupFee ?? 0,
        isLoading,
        refetch,
        plant,
        isPlanting,
        water,
        isWatering,
        protect,
        isProtecting,
        harvest,
        isHarvesting,
        clear,
        isClearing,
    };
};
