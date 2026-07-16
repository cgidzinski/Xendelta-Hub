import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { apiClient } from "../../../../../config/api";
import { ApiResponse } from "../../../../../types/api";
import { casinoBalanceKeys } from "../../../../../hooks/casino/useCasinoBalance";
import { casinoLedgerKeys } from "../../../../../hooks/casino/useCasinoLedger";
import { casinoDailyQuestKeys } from "../../../../../hooks/casino/useCasinoDailyQuest";
import GameWrapper, { OddsSection } from "../../components/GameWrapper";
import PlayLauncher from "../../components/PlayLauncher";
import PlinkoBoard, { PlinkoDropResult } from "../../components/PlinkoBoard";
import { formatOddsRatio } from "../../utils/odds";

// Everything Plinko needs lives in this one file, same shape as every slots/scratch page -
// it only imports shared infrastructure (GameWrapper, PlinkoBoard, the odds/currency
// utils). A second board (different row count/risk level) would be a new file shaped
// exactly like this one, hitting its own /api/casino/games/plinko-<slug>/* routes.
const BASE_BET = 500;
const BET_MULTIPLIERS = [1, 2, 5, 10, 20, 50];
const BET_OPTIONS = BET_MULTIPLIERS.map((m) => m * BASE_BET);
const BET_LABELS = BET_MULTIPLIERS.map((m) => `${m}x`);

interface PlinkoPaytableRow {
    slot: number;
    probability: number;
    multiplier: number;
}

interface PlinkoOddsResponse {
    rows: number;
    paytable: PlinkoPaytableRow[];
    rtp: number;
}

const fetchOdds = async (): Promise<PlinkoOddsResponse> => (await apiClient.get<ApiResponse<PlinkoOddsResponse>>("/api/casino/games/plinko/odds")).data.data!;

const dropBall = async (wager: number): Promise<PlinkoDropResult> =>
    (await apiClient.post<ApiResponse<PlinkoDropResult>>("/api/casino/games/plinko/drop", { wager })).data.data!;

export default function Plinko() {
    const queryClient = useQueryClient();
    const { enqueueSnackbar } = useSnackbar();

    const { data: odds } = useQuery({ queryKey: ["plinkoOdds"], queryFn: fetchOdds, staleTime: 5 * 60 * 1000 });

    const { mutateAsync: dropAsync, isPending } = useMutation({
        mutationFn: dropBall,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: casinoBalanceKeys.all });
            queryClient.invalidateQueries({ queryKey: casinoLedgerKeys.all });
            queryClient.invalidateQueries({ queryKey: casinoDailyQuestKeys.all });
        },
        onError: (error: Error) => enqueueSnackbar(error.message || "Failed to drop", { variant: "error" }),
    });

    const oddsLabel = formatOddsRatio(odds?.paytable.find((row) => row.slot === 0)?.probability);
    const rtpLabel = odds ? `RTP ${(odds.rtp * 100).toFixed(1)}%` : undefined;

    const oddsSections: OddsSection[] = odds
        ? [
              {
                  title: "Paytable",
                  rows: odds.paytable.map((row) => ({
                      label: `Slot ${row.slot}`,
                      probability: row.probability,
                      payout: `${row.multiplier}x`,
                  })),
                  footnote: "Rarer edge slots pay big; the crowded middle mostly breaks even or less.",
              },
          ]
        : [];

    return (
        <GameWrapper
            title="Plinko"
            howToPlay="Drop a ball through 12 rows of pegs. Where it lands decides your multiplier - rare edge slots pay the most, the crowded middle mostly loses."
            oddsSections={oddsSections}
        >
            <PlayLauncher title="Plinko" oddsLabel={oddsLabel} rtpLabel={rtpLabel}>
                <PlinkoBoard
                    betOptions={BET_OPTIONS}
                    betLabels={BET_LABELS}
                    rows={odds?.rows ?? 12}
                    multipliers={odds?.paytable.map((row) => row.multiplier) ?? Array(13).fill(1)}
                    oddsLabel={oddsLabel}
                    rtpLabel={rtpLabel}
                    isPending={isPending}
                    drop={dropAsync}
                />
            </PlayLauncher>
        </GameWrapper>
    );
}
