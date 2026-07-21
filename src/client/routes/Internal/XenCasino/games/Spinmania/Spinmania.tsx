import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { apiClient } from "../../../../../config/api";
import { ApiResponse } from "../../../../../types/api";
import { casinoBalanceKeys } from "../../../../../hooks/casino/useCasinoBalance";
import { casinoLedgerKeys } from "../../../../../hooks/casino/useCasinoLedger";
import GameWrapper, { OddsSection } from "../../components/GameWrapper";
import PlayLauncher from "../../components/PlayLauncher";
import SpinmaniaGrid, { SpinmaniaSpinResult } from "../../components/SpinmaniaGrid";
import { formatOddsRatio } from "../../utils/odds";
import { formatCheddar } from "../../utils/currency";

// SpinMania has its own dedicated 5x3 cascading-grid engine (spinmaniaGrid.ts/spinmania.ts
// on the server, SpinmaniaGrid.tsx here) - a genuinely different game shape from Easy Spin's
// 3-reel machine, not a config variant of it, so it hits its own /api/casino/games/spinmania/*
// routes instead of the shared /api/casino/games/slots/:machine/* ones.
const SYMBOL_EMOJI: Record<string, string> = {
    ITEM_A: "🍓",
    ITEM_B: "🍊",
    ITEM_C: "⭐",
    ITEM_D: "💠",
    JACKPOT_ITEM: "👑",
    BLANK: "⚪",
};
const BASE_BET = 20000;
const BET_MULTIPLIERS = [1, 2, 5, 10, 50, 100];
const BET_OPTIONS = BET_MULTIPLIERS.map((m) => m * BASE_BET);
const BET_LABELS = BET_MULTIPLIERS.map((m) => `${m}x`);

interface PaytableRow {
    symbol: string;
    runLength: number;
    probability: number;
    multiplier: number;
}

interface SpinmaniaOddsResponse {
    gridCols: number;
    gridRows: number;
    paytable: PaytableRow[];
    cascadeMultipliers: number[];
    jackpotScatterCount: number;
    jackpotProbability: number;
    jackpotContributionRate: number;
    jackpotPool: number;
    rtp: number;
}

const fetchOdds = async (): Promise<SpinmaniaOddsResponse> => (await apiClient.get<ApiResponse<SpinmaniaOddsResponse>>("/api/casino/games/spinmania/odds")).data.data!;

const formatCombo = (row: PaytableRow): string => `${SYMBOL_EMOJI[row.symbol] ?? row.symbol} x${row.runLength}`;

const spinReels = async (wager: number): Promise<SpinmaniaSpinResult> =>
    (await apiClient.post<ApiResponse<SpinmaniaSpinResult>>("/api/casino/games/spinmania/spin", { wager })).data.data!;

export default function Spinmania() {
    const queryClient = useQueryClient();
    const { enqueueSnackbar } = useSnackbar();

    const { data: odds } = useQuery({ queryKey: ["spinmaniaOdds"], queryFn: fetchOdds, staleTime: 15 * 1000 });

    const { mutateAsync: spinAsync, isPending } = useMutation({
        mutationFn: spinReels,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: casinoBalanceKeys.all });
            queryClient.invalidateQueries({ queryKey: casinoLedgerKeys.all });
            queryClient.invalidateQueries({ queryKey: ["spinmaniaOdds"] });
        },
        onError: (error: Error) => enqueueSnackbar(error.message || "Failed to spin", { variant: "error" }),
    });

    const oddsLabel = formatOddsRatio(odds ? odds.paytable.reduce((sum, row) => sum + row.probability, 0) + odds.jackpotProbability : undefined);
    const rtpLabel = odds ? `RTP ${(odds.rtp * 100).toFixed(1)}%` : undefined;

    const oddsSections: OddsSection[] = odds
        ? [
            {
                title: "Paytable (per matching way, left-to-right)",
                rows: [
                    {
                        label: `${odds.jackpotScatterCount}+ ${SYMBOL_EMOJI.JACKPOT_ITEM} anywhere on the grid`,
                        probability: odds.jackpotProbability,
                        payout: "Jackpot pool",
                    },
                    ...odds.paytable.map((row) => ({
                        label: formatCombo(row),
                        probability: row.probability,
                        payout: `${row.multiplier}x`,
                    })),
                ],
                footnote: `Cascade multiplier: each consecutive win within the same spin is worth more than the last - ${odds.cascadeMultipliers.join("x, ")}x, then holding at ${odds.cascadeMultipliers[odds.cascadeMultipliers.length - 1]}x for any further chain. ${(odds.jackpotContributionRate * 100).toFixed(1)}% of every wager feeds the jackpot pool.`,
            },
        ]
        : [];

    return (
        <GameWrapper
            title="Spinmania"
            howToPlay={`A 20,000-credit high-roller machine with a 5x3 grid that pays all ways, not fixed lines: land 3, 4, or 5 matching symbols in a row of consecutive columns starting from the left (any row, any position within the column) and it pays - more matches per column means more "ways" and a bigger payout. Click Spin to get the grid rolling, then Stop whenever you're ready to reveal the result. Every winning symbol clears and new ones cascade down to refill the gaps, and if that refill creates another win it pays too - each consecutive cascade within the same spin is worth more than the last, so a single spin can chain into a much bigger payout than the base hit. Land ${odds?.jackpotScatterCount ?? 6} or more crowns anywhere on the grid before any cascade for a shot at the growing jackpot instead.`}
            oddsSections={oddsSections}
        >
            <PlayLauncher
                title="Spinmania"
                description="20,000-credit high-roller machine with its own jackpot."
                jackpotLabel={odds?.jackpotPool ? `🎰 ${formatCheddar(odds.jackpotPool)}` : undefined}
                price={20000}
                oddsLabel={oddsLabel}
                rtpLabel={rtpLabel}
            >
                <SpinmaniaGrid
                    symbols={SYMBOL_EMOJI}
                    betOptions={BET_OPTIONS}
                    betLabels={BET_LABELS}
                    jackpotPool={odds?.jackpotPool}
                    denominationLabel="20000"
                    isPending={isPending}
                    spin={spinAsync}
                />
            </PlayLauncher>
        </GameWrapper>
    );
}
