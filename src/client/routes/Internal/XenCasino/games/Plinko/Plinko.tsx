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
// No fixed probability table or RTP figure to show (same call already made for Pachinko) -
// the landing slot comes from a real physics simulation of a ball the player aims themselves,
// not a pre-selected weighted draw, so there's nothing to derive an exact number from. The
// multiplier table is still meaningful (it's what actually determines the payout once a slot
// is known) so that part of the odds section stays, just without a probability column.
const BASE_BET = 500;
const BET_MULTIPLIERS = [1, 2, 5, 10, 20, 50];
const BET_OPTIONS = BET_MULTIPLIERS.map((m) => m * BASE_BET);
const BET_LABELS = BET_MULTIPLIERS.map((m) => `${m}x`);

interface PlinkoOddsResponse {
    rows: number;
    slotCount: number;
    multipliers: number[];
    layout: PlinkoLayoutData;
}

const fetchOdds = async (): Promise<PlinkoOddsResponse> => (await apiClient.get<ApiResponse<PlinkoOddsResponse>>("/api/casino/games/plinko/odds")).data.data!;

const dropBall = async (wager: number, dropX: number): Promise<PlinkoDropResult> =>
    (await apiClient.post<ApiResponse<PlinkoDropResult>>("/api/casino/games/plinko/drop", { wager, dropX })).data.data!;

export default function Plinko() {
    const queryClient = useQueryClient();
    const { enqueueSnackbar } = useSnackbar();

    const { data: odds } = useQuery({ queryKey: ["plinkoOdds"], queryFn: fetchOdds, staleTime: 5 * 60 * 1000 });

    const { mutateAsync: dropAsync, isPending } = useMutation({
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
                  footnote: "Aim the marker toward the edges for a shot at the rare big multipliers - the crowded middle mostly breaks even or less.",
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
                    isPending={isPending}
                    drop={(wager, dropX) => dropAsync({ wager, dropX })}
                />
            </PlayLauncher>
        </GameWrapper>
    );
}
