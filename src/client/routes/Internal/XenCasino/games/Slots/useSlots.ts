import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { apiClient } from "../../../../../config/api";
import { ApiResponse } from "../../../../../types/api";
import { casinoBalanceKeys } from "../../../../../hooks/casino/useCasinoBalance";
import { casinoLedgerKeys } from "../../../../../hooks/casino/useCasinoLedger";

export interface SlotsPaytableRow {
  combo: string;
  probability: number;
  multiplier?: number;
}

export interface SlotsOdds {
  paytable: SlotsPaytableRow[];
  jackpotContributionRate: number;
  jackpotPool: number;
  rtp: number;
}

export interface SpinResult {
  reels: [string, string, string];
  multiplier: number;
  jackpot: boolean;
  payout: number;
  balance: string;
}

export const slotsOddsKeys = { all: ["slotsOdds"] as const };

const fetchSlotsOdds = async (): Promise<SlotsOdds> => {
  const response = await apiClient.get<ApiResponse<SlotsOdds>>("/api/casino/games/slots/odds");
  return response.data.data!;
};

const spinReels = async (wager: number): Promise<SpinResult> => {
  const response = await apiClient.post<ApiResponse<SpinResult>>("/api/casino/games/slots/spin", { wager });
  return response.data.data!;
};

export const useSlots = () => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { data: odds } = useQuery({
    queryKey: slotsOddsKeys.all,
    queryFn: fetchSlotsOdds,
    staleTime: 15 * 1000,
  });

  const { mutate: spin, isPending, data: lastResult } = useMutation({
    mutationFn: spinReels,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: casinoBalanceKeys.all });
      queryClient.invalidateQueries({ queryKey: casinoLedgerKeys.all });
      queryClient.invalidateQueries({ queryKey: slotsOddsKeys.all });
      if (result.jackpot) {
        enqueueSnackbar(`JACKPOT! You won ${result.payout.toFixed(2)} cheddar!`, { variant: "success" });
      } else if (result.payout > 0) {
        enqueueSnackbar(`You won ${result.payout.toFixed(2)} cheddar!`, { variant: "success" });
      } else {
        enqueueSnackbar("No win this spin.", { variant: "info" });
      }
    },
    onError: (error: Error) => enqueueSnackbar(error.message || "Failed to spin", { variant: "error" }),
  });

  return { odds, isPending, lastResult, spin: (wager: number) => spin(wager) };
};
