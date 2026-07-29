import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";
import { casinoBalanceKeys } from "./useCasinoBalance";
import { casinoLedgerKeys } from "./useCasinoLedger";

export interface RanchStats {
    speed: number;
    stamina: number;
    power: number;
    intelligence: number;
    luck: number;
}

export interface RanchCreature {
    id: string;
    species: string;
    name: string;
    rarityTier: string;
    stats: RanchStats;
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

export interface RanchRaceCourse {
    key: string;
    label: string;
    weights: RanchStats;
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
    price: number;
    quantity: number;
}

export interface RanchRacer {
    id: string;
    isPlayer: boolean;
    species: string;
    name: string;
    level: number;
    stats: RanchStats;
}

export interface RanchOdds {
    racerId: string;
    winProbability: number;
    multiplier: number;
}

export interface PendingRace {
    creatureId: string;
    course: RanchRaceCourse;
    racers: RanchRacer[];
    odds: RanchOdds[];
    createdAt: string;
    expiresAt: string;
}

export interface RanchState {
    creatures: RanchCreature[];
    items: RanchItem[];
    feedItem: RanchFeedItem;
    pendingRace: PendingRace | null;
    rarityTiers: RanchRarityTier[];
    raceCourses: RanchRaceCourse[];
    hatchPrice: number;
    feedCooldownMs: number;
    minRaceStake: number;
    maxRaceStake: number;
    releaseSellValue: Record<string, number>;
    collectCooldownMs: number;
}

export interface HatchResult {
    creature: RanchCreature;
    roster: RanchState;
}

export interface FeedResult {
    creature: RanchCreature;
    gains: RanchStats;
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

export interface BuyFeedResult {
    balance: string;
    feedItem: RanchFeedItem;
}

export interface PrepareRaceResult {
    pending: PendingRace;
}

export interface RaceResultEntry {
    racerId: string;
    raceScore: number;
    place: number;
}

export interface BetRaceResult {
    won: boolean;
    payout: number;
    stake: number;
    multiplier: number;
    order: RaceResultEntry[];
    winnerId: string;
    betRacerId: string;
    creature: RanchCreature;
    balance: string;
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
        mutationFn: async (creatureId: string) =>
            (await apiClient.post<ApiResponse<FeedResult>>(`/api/casino/ranch/${creatureId}/feed`)).data.data!,
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

    const { mutateAsync: buyFeed, isPending: isBuyingFeed } = useMutation({
        mutationFn: async () => (await apiClient.post<ApiResponse<BuyFeedResult>>("/api/casino/ranch/feed/buy")).data.data!,
        onSuccess: invalidate,
    });

    const { mutateAsync: prepareRace, isPending: isPreparingRace } = useMutation({
        mutationFn: async (creatureId: string) =>
            (await apiClient.post<ApiResponse<PrepareRaceResult>>(`/api/casino/ranch/${creatureId}/race/prepare`)).data.data!,
        onSuccess: invalidate,
    });

    const { mutateAsync: betRace, isPending: isBettingRace } = useMutation({
        mutationFn: async (params: { creatureId: string; racerId: string; stake: number }) =>
            (
                await apiClient.post<ApiResponse<BetRaceResult>>(`/api/casino/ranch/${params.creatureId}/race/bet`, {
                    racerId: params.racerId,
                    stake: params.stake,
                })
            ).data.data!,
        onSuccess: invalidate,
    });

    return {
        creatures: data?.creatures ?? [],
        items: data?.items ?? [],
        feedItem: data?.feedItem,
        pendingRace: data?.pendingRace ?? null,
        rarityTiers: data?.rarityTiers ?? [],
        raceCourses: data?.raceCourses ?? [],
        hatchPrice: data?.hatchPrice ?? 0,
        feedCooldownMs: data?.feedCooldownMs ?? 0,
        minRaceStake: data?.minRaceStake ?? 0,
        maxRaceStake: data?.maxRaceStake ?? 0,
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
        release,
        isReleasing,
        collect,
        isCollecting,
        sellItem,
        isSellingItem,
        useItem,
        isUsingItem,
        buyFeed,
        isBuyingFeed,
        prepareRace,
        isPreparingRace,
        betRace,
        isBettingRace,
    };
};
