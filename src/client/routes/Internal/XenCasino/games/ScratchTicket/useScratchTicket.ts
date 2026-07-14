import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { apiClient } from "../../../../../config/api";
import { ApiResponse } from "../../../../../types/api";
import { casinoBalanceKeys } from "../../../../../hooks/casino/useCasinoBalance";
import { casinoLedgerKeys } from "../../../../../hooks/casino/useCasinoLedger";

export interface ScratchPaytableRow {
  label: string;
  probability: number;
  multiplier: number;
}

export interface ScratchOdds {
  paytable: ScratchPaytableRow[];
  rtp: number;
}

export interface ScratchResult {
  reveal: [string, string, string];
  tier: string;
  multiplier: number;
  payout: number;
  balance: string;
}

const fetchScratchOdds = async (): Promise<ScratchOdds> => {
  const response = await apiClient.get<ApiResponse<ScratchOdds>>("/api/casino/games/scratch/odds");
  return response.data.data!;
};

const play = async (wager: number): Promise<ScratchResult> => {
  const response = await apiClient.post<ApiResponse<ScratchResult>>("/api/casino/games/scratch/play", { wager });
  return response.data.data!;
};

export const useScratchTicket = () => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { data: odds } = useQuery({
    queryKey: ["scratchOdds"],
    queryFn: fetchScratchOdds,
    staleTime: 5 * 60 * 1000,
  });

  const { mutate: buyTicket, isPending, data: lastResult } = useMutation({
    mutationFn: play,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: casinoBalanceKeys.all });
      queryClient.invalidateQueries({ queryKey: casinoLedgerKeys.all });
      if (result.payout > 0) {
        enqueueSnackbar(`You won ${result.payout.toFixed(2)} cheddar!`, { variant: "success" });
      } else {
        enqueueSnackbar("No prize this time.", { variant: "info" });
      }
    },
    onError: (error: Error) => enqueueSnackbar(error.message || "Failed to buy ticket", { variant: "error" }),
  });

  return { odds, isPending, lastResult, buyTicket: (wager: number) => buyTicket(wager) };
};
