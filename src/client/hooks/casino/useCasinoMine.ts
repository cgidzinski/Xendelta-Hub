import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";
import { casinoBalanceKeys } from "./useCasinoBalance";
import { casinoLedgerKeys } from "./useCasinoLedger";

export interface MineTile {
    x: number;
    y: number;
    hasOre: boolean;
    mined: boolean;
}

export interface MineState {
    position: { x: number; y: number };
    digsToday: number;
    dailyDigCap: number;
    ladderCount: number;
    torchFuel: number;
    pickaxeLevel: number;
    torchLevel: number;
    maxPickaxeLevel: number;
    maxTorchLevel: number;
    visibilityRadius: number;
    revealedTiles: MineTile[];
    prices: {
        ladder: { cost: number; amount: number };
        torch: { cost: number; amount: number };
        pickaxeUpgrade: number;
        torchUpgrade: number;
    };
}

export interface DigResult {
    outcome: "ore" | "empty" | "cave_in";
    payout: number;
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

    const { data, isLoading, refetch } = useQuery({
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
        mutationFn: async (direction: "down" | "left" | "right") =>
            (await apiClient.post<ApiResponse<DigResult>>("/api/casino/mine/dig", { direction })).data.data!,
        onSuccess: invalidate,
    });

    const { mutateAsync: buyEquipment, isPending: isBuying } = useMutation({
        mutationFn: async (item: "ladder" | "torch") =>
            (await apiClient.post<ApiResponse<{ state: MineState; balance: string }>>("/api/casino/mine/buy-equipment", { item })).data.data!,
        onSuccess: invalidate,
    });

    const { mutateAsync: upgrade, isPending: isUpgrading } = useMutation({
        mutationFn: async (which: "pickaxe" | "torch") =>
            (await apiClient.post<ApiResponse<{ level: number; balance: string }>>("/api/casino/mine/upgrade", { upgrade: which })).data.data!,
        onSuccess: invalidate,
    });

    return {
        state: data ?? null,
        isLoading,
        refetch,
        dig,
        isDigging,
        buyEquipment,
        isBuying,
        upgrade,
        isUpgrading,
    };
};
