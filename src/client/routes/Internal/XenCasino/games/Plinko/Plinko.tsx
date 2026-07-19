import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { apiClient } from "../../../../../config/api";
import { ApiResponse } from "../../../../../types/api";
import { casinoBalanceKeys } from "../../../../../hooks/casino/useCasinoBalance";
import { casinoLedgerKeys } from "../../../../../hooks/casino/useCasinoLedger";
import { casinoDailyQuestKeys } from "../../../../../hooks/casino/useCasinoDailyQuest";
import GameWrapper, { OddsSection } from "../../components/GameWrapper";
import PlayLauncher from "../../components/PlayLauncher";
import PlinkoBoard, { PlinkoDropResult, PlinkoLayoutData } from "../../components/PlinkoBoard";

// Everything Plinko needs lives in this one file, same shape as every slots/scratch page -
// it only imports shared infrastructure (GameWrapper, PlinkoBoard). A second board (different
// row count/risk level) would be a new file shaped exactly like this one, hitting its own
// /api/casino/games/plinko-<slug>/* routes.
//
// No per-slot probability column (unlike the weighted-draw games) - the landing slot comes
// from a real physics simulation of a ball the player aims themselves, not a draw from a fixed
// table, so there's no single probability to show per slot the way Crossword/Kitty Scratch can.
// There IS a real RTP now though (`odds.rtp`, from a one-off Monte Carlo analysis - see the
// comment above MULTIPLIERS in plinkoLayout.ts): the worst-case return across every dropX a
// player could choose, so it's an honest number regardless of where they aim, not just an
// average over naive play.
const BASE_BET = 500;
const BET_MULTIPLIERS = [1, 2, 5, 10, 20, 50];
const BET_OPTIONS = BET_MULTIPLIERS.map((m) => m * BASE_BET);
const BET_LABELS = BET_MULTIPLIERS.map((m) => `${m}x`);

interface PlinkoOddsResponse {
    rows: number;
    slotCount: number;
    multipliers: number[];
    rtp: number;
    layout: PlinkoLayoutData;
}

const fetchOdds = async (): Promise<PlinkoOddsResponse> => (await apiClient.get<ApiResponse<PlinkoOddsResponse>>("/api/casino/games/plinko/odds")).data.data!;

const dropBall = async (wager: number, dropX: number): Promise<PlinkoDropResult> =>
    (await apiClient.post<ApiResponse<PlinkoDropResult>>("/api/casino/games/plinko/drop", { wager, dropX })).data.data!;

export default function Plinko() {
    const queryClient = useQueryClient();
    const { enqueueSnackbar } = useSnackbar();

    const { data: odds } = useQuery({ queryKey: ["plinkoOdds"], queryFn: fetchOdds, staleTime: 5 * 60 * 1000 });

    const { mutateAsync: dropAsync } = useMutation({
        mutationFn: ({ wager, dropX }: { wager: number; dropX: number }) => dropBall(wager, dropX),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: casinoBalanceKeys.all });
            queryClient.invalidateQueries({ queryKey: casinoLedgerKeys.all });
            queryClient.invalidateQueries({ queryKey: casinoDailyQuestKeys.all });
        },
        onError: (error: Error) => enqueueSnackbar(error.message || "Failed to drop", { variant: "error" }),
    });

    const oddsSections: OddsSection[] = odds
        ? [
              {
                  title: "Payout by slot",
                  rows: odds.multipliers.map((multiplier, slot) => ({
                      label: `Slot ${slot}`,
                      payout: `${multiplier}x`,
                  })),
                  footnote: `RTP ${(odds.rtp * 100).toFixed(1)}% (worst case, across every drop position) - aim toward the edges for a shot at the rare big multipliers; the crowded middle mostly breaks even or less.`,
              },
          ]
        : [];

    return (
        <GameWrapper
            title="Plinko"
            howToPlay="A marker glides back and forth above the board - click Drop Ball when it's where you want to aim. A real ball falls from there through 12 rows of pegs; where it lands decides your multiplier."
            oddsSections={oddsSections}
        >
            <PlayLauncher title="Plinko">
                <PlinkoBoard
                    betOptions={BET_OPTIONS}
                    betLabels={BET_LABELS}
                    layout={odds?.layout ?? null}
                    multipliers={odds?.multipliers ?? Array(13).fill(1)}
                    drop={(wager, dropX) => dropAsync({ wager, dropX })}
                />
            </PlayLauncher>
        </GameWrapper>
    );
}
