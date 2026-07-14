import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { apiClient } from "../../../../../config/api";
import { ApiResponse } from "../../../../../types/api";
import { casinoBalanceKeys } from "../../../../../hooks/casino/useCasinoBalance";
import { casinoLedgerKeys } from "../../../../../hooks/casino/useCasinoLedger";

export interface PlayDemoGameResult {
  outcome: "win" | "loss";
  balance: string;
}

const playDemoGame = async (outcome: "win" | "loss"): Promise<PlayDemoGameResult> => {
  const response = await apiClient.post<ApiResponse<PlayDemoGameResult>>("/api/casino/games/demo/play", { outcome });
  return response.data.data!;
};

export const useDemoGame = () => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();

  const { mutate: play, isPending, data: lastResult } = useMutation({
    mutationFn: playDemoGame,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: casinoBalanceKeys.all });
      queryClient.invalidateQueries({ queryKey: casinoLedgerKeys.all });
      enqueueSnackbar(result.outcome === "win" ? "You won 5 cheddar!" : "You lost 5 cheddar.", {
        variant: result.outcome === "win" ? "success" : "error",
      });
    },
    onError: (error: Error) => {
      enqueueSnackbar(error.message || "Failed to play", { variant: "error" });
    },
  });

  return { play, isPending, lastResult };
};
