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

// 9 unique symbols matching the server's 7-triple + 2-double deck. ITEM_A..ITEM_G are
// triples (3 copies each), ITEM_H..ITEM_I are doubles (2 copies each). Every card has at
// least one match — no dead singles.
const SYMBOL_EMOJI: Record<string, string> = {
    ITEM_A: "💎",
    ITEM_B: "7️⃣",
    ITEM_C: "🍒",
    ITEM_D: "🍋",
    ITEM_E: "🔔",
    ITEM_F: "🍇",
    ITEM_G: "🍀",
    ITEM_H: "🎲",
    ITEM_I: "🎪",
};
const BASE_BET = 2500;
const BET_MULTIPLIERS = [1, 2, 5, 10, 50, 100];
const BET_OPTIONS = BET_MULTIPLIERS.map((m) => m * BASE_BET);
const BET_LABELS = BET_MULTIPLIERS.map((m) => `${m}x`);

interface MemoryOddsResponse {
    price: number;
    pickCount: number;
    maxReveals: number;
    symbolGroups: { symbol: string; count: number }[];
    distribution: { matchedPairs: number; multiplier: number; probability: number }[];
    rtp: number;
    maxPayout: number;
}

const fetchOdds = async (): Promise<MemoryOddsResponse> =>
    (await apiClient.get<ApiResponse<MemoryOddsResponse>>(`/api/casino/games/${GAME}/odds`)).data.data!;

const startRound = async (wager: number): Promise<MemoryStartResult> =>
    (await apiClient.post<ApiResponse<MemoryStartResult>>(`/api/casino/games/${GAME}/start`, { wager })).data.data!;

const revealRound = async ({ picks, revealIndex }: { picks: number[]; revealIndex: number }): Promise<MemoryRevealResult> =>
    (await apiClient.post<ApiResponse<MemoryRevealResult>>(`/api/casino/games/${GAME}/reveal`, { picks, revealIndex })).data.data!;

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
                    label: `${d.matchedPairs} pair${d.matchedPairs === 1 ? "" : "s"} matched`,
                    probability: d.probability,
                    payout: d.multiplier > 0 ? `${d.multiplier}x` : "—",
                })),
                footnote: `Flip 2 cards at a time over ${odds.maxReveals} tries. Matching pairs stay and are cleared; non-matches flip back. Remember what you've seen — the more pairs you match, the bigger the prize. ${odds.maxReveals} pairs matched is the jackpot.`,
            },
        ]
        : [];

    return (
        <GameWrapper
            title="Memory"
            howToPlay={`A ${BASE_BET.toLocaleString()}-cheddar round (with the usual bet multipliers). Start to see all 25 cards face up, then they flip and shuffle. Flip 2 cards at a time over ${odds?.maxReveals ?? 3} tries — matching pairs stay revealed and are cleared; non-matches flip back. Remember what you've seen to improve your odds on later tries.`}
            oddsSections={oddsSections}
            maxWin={odds?.maxPayout}
        >
            <PlayLauncher
                title="Memory"
                description={`${BASE_BET.toLocaleString()}-cheddar round — flip 2 cards at a time over ${odds?.maxReveals ?? 3} tries, matching pairs win prizes.`}
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
