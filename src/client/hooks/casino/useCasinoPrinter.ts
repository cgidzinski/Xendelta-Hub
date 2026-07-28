import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../contexts/AuthContext";
import { apiClient } from "../../config/api";
import { ApiResponse } from "../../types/api";
import { casinoBalanceKeys } from "./useCasinoBalance";
import { casinoLedgerKeys } from "./useCasinoLedger";

export interface PrinterPart {
    key: string;
    label: string;
    cost: number;
    rateBonus: number;
    raidBonus: number;
    description: string;
}

export interface PrinterRun {
    startedAt: string;
    partsCost: number;
    peakAt: string;
    peakMultiplier: number;
    parts: string[]; // labels of the 3 parts this run was started with
    lastBribeAt: string;
    bribeCount: number;
    nextBribeCost: number;
    raided: boolean;
    currentMultiplier: number;
    raidRiskPercent: number;
}

export interface PrinterState {
    rigLevel: number;
    maxRigLevel: number;
    run: PrinterRun | null;
    parts: PrinterPart[];
    bribeCost: number;
    upgradeCost: number;
}

export const casinoPrinterKeys = {
    all: ["casinoPrinter"] as const,
};

const fetchPrinter = async (): Promise<PrinterState> =>
    (await apiClient.get<ApiResponse<PrinterState>>("/api/casino/printer")).data.data!;

export const useCasinoPrinter = () => {
    const { isAuthenticated } = useAuth();
    const queryClient = useQueryClient();

    const { data, isLoading, refetch } = useQuery({
        queryKey: casinoPrinterKeys.all,
        queryFn: fetchPrinter,
        enabled: isAuthenticated,
        staleTime: 2 * 1000,
        refetchInterval: 5 * 1000,
    });

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: casinoPrinterKeys.all });
        queryClient.invalidateQueries({ queryKey: casinoBalanceKeys.all });
        queryClient.invalidateQueries({ queryKey: casinoLedgerKeys.all });
    };

    const { mutateAsync: start, isPending: isStarting } = useMutation({
        mutationFn: async (params: { partKeys: string[] }) =>
            (await apiClient.post<ApiResponse<{ run: PrinterRun; balance: string }>>("/api/casino/printer/start", params)).data.data!,
        onSuccess: invalidate,
    });

    const { mutateAsync: bribe, isPending: isBribing } = useMutation({
        mutationFn: async () => (await apiClient.post<ApiResponse<{ run: PrinterRun; balance: string }>>("/api/casino/printer/bribe")).data.data!,
        onSuccess: invalidate,
    });

    const { mutateAsync: collect, isPending: isCollecting } = useMutation({
        mutationFn: async () =>
            (await apiClient.post<ApiResponse<{ raided: boolean; payout: number; balance?: string }>>("/api/casino/printer/collect")).data.data!,
        onSuccess: invalidate,
    });

    const { mutateAsync: upgrade, isPending: isUpgrading } = useMutation({
        mutationFn: async () =>
            (await apiClient.post<ApiResponse<{ rigLevel: number; balance: string }>>("/api/casino/printer/upgrade")).data.data!,
        onSuccess: invalidate,
    });

    return {
        rigLevel: data?.rigLevel ?? 1,
        maxRigLevel: data?.maxRigLevel ?? 1,
        run: data?.run ?? null,
        parts: data?.parts ?? [],
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
