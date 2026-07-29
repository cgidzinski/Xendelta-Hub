import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";
import { casinoBalanceKeys } from "./useCasinoBalance";
import { casinoLedgerKeys } from "./useCasinoLedger";

export interface RanchCreature {
    id: string;
    species: string;
    name: string;
    rarityTier: string;
    stats: { speed: number; stamina: number; power: number };
    lastFedAt: string | null;
    feedCount: number;
    raceWins: number;
    raceLosses: number;
    xp: number;
    level: number;
    lastCollectedAt: string | null;
    itemKey: string;
    itemLabel: string;
    createdAt: string;
}

export interface RanchRarityTier {
    key: string;
    label: string;
    probability: number;
    statRange: [number, number];
}

export interface RanchRaceCategory {
    key: string;
    label: string;
    weights: { speed: number; stamina: number; power: number };
}

export interface RanchItem {
    key: string;
    label: string;
    quantity: number;
    sellValue: number;
}

export interface RanchFeedItem {
    key: string;
    label: string;
    statKey: "speed" | "stamina" | "power";
    price: number;
    quantity: number;
}

export interface RanchState {
    creatures: RanchCreature[];
    items: RanchItem[];
    feedItems: RanchFeedItem[];
    rarityTiers: RanchRarityTier[];
    raceCategories: RanchRaceCategory[];
    hatchPrice: number;
    feedCooldownMs: number;
    raceEntryFee: number;
    raceWinMultiplier: number;
    releaseSellValue: Record<string, number>;
    collectCooldownMs: number;
}

export interface HatchResult {
    creature: RanchCreature;
    roster: RanchState;
}

export interface FeedResult {
    creature: RanchCreature;
    gain: number;
}

export interface RaceResult {
    won: boolean;
    payout: number;
    playerTotal: number;
    opponentTotal: number;
    balance?: string;
    creature: RanchCreature;
}

export interface ReleaseResult {
    sellValue: number;
    balance: string;
}

export interface CollectResult {
    creature: RanchCreature;
    item: { key: string; label: string; quantity: number };
    items: RanchItem[];
}

export interface SellItemResult {
    quantity: number;
    totalValue: number;
    balance: string;
    items: RanchItem[];
}

export interface UseItemResult {
    message: string;
    items: RanchItem[];
}

export interface BuyFeedItemResult {
    balance: string;
    feedItems: RanchFeedItem[];
}

export const casinoRanchKeys = {
    all: ["casinoRanch"] as const,
};

const fetchRanch = async (): Promise<RanchState> =>
    (await apiClient.get<ApiResponse<RanchState>>("/api/casino/ranch")).data.data!;

export const useCasinoRanch = () => {
    const { isAuthenticated } = useAuth();
    const queryClient = useQueryClient();

    const { data, isLoading, isError, error, refetch } = useQuery({
        queryKey: casinoRanchKeys.all,
        queryFn: fetchRanch,
        enabled: isAuthenticated,
        staleTime: 5 * 1000,
    });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: casinoRanchKeys.all });
        queryClient.invalidateQueries({ queryKey: casinoBalanceKeys.all });
        queryClient.invalidateQueries({ queryKey: casinoLedgerKeys.all });
    };

    const { mutateAsync: hatch, isPending: isHatching } = useMutation({
        mutationFn: async () => (await apiClient.post<ApiResponse<HatchResult>>("/api/casino/ranch/hatch")).data.data!,
        onSuccess: invalidate,
    });

    const { mutateAsync: feed, isPending: isFeeding } = useMutation({
        mutationFn: async (params: { creatureId: string; statKey: "speed" | "stamina" | "power" }) =>
            (await apiClient.post<ApiResponse<FeedResult>>(`/api/casino/ranch/${params.creatureId}/feed`, { statKey: params.statKey })).data.data!,
        onSuccess: invalidate,
    });

    const { mutateAsync: race, isPending: isRacing } = useMutation({
        mutationFn: async (params: { creatureId: string; category: string }) =>
            (await apiClient.post<ApiResponse<RaceResult>>(`/api/casino/ranch/${params.creatureId}/race`, { category: params.category })).data.data!,
        onSuccess: invalidate,
    });

    const { mutateAsync: release, isPending: isReleasing } = useMutation({
        mutationFn: async (creatureId: string) =>
            (await apiClient.post<ApiResponse<ReleaseResult>>(`/api/casino/ranch/${creatureId}/release`)).data.data!,
        onSuccess: invalidate,
    });

    const { mutateAsync: collect, isPending: isCollecting } = useMutation({
        mutationFn: async (creatureId: string) =>
            (await apiClient.post<ApiResponse<CollectResult>>(`/api/casino/ranch/${creatureId}/collect`)).data.data!,
        onSuccess: invalidate,
    });

    const { mutateAsync: sellItem, isPending: isSellingItem } = useMutation({
        mutationFn: async (itemKey: string) =>
            (await apiClient.post<ApiResponse<SellItemResult>>(`/api/casino/ranch/items/${itemKey}/sell`)).data.data!,
        onSuccess: invalidate,
    });

    const { mutateAsync: useItem, isPending: isUsingItem } = useMutation({
        mutationFn: async (itemKey: string) =>
            (await apiClient.post<ApiResponse<UseItemResult>>(`/api/casino/ranch/items/${itemKey}/use`)).data.data!,
        onSuccess: invalidate,
    });

    const { mutateAsync: buyFeedItem, isPending: isBuyingFeedItem } = useMutation({
        mutationFn: async (itemKey: string) =>
            (await apiClient.post<ApiResponse<BuyFeedItemResult>>(`/api/casino/ranch/feed-items/${itemKey}/buy`)).data.data!,
        onSuccess: invalidate,
    });

    return {
        creatures: data?.creatures ?? [],
        items: data?.items ?? [],
        feedItems: data?.feedItems ?? [],
        rarityTiers: data?.rarityTiers ?? [],
        raceCategories: data?.raceCategories ?? [],
        hatchPrice: data?.hatchPrice ?? 0,
        feedCooldownMs: data?.feedCooldownMs ?? 0,
        raceEntryFee: data?.raceEntryFee ?? 0,
        raceWinMultiplier: data?.raceWinMultiplier ?? 1,
        releaseSellValue: data?.releaseSellValue ?? {},
        collectCooldownMs: data?.collectCooldownMs ?? 0,
        isLoading,
        isError,
        error: error as Error | null,
        refetch,
        hatch,
        isHatching,
        feed,
        isFeeding,
        race,
        isRacing,
        release,
        isReleasing,
        collect,
        isCollecting,
        sellItem,
        isSellingItem,
        useItem,
        isUsingItem,
        buyFeedItem,
        isBuyingFeedItem,
    };
};
