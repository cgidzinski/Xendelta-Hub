import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { apiClient } from "../../../../../config/api";
import { ApiResponse } from "../../../../../types/api";
import { casinoBalanceKeys } from "../../../../../hooks/casino/useCasinoBalance";
import { casinoLedgerKeys } from "../../../../../hooks/casino/useCasinoLedger";
import GameWrapper, { OddsSection } from "../../components/GameWrapper";
import PlayLauncher from "../../components/PlayLauncher";
import SlotMachine, { SlotSpinResult } from "../../components/SlotMachine";
import { formatOddsRatio } from "../../utils/odds";

// Everything Spinmania needs lives in this one file - same shape as EasySpin.tsx, just
// its own theme/denomination/machine slug. Proves SlotMachine's two axes of genericity:
// different images (this reskins the same backend symbol keys with different emoji) and
// different amounts (20,000-credit denomination vs Easy Spin's 5,000).
const MACHINE = "spinmania";

// Reskins the same generic backend symbol keys (JACKPOT_ITEM, ITEM_A, ITEM_B, ...) with a
// different, higher-energy visual theme - the underlying odds are a genuinely different,
// higher-volatility paytable server-side (see slots.ts), not just a coat of paint.
const SYMBOL_EMOJI: Record<string, string> = {
    ITEM_A: "🍓",
    ITEM_B: "🍊",
    ITEM_C: "⭐",
    ITEM_D: "💠",
    JACKPOT_ITEM: "👑",
};
const BASE_BET = 20000;
const BET_MULTIPLIERS = [1, 2, 5, 10, 50, 100];
const BET_OPTIONS = BET_MULTIPLIERS.map((m) => m * BASE_BET);
const BET_LABELS = BET_MULTIPLIERS.map((m) => `${m}x`);

interface PaytableRow {
    symbols: string[]; // e.g. ["ITEM_A","ITEM_A","ITEM_A"] - "OTHER" is the wildcard slot
    probability: number;
    multiplier?: number;
    jackpot?: boolean;
}

interface SlotsOddsResponse {
    paytable: PaytableRow[];
    jackpotContributionRate: number;
    jackpotPool: number;
    rtp: number;
}

const fetchOdds = async (): Promise<SlotsOddsResponse> =>
    (await apiClient.get<ApiResponse<SlotsOddsResponse>>(`/api/casino/games/slots/${MACHINE}/odds`)).data.data!;

// The backend hands back generic symbol keys (plus a jackpot flag and "OTHER" for a
// wildcard slot) - this machine's own emoji map is the only thing that turns that into a
// readable paytable row.
const formatCombo = (row: PaytableRow): string => {
    const label = row.symbols.map((s) => (s === "OTHER" ? "❔" : SYMBOL_EMOJI[s] ?? s)).join(" ");
    return row.jackpot ? `${label} (jackpot)` : label;
};

const spinReels = async (wager: number): Promise<SlotSpinResult> =>
    (await apiClient.post<ApiResponse<SlotSpinResult>>(`/api/casino/games/slots/${MACHINE}/spin`, { wager })).data.data!;

export default function Spinmania() {
    const queryClient = useQueryClient();
    const { enqueueSnackbar } = useSnackbar();

    const { data: odds } = useQuery({ queryKey: ["slotsOdds", MACHINE], queryFn: fetchOdds, staleTime: 15 * 1000 });

    const { mutateAsync: spinAsync, isPending } = useMutation({
        mutationFn: spinReels,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: casinoBalanceKeys.all });
            queryClient.invalidateQueries({ queryKey: casinoLedgerKeys.all });
            queryClient.invalidateQueries({ queryKey: ["slotsOdds", MACHINE] });
        },
        onError: (error: Error) => enqueueSnackbar(error.message || "Failed to spin", { variant: "error" }),
    });

    const oddsLabel = formatOddsRatio(odds?.paytable.reduce((sum, row) => sum + row.probability, 0));
    const rtpLabel = odds ? `RTP ${(odds.rtp * 100).toFixed(1)}%` : undefined;

    const oddsSections: OddsSection[] = odds
        ? [
              {
                  title: "Paytable",
                  rows: odds.paytable.map((row) => ({
                      label: formatCombo(row),
                      probability: row.probability,
                      payout: row.multiplier ? `${row.multiplier}x` : "Jackpot pool",
                  })),
                  footnote: `${(odds.jackpotContributionRate * 100).toFixed(1)}% of every wager feeds the jackpot.`,
              },
          ]
        : [];

    return (
        <GameWrapper
            title="Spinmania"
            howToPlay="A 20,000-credit high-roller machine with its own separate jackpot. Spin the reels for a shot at the growing jackpot - match 3 symbols to win."
            oddsSections={oddsSections}
        >
            <PlayLauncher title="Spinmania" oddsLabel={oddsLabel} rtpLabel={rtpLabel}>
                <SlotMachine
                    symbols={SYMBOL_EMOJI}
                    betOptions={BET_OPTIONS}
                    betLabels={BET_LABELS}
                    jackpotPool={odds?.jackpotPool}
                    denominationLabel="20000"
                    oddsLabel={oddsLabel}
                    rtpLabel={rtpLabel}
                    isPending={isPending}
                    spin={spinAsync}
                />
            </PlayLauncher>
        </GameWrapper>
    );
}
