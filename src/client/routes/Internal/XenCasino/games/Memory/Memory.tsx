import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { Box, CircularProgress } from "@mui/material";
import { apiClient } from "../../../../../config/api";
import { ApiResponse } from "../../../../../types/api";
import { casinoBalanceKeys } from "../../../../../hooks/casino/useCasinoBalance";
import { casinoLedgerKeys } from "../../../../../hooks/casino/useCasinoLedger";
import GameWrapper, { OddsSection } from "../../components/GameWrapper";
import PlayLauncher from "../../components/PlayLauncher";
import MemoryBoard, { MemoryStartResult, MemoryRevealResult } from "../../components/MemoryBoard";
import { formatOddsRatio } from "../../utils/odds";

// Everything Memory needs lives in this one file plus the shared MemoryBoard engine - it
// only imports shared infrastructure (GameWrapper, MemoryBoard, the odds/currency utils),
// same shape as every other game page in this app.
const GAME = "memory";

// The backend only knows generic keys (ITEM_A..ITEM_O) - this map is entirely this page's
// own presentation choice, swappable without touching the server. Must cover every symbol
// in memory.ts's SYMBOL_GROUPS (odds.symbolGroups mirrors it at runtime).
const SYMBOL_EMOJI: Record<string, string> = {
    ITEM_A: "💎",
    ITEM_B: "7️⃣",
    ITEM_C: "🍒",
    ITEM_D: "🍋",
    ITEM_E: "🔔",
    ITEM_F: "🍇",
    ITEM_G: "🍀",
    ITEM_H: "🎲",
    ITEM_I: "🃏",
    ITEM_J: "💰",
    ITEM_K: "🦄",
    ITEM_L: "🌟",
    ITEM_M: "🔥",
    ITEM_N: "🎯",
    ITEM_O: "🎪",
};
const BASE_BET = 10000;
const BET_MULTIPLIERS = [1, 2, 5, 10, 50, 100];
const BET_OPTIONS = BET_MULTIPLIERS.map((m) => m * BASE_BET);
const BET_LABELS = BET_MULTIPLIERS.map((m) => `${m}x`);

interface MemoryOddsResponse {
    price: number;
    pickCount: number;
    symbolGroups: { symbol: string; count: number }[];
    distribution: { matchCount: number; multiplier: number; probability: number }[];
    rtp: number;
}

const fetchOdds = async (): Promise<MemoryOddsResponse> =>
    (await apiClient.get<ApiResponse<MemoryOddsResponse>>(`/api/casino/games/${GAME}/odds`)).data.data!;

const startRound = async (wager: number): Promise<MemoryStartResult> =>
    (await apiClient.post<ApiResponse<MemoryStartResult>>(`/api/casino/games/${GAME}/start`, { wager })).data.data!;

const revealRound = async (picks: number[]): Promise<MemoryRevealResult> =>
    (await apiClient.post<ApiResponse<MemoryRevealResult>>(`/api/casino/games/${GAME}/reveal`, { picks })).data.data!;

export default function Memory() {
    const queryClient = useQueryClient();
    const { enqueueSnackbar } = useSnackbar();

    const { data: odds } = useQuery({ queryKey: ["memoryOdds"], queryFn: fetchOdds, staleTime: 5 * 60 * 1000 });

    const invalidateBalances = () => {
        queryClient.invalidateQueries({ queryKey: casinoBalanceKeys.all });
        queryClient.invalidateQueries({ queryKey: casinoLedgerKeys.all });
    };

    const { mutateAsync: startAsync, isPending: isStarting } = useMutation({
        mutationFn: startRound,
        onSuccess: invalidateBalances,
        onError: (error: Error) => enqueueSnackbar(error.message || "Failed to start round", { variant: "error" }),
    });
    const { mutateAsync: revealAsync, isPending: isRevealing } = useMutation({
        mutationFn: revealRound,
        onSuccess: invalidateBalances,
        onError: (error: Error) => enqueueSnackbar(error.message || "Failed to reveal cards", { variant: "error" }),
    });

    const probabilityAnyWin = odds ? odds.distribution.filter((d) => d.multiplier > 0).reduce((sum, d) => sum + d.probability, 0) : undefined;
    const oddsLabel = formatOddsRatio(probabilityAnyWin);
    const rtpLabel = odds ? `RTP ${(odds.rtp * 100).toFixed(1)}%` : undefined;

    const oddsSections: OddsSection[] = odds
        ? [
            {
                title: "Prizes",
                rows: odds.distribution.map((d) => ({
                    label: `${d.matchCount} match${d.matchCount === 1 ? "" : "es"}`,
                    probability: d.probability,
                    payout: d.multiplier > 0 ? `${d.multiplier}x` : "—",
                })),
                footnote: `The 25-card grid always has 2 icons appearing 3 times, 6 icons appearing twice, and 7 unique singles that can never match. Flip ${odds.pickCount} cards - matches among them decide the prize.`,
            },
        ]
        : [];

    return (
        <GameWrapper
            title="Memory"
            howToPlay="A 10,000-cheddar round (with the usual bet multiplier). Start to see all 25 cards face up, then they flip and shuffle. Pick 4 cards to flip: one pair pays a small prize, two separate pairs pay bigger, and finding a full triple among your 4 is the top prize."
            oddsSections={oddsSections}
        >
            <PlayLauncher
                title="Memory"
                description="10,000-cheddar round - peek the grid, then pick 4 cards to flip for a prize."
                price={odds?.price ?? BASE_BET}
                oddsLabel={oddsLabel}
                rtpLabel={rtpLabel}
            >
                {odds ? (
                    <MemoryBoard
                        symbolGroups={odds.symbolGroups}
                        symbols={SYMBOL_EMOJI}
                        betOptions={BET_OPTIONS}
                        betLabels={BET_LABELS}
                        isPending={isStarting || isRevealing}
                        start={startAsync}
                        reveal={revealAsync}
                    />
                ) : (
                    <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                        <CircularProgress />
                    </Box>
                )}
            </PlayLauncher>
        </GameWrapper>
    );
}
