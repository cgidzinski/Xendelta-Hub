import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";
import { casinoBalanceKeys } from "./useCasinoBalance";
import { casinoLedgerKeys } from "./useCasinoLedger";

export interface GardenSquare {
    squareId: number;
    seedType: string | null;
    seedLabel: string | null;
    plantedAt: string | null;
    readyAt: string | null;
    lastWateredAt: string | null;
    protection: { pesticide: boolean; fungicide: boolean };
    status: "empty" | "growing" | "ready" | "dead";
}

export interface SeedTier {
    key: string;
    label: string;
    cost: number;
    growDurationMs: number;
    payoutMultiplierRange: [number, number];
}

export interface GardenState {
    squares: GardenSquare[];
    seedTiers: SeedTier[];
    protectionCost: { pesticide: number; fungicide: number };
}

export const casinoGardenKeys = {
    all: ["casinoGarden"] as const,
};

const fetchGarden = async (): Promise<GardenState> =>
    (await apiClient.get<ApiResponse<GardenState>>("/api/casino/garden")).data.data!;

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
            (await apiClient.post<ApiResponse<{ square: GardenSquare; balance: string }>>("/api/casino/garden/plant", params)).data.data!,
        onSuccess: invalidate,
    });

    const { mutateAsync: water, isPending: isWatering } = useMutation({
        mutationFn: async (params: { squareId: number }) =>
            (await apiClient.post<ApiResponse<{ square: GardenSquare }>>("/api/casino/garden/water", params)).data.data!,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: casinoGardenKeys.all }),
    });

    const { mutateAsync: protect, isPending: isProtecting } = useMutation({
        mutationFn: async (params: { squareId: number; item: "pesticide" | "fungicide" }) =>
            (await apiClient.post<ApiResponse<{ square: GardenSquare; balance: string }>>("/api/casino/garden/protect", params)).data.data!,
        onSuccess: invalidate,
    });

    const { mutateAsync: harvest, isPending: isHarvesting } = useMutation({
        mutationFn: async (params: { squareId: number }) =>
            (await apiClient.post<ApiResponse<{ payout: number; balance: string }>>("/api/casino/garden/harvest", params)).data.data!,
        onSuccess: invalidate,
    });

    const { mutateAsync: clear, isPending: isClearing } = useMutation({
        mutationFn: async (params: { squareId: number }) =>
            (await apiClient.post<ApiResponse<{ square: GardenSquare }>>("/api/casino/garden/clear", params)).data.data!,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: casinoGardenKeys.all }),
    });

    return {
        squares: data?.squares ?? [],
        seedTiers: data?.seedTiers ?? [],
        protectionCost: data?.protectionCost ?? { pesticide: 0, fungicide: 0 },
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
