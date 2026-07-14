import { useState, useRef, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { apiClient } from "../../../../../config/api";
import { ApiResponse } from "../../../../../types/api";
import { casinoBalanceKeys } from "../../../../../hooks/casino/useCasinoBalance";
import { casinoLedgerKeys } from "../../../../../hooks/casino/useCasinoLedger";

export interface CrashOdds {
  houseEdge: number;
  growthPerSecond: number;
  referenceOdds: { multiplier: number; probability: number }[];
}

interface StartRoundResult {
  startedAt: number;
  growthPerSecond: number;
  balance: string;
}

export interface CashoutResult {
  won: boolean;
  multiplier: number;
  crashPoint: number;
  balance: string;
}

const DEFAULT_GROWTH_PER_SECOND = Math.log(2) / 3;

const fetchCrashOdds = async (): Promise<CrashOdds> => {
  const response = await apiClient.get<ApiResponse<CrashOdds>>("/api/casino/games/crash/odds");
  return response.data.data!;
};

const startRound = async (wager: number): Promise<StartRoundResult> => {
  const response = await apiClient.post<ApiResponse<StartRoundResult>>("/api/casino/games/crash/start", { wager });
  return response.data.data!;
};

// The wager is already taken by the time /start responds, so the server tracks the
// active round by (game, userId) itself - there's nothing left for the client to hand
// back here.
const cashoutRound = async (): Promise<CashoutResult> => {
  const response = await apiClient.post<ApiResponse<CashoutResult>>("/api/casino/games/crash/cashout");
  return response.data.data!;
};

export const useCrash = () => {
  const queryClient = useQueryClient();
  const { enqueueSnackbar } = useSnackbar();
  const { data: odds } = useQuery({
    queryKey: ["crashOdds"],
    queryFn: fetchCrashOdds,
    staleTime: 5 * 60 * 1000,
  });

  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [liveMultiplier, setLiveMultiplier] = useState(1);
  const [lastResult, setLastResult] = useState<CashoutResult | null>(null);
  const growthRef = useRef(DEFAULT_GROWTH_PER_SECOND);

  useEffect(() => {
    if (odds) {
      growthRef.current = odds.growthPerSecond;
    }
  }, [odds]);

  useEffect(() => {
    if (startedAt === null) {
      return;
    }
    const interval = setInterval(() => {
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      setLiveMultiplier(Math.exp(growthRef.current * elapsedSeconds));
    }, 50);
    return () => clearInterval(interval);
  }, [startedAt]);

  const { mutate: start, isPending: isStarting } = useMutation({
    mutationFn: startRound,
    onSuccess: (result) => {
      setStartedAt(result.startedAt);
      setLiveMultiplier(1);
      setLastResult(null);
      // The wager is debited the moment the round starts, not at cashout - refresh the
      // balance/ledger here too, not just after cashout.
      queryClient.invalidateQueries({ queryKey: casinoBalanceKeys.all });
      queryClient.invalidateQueries({ queryKey: casinoLedgerKeys.all });
    },
    onError: (error: Error) => enqueueSnackbar(error.message || "Failed to start round", { variant: "error" }),
  });

  const { mutate: cashOutMutation, isPending: isCashingOut } = useMutation({
    mutationFn: cashoutRound,
    onSuccess: (result) => {
      setStartedAt(null);
      setLastResult(result);
      queryClient.invalidateQueries({ queryKey: casinoBalanceKeys.all });
      queryClient.invalidateQueries({ queryKey: casinoLedgerKeys.all });
      enqueueSnackbar(
        result.won
          ? `Cashed out at ${result.multiplier.toFixed(2)}x!`
          : `Crashed at ${result.crashPoint.toFixed(2)}x — you lost.`,
        { variant: result.won ? "success" : "error" }
      );
    },
    onError: (error: Error) => enqueueSnackbar(error.message || "Failed to cash out", { variant: "error" }),
  });

  return {
    odds,
    isPlaying: startedAt !== null,
    liveMultiplier,
    lastResult,
    isStarting,
    isCashingOut,
    start: (wager: number) => start(wager),
    cashOut: () => cashOutMutation(),
  };
};
