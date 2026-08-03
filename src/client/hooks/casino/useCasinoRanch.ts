import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";
import { casinoBalanceKeys } from "./useCasinoBalance";
import { casinoLedgerKeys } from "./useCasinoLedger";

export type RanchType = "land" | "sea" | "air";

export interface RanchStats {
    speed: number;
    stamina: number;
    power: number;
    intelligence: number;
    luck: number;
    charm: number;
}

export interface RanchCreature {
    id: string;
    species: string;
    name: string;
    type: RanchType;
    rarityTier: string;
    stats: RanchStats;
    lastFedAt: string | null;
    feedCount: number;
    raceWins: number;
    raceLosses: number;
    level: number;
    lastCollectedAt: string | null;
    lastCollectDate: string | null;
    canCollect: boolean;
    itemKey: string;
    itemLabel: string;
    collectQuantity: number;
    collectBlocked: boolean;
    decayShieldUntil: string | null;
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
    description: string;
    weights: RanchStats;
}

export interface RanchItem {
    key: string;
    label: string;
    quantity: number;
    sellValue: number;
    description: string;
}

export interface RanchFeedItem {
    key: string;
    label: string;
    type: RanchType;
    price: number;
    quantity: number;
}

export interface RanchShopItem {
    key: string;
    label: string;
    price: number;
    description: string;
    quantity: number;
}

export interface RanchTonicRecipeOption {
    materialKey: string;
    materialLabel: string;
    quantity: number;
    owned: number;
}

export interface RanchTonicRecipe {
    statKey: keyof RanchStats;
    tonicKey: string;
    tonicLabel: string;
    recipes: RanchTonicRecipeOption[];
}

export interface RanchRacer {
    id: string;
    isPlayer: boolean;
    species: string;
    name: string;
    type: RanchType;
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
    racers: RanchRacer[];
    course: RanchRaceCourse;
    odds: RanchOdds[];
    createdAt: string;
    expiresAt: string;
}

export interface RanchState {
    creatures: RanchCreature[];
    items: RanchItem[];
    feedItems: RanchFeedItem[];
    shopItems: RanchShopItem[];
    tonicRecipes: RanchTonicRecipe[];
    pendingRace: PendingRace | null;
    rarityTiers: RanchRarityTier[];
    raceCourses: RanchRaceCourse[];
    speciesByTier: Record<string, string[]>;
    hatchPrice: number;
    feedCooldownMs: number;
    minRaceStake: number;
    maxRaceStake: number;
    entryFee: number;
    neglectGraceMs: number;
    decayTickMs: number;
    releaseSellValue: Record<string, number>;
}

export interface HatchResult {
    creature: RanchCreature;
    roster: RanchState;
}

export interface FeedResult {
    creature: RanchCreature;
    gains: RanchStats;
    unitsUsed: number;
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
    items?: RanchItem[];
    shopItems?: RanchShopItem[];
    creature?: RanchCreature;
}

export interface BuyFeedResult {
    balance: string;
    feedItems: RanchFeedItem[];
}

export interface BuyShopItemResult {
    balance: string;
    shopItems: RanchShopItem[];
}

export interface CraftTonicResult {
    message: string;
    items: RanchItem[];
    shopItems: RanchShopItem[];
}

export interface StartRaceResult {
    pending: PendingRace;
}

export interface ForfeitRaceResult {
    message: string;
    balance?: string;
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
    place: number;
    placeBoost: number;
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

    const invalidateSideEffects = () => {
        queryClient.invalidateQueries({ queryKey: casinoBalanceKeys.all });
        queryClient.invalidateQueries({ queryKey: casinoLedgerKeys.all });
    };

    const updateRanchCache = (updater: (old: RanchState) => RanchState) => {
        queryClient.setQueryData<RanchState>(casinoRanchKeys.all, (old) => (old ? updater(old) : old));
    };

    const { mutateAsync: hatch, isPending: isHatching } = useMutation({
        mutationFn: async () => (await apiClient.post<ApiResponse<HatchResult>>("/api/casino/ranch/hatch")).data.data!,
        onSuccess: (data) => {
            queryClient.setQueryData(casinoRanchKeys.all, data.roster);
            invalidateSideEffects();
        },
    });

    const { mutateAsync: feed, isPending: isFeeding } = useMutation({
        mutationFn: async (creatureId: string) =>
            (await apiClient.post<ApiResponse<FeedResult>>(`/api/casino/ranch/${creatureId}/feed`)).data.data!,
        onSuccess: (data) => {
            updateRanchCache((old) => ({
                ...old,
                creatures: old.creatures.map((c) => (c.id === data.creature.id ? data.creature : c)),
            }));
            invalidateSideEffects();
        },
    });

    const { mutateAsync: release, isPending: isReleasing } = useMutation({
        mutationFn: async (creatureId: string) =>
            (await apiClient.post<ApiResponse<ReleaseResult>>(`/api/casino/ranch/${creatureId}/release`)).data.data!,
        onSuccess: (_data, creatureId) => {
            updateRanchCache((old) => ({
                ...old,
                creatures: old.creatures.filter((c) => c.id !== creatureId),
            }));
            invalidateSideEffects();
        },
    });

    const { mutateAsync: collect, isPending: isCollecting } = useMutation({
        mutationFn: async (creatureId: string) =>
            (await apiClient.post<ApiResponse<CollectResult>>(`/api/casino/ranch/${creatureId}/collect`)).data.data!,
        onSuccess: (data) => {
            updateRanchCache((old) => ({
                ...old,
                creatures: old.creatures.map((c) => (c.id === data.creature.id ? data.creature : c)),
                items: data.items,
            }));
            invalidateSideEffects();
        },
    });

