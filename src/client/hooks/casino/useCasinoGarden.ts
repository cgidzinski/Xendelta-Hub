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
    // How many of this seed the player currently owns - bought in bulk from the Store,
    // spent one at a time when planting an empty plot.
    owned: number;
}

export interface ProtectionItem {
    key: "pesticide" | "fungicide" | "fertilizer" | "bonemeal";
    label: string;
    cost: number;
    // How many the player currently owns - bought in bulk from the Store (or one at a time
    // from Garden's own Shop dialog), spent one at a time when protecting a growing plot.
    owned: number;
}

export interface GardenState {
    squares: GardenSquare[];
    seedTiers: SeedTier[];
    protectionItems: ProtectionItem[];
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

    // Plants from owned seed stock (bought via buySeed below) - no cheddar changes hands
    // here anymore, so there's no balance/ledger to invalidate, just the garden query
    // (square status + the spent seed's `owned` count).
    const { mutateAsync: plant, isPending: isPlanting } = useMutation({
        mutationFn: async (params: { squareId: number; seedType: string }) =>
            (await apiClient.post<ApiResponse<{ square: GardenSquare }>>("/api/casino/ranch/garden/plant", params)).data.data!,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: casinoGardenKeys.all }),
    });

    const { mutateAsync: buySeed, isPending: isBuyingSeed } = useMutation({
        mutationFn: async (params: { seedType: string; quantity: number }) =>
            (await apiClient.post<ApiResponse<{ balance: string; seedTiers: SeedTier[] }>>("/api/casino/ranch/garden/seeds/buy", params)).data.data!,
        onSuccess: invalidate,
    });

    const { mutateAsync: buyProtection, isPending: isBuyingProtection } = useMutation({
        mutationFn: async (params: { item: ProtectionItem["key"]; quantity: number }) =>
            (await apiClient.post<ApiResponse<{ balance: string; protectionItems: ProtectionItem[] }>>("/api/casino/ranch/garden/protection/buy", params)).data.data!,
        onSuccess: invalidate,
    });

    const { mutateAsync: water, isPending: isWatering } = useMutation({
        mutationFn: async (params: { squareId: number }) =>
            (await apiClient.post<ApiResponse<{ square: GardenSquare }>>("/api/casino/ranch/garden/water", params)).data.data!,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: casinoGardenKeys.all }),
    });

    // No cheddar changes hands here anymore - the protection item was already paid for at
    // buy time, so there's no balance to report, just the updated square + owned counts.
    const { mutateAsync: protect, isPending: isProtecting } = useMutation({
        mutationFn: async (params: { squareId: number; item: ProtectionItem["key"] }) =>
            (await apiClient.post<ApiResponse<{ square: GardenSquare; protectionItems: ProtectionItem[] }>>("/api/casino/ranch/garden/protect", params)).data.data!,
        onSuccess: invalidate,
    });

    // Harvest no longer moves cheddar - it credits a produce item to the shared ranch
    // inventory (sold later from the Inventory tab), so there's no balance/ledger change
    // to invalidate here, just the ranch query that holds the inventory.
    const { mutateAsync: harvest, isPending: isHarvesting } = useMutation({
        mutationFn: async (params: { squareId: number }) =>
            (
                await apiClient.post<
                    ApiResponse<{
                        item: { key: string; label: string; quantity: number };
                        bonusSeedReturned: boolean;
                        items: RanchItem[];
                        seedTiers: SeedTier[];
                    }>
                >("/api/casino/ranch/garden/harvest", params)
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
        protectionItems: data?.protectionItems ?? [],
        waterCooldownMs: data?.waterCooldownMs ?? 60 * 60 * 1000,
        neglectGraceMs: data?.neglectGraceMs ?? 24 * 60 * 60 * 1000,
        cleanupFee: data?.cleanupFee ?? 0,
        isLoading,
        refetch,
        plant,
        isPlanting,
        buySeed,
        isBuyingSeed,
        buyProtection,
        isBuyingProtection,
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
