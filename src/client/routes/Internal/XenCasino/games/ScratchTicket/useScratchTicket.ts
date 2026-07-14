import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { apiClient } from "../../../../../config/api";
import { ApiResponse } from "../../../../../types/api";
import { casinoBalanceKeys } from "../../../../../hooks/casino/useCasinoBalance";
import { casinoLedgerKeys } from "../../../../../hooks/casino/useCasinoLedger";

export interface TicketLine {
  symbols: string[];
  prizeMultiplier: number;
  poolSize: number;
  won: boolean;
}

export interface ScratchTier {
  prizeMultiplier: number;
  poolSize: number;
  probability: number;
}

export interface ScratchOdds {
  lineCount: number;
  tiers: ScratchTier[];
  probabilityAtLeastOneWin: number;
  rtp: number;
}

export interface ScratchResult {
  lines: TicketLine[];
  totalPayout: number;
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
      if (result.totalPayout > 0) {
        enqueueSnackbar(`Ticket bought — up to ${result.totalPayout.toFixed(2)} cheddar waiting to be revealed!`, { variant: "success" });
      } else {
        enqueueSnackbar("Ticket bought — scratch to see your luck.", { variant: "info" });
      }
    },
    onError: (error: Error) => enqueueSnackbar(error.message || "Failed to buy ticket", { variant: "error" }),
  });

  return { odds, isPending, lastResult, buyTicket: (wager: number) => buyTicket(wager) };
};