    const { mutateAsync: sellItem, isPending: isSellingItem } = useMutation({
        mutationFn: async (itemKey: string) =>
            (await apiClient.post<ApiResponse<SellItemResult>>(`/api/casino/ranch/items/${itemKey}/sell`)).data.data!,
        onSuccess: (data) => {
            updateRanchCache((old) => ({ ...old, items: data.items }));
            invalidateSideEffects();
        },
    });

    const { mutateAsync: useItem, isPending: isUsingItem } = useMutation({
        mutationFn: async (params: { itemKey: string; creatureId?: string; species?: string }) =>
            (
                await apiClient.post<ApiResponse<UseItemResult>>(`/api/casino/ranch/items/${params.itemKey}/use`, {
                    creatureId: params.creatureId,
                    species: params.species,
                })
            ).data.data!,
        onSuccess: (data, variables) => {
            updateRanchCache((old) => {
                let next = { ...old };
                if (data.creature && variables.creatureId) {
                    next.creatures = next.creatures.map((c) => (c.id === data.creature!.id ? data.creature! : c));
                }
                if (data.items) next.items = data.items;
                if (data.shopItems) next.shopItems = data.shopItems;
                return next;
            });
            invalidateSideEffects();
        },
    });

    const { mutateAsync: buyFeed, isPending: isBuyingFeed } = useMutation({
        mutationFn: async (params: { type: RanchType; quantity: number }) =>
            (await apiClient.post<ApiResponse<BuyFeedResult>>("/api/casino/ranch/feed/buy", params)).data.data!,
        onSuccess: (data) => {
            updateRanchCache((old) => ({ ...old, feedItems: data.feedItems }));
            invalidateSideEffects();
        },
    });

    const { mutateAsync: buyShopItem, isPending: isBuyingShopItem } = useMutation({
        mutationFn: async (itemKey: string) =>
            (await apiClient.post<ApiResponse<BuyShopItemResult>>(`/api/casino/ranch/shop/${itemKey}/buy`)).data.data!,
        onSuccess: (data) => {
            updateRanchCache((old) => ({ ...old, shopItems: data.shopItems }));
            invalidateSideEffects();
        },
    });

    const { mutateAsync: craftTonic, isPending: isCraftingTonic } = useMutation({
        mutationFn: async (statKey: keyof RanchStats) =>
            (await apiClient.post<ApiResponse<CraftTonicResult>>(`/api/casino/ranch/tonics/${statKey}/craft`)).data.data!,
        onSuccess: (data) => {
            updateRanchCache((old) => ({ ...old, items: data.items, shopItems: data.shopItems }));
            invalidateSideEffects();
        },
    });

    const { mutateAsync: startRace, isPending: isStartingRace } = useMutation({
        mutationFn: async (params: { creatureId: string; useCourseTicket?: boolean; useDifficultyItem?: boolean }) =>
            (
                await apiClient.post<ApiResponse<StartRaceResult>>(`/api/casino/ranch/${params.creatureId}/race/start`, {
                    useCourseTicket: params.useCourseTicket,
                    useDifficultyItem: params.useDifficultyItem,
                })
            ).data.data!,
        onSuccess: (data) => {
            updateRanchCache((old) => ({ ...old, pendingRace: data.pending }));
            invalidateSideEffects();
        },
    });

    const { mutateAsync: forfeitRace, isPending: isForfeitingRace } = useMutation({
        mutationFn: async (creatureId: string) =>
            (await apiClient.post<ApiResponse<ForfeitRaceResult>>(`/api/casino/ranch/${creatureId}/race/forfeit`)).data.data!,
        onSuccess: () => {
            updateRanchCache((old) => ({ ...old, pendingRace: null }));
            invalidateSideEffects();
        },
    });

    const { mutateAsync: betRace, isPending: isBettingRace } = useMutation({
        mutationFn: async (params: { creatureId: string; racerId: string; stake: number }) =>
            (
                await apiClient.post<ApiResponse<BetRaceResult>>(`/api/casino/ranch/${params.creatureId}/race/bet`, {
                    racerId: params.racerId,
                    stake: params.stake,
                })
            ).data.data!,
        onSuccess: (data) => {
            updateRanchCache((old) => ({
                ...old,
                creatures: old.creatures.map((c) => (c.id === data.creature.id ? data.creature : c)),
                pendingRace: null,
            }));
            invalidateSideEffects();
        },
    });

    return {
        creatures: data?.creatures ?? [],
        items: data?.items ?? [],
        feedItems: data?.feedItems ?? [],
        shopItems: data?.shopItems ?? [],
        tonicRecipes: data?.tonicRecipes ?? [],
        pendingRace: data?.pendingRace ?? null,
        rarityTiers: data?.rarityTiers ?? [],
        raceCourses: data?.raceCourses ?? [],
        speciesByTier: data?.speciesByTier ?? {},
        hatchPrice: data?.hatchPrice ?? 0,
        feedCooldownMs: data?.feedCooldownMs ?? 0,
        minRaceStake: data?.minRaceStake ?? 0,
        maxRaceStake: data?.maxRaceStake ?? 0,
        entryFee: data?.entryFee ?? 0,
        neglectGraceMs: data?.neglectGraceMs ?? 0,
        decayTickMs: data?.decayTickMs ?? 0,
        releaseSellValue: data?.releaseSellValue ?? {},
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
        buyShopItem,
        isBuyingShopItem,
        craftTonic,
        isCraftingTonic,
        startRace,
        isStartingRace,
        forfeitRace,
        isForfeitingRace,
        betRace,
        isBettingRace,
    };
};
