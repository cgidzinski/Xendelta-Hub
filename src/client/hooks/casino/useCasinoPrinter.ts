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
    parts: PrinterPart[]; // full catalog entries for the 3 parts this run was started with
    usedMachineUpgrade: boolean;
    machineUpgradeRateBonus: number;
    lastBribeAt: string;
    bribeCount: number;
    nextBribeCost: number;
    raided: boolean;
    currentMultiplier: number;
    raidRiskPercent: number;
}

export interface PrinterState {
    run: PrinterRun | null;
    parts: PrinterPart[];
    bribeCost: number;
    machineUpgradeCost: number;
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
        mutationFn: async (params: { partKeys: string[]; useMachineUpgrade?: boolean }) =>
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

    return {
        run: data?.run ?? null,
        parts: data?.parts ?? [],
        bribeCost: data?.bribeCost ?? 0,
        machineUpgradeCost: data?.machineUpgradeCost ?? 0,
        isLoading,
        refetch,
        start,
        isStarting,
        bribe,
        isBribing,
        collect,
        isCollecting,
    };
};
