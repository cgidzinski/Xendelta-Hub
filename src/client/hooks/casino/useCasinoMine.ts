import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";
import { casinoBalanceKeys } from "./useCasinoBalance";
import { casinoLedgerKeys } from "./useCasinoLedger";

export interface MineTile {
    x: number;
    y: number;
    oreTier: string | null;
    isHeavyStone: boolean;
    // "scouted": a Flare preview, not yet dug. "blocked": known heavy stone, needs an
    // Explosive. "mined": actually dug (resolved for good, walking back through it is
    // always free). "collapsed": a cave-in marker.
    status: "scouted" | "blocked" | "mined" | "collapsed";
}

export interface MineOreTier {
    key: string;
    label: string;
    minDepth: number;
    valueMultiplier: number;
}

export interface MineState {
    position: { x: number; y: number };
    digsToday: number;
    dailyDigCap: number;
    ladderCount: number;
    explosiveCount: number;
    supportCount: number;
    deepestDepthReached: number;
    bestGemTier: string | null;
    revealedTiles: MineTile[];
    prices: {
        dig: { cost: number };
        ladder: { cost: number; amount: number };
        explosive: { cost: number; amount: number };
        support: { cost: number; amount: number };
        flare: { cost: number; radius: number };
        reset: { cost: number };
    };
    oreTiers: MineOreTier[];
}

export interface DigResult {
    outcome: "ore" | "empty" | "cave_in" | "stone_cleared" | "move";
    oreTier?: string | null;
    payout: number;
    usedExplosive: boolean;
    balance?: string;
    state: MineState;
}

export const casinoMineKeys = {
    all: ["casinoMine"] as const,
};

const fetchMine = async (): Promise<MineState> =>
    (await apiClient.get<ApiResponse<MineState>>("/api/casino/mine")).data.data!;

export const useCasinoMine = () => {
    const { isAuthenticated } = useAuth();
    const queryClient = useQueryClient();

    const { data, isLoading, isError, error, refetch } = useQuery({
        queryKey: casinoMineKeys.all,
        queryFn: fetchMine,
        enabled: isAuthenticated,
        staleTime: 5 * 1000,
    });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: casinoMineKeys.all });
        queryClient.invalidateQueries({ queryKey: casinoBalanceKeys.all });
        queryClient.invalidateQueries({ queryKey: casinoLedgerKeys.all });
    };

    const { mutateAsync: dig, isPending: isDigging } = useMutation({
        mutationFn: async (direction: "up" | "down" | "left" | "right") =>
            (await apiClient.post<ApiResponse<DigResult>>("/api/casino/mine/dig", { direction })).data.data!,
        // A successful dig's response already carries the fresh state, so write it
        // straight into the cache instead of paying for a second round-trip refetch -
        // this is what makes moving feel instant. A rejected dig has no state in its
        // response (it may still have persisted a newly-discovered tile server-side
        // even though it errored), so that path falls back to a real refetch.
        onSuccess: (data) => {
            queryClient.setQueryData(casinoMineKeys.all, data.state);
            queryClient.invalidateQueries({ queryKey: casinoBalanceKeys.all });
            queryClient.invalidateQueries({ queryKey: casinoLedgerKeys.all });
        },
        onError: invalidate,
    });

    const { mutateAsync: buyEquipment, isPending: isBuying } = useMutation({
        mutationFn: async (item: "ladder" | "explosive" | "support") =>
            (await apiClient.post<ApiResponse<{ state: MineState; balance: string }>>("/api/casino/mine/buy-equipment", { item })).data.data!,
        onSuccess: invalidate,
    });

    const { mutateAsync: useFlare, isPending: isFlaring } = useMutation({
        mutationFn: async () => (await apiClient.post<ApiResponse<{ state: MineState; balance: string }>>("/api/casino/mine/flare")).data.data!,
        onSuccess: invalidate,
    });

    const { mutateAsync: resetMap, isPending: isResetting } = useMutation({
        mutationFn: async () => (await apiClient.post<ApiResponse<{ state: MineState; balance: string }>>("/api/casino/mine/reset")).data.data!,
        onSuccess: invalidate,
    });

    return {
        state: data ?? null,
        isLoading,
        isError,
        error: error as Error | null,
        refetch,
        dig,
        isDigging,
        buyEquipment,
        isBuying,
        useFlare,
        isFlaring,
        resetMap,
        isResetting,
    };
};
