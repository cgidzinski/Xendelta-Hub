import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSnackbar } from "notistack";
import { apiClient } from "../../../../../config/api";
import { ApiResponse } from "../../../../../types/api";
import { casinoBalanceKeys } from "../../../../../hooks/casino/useCasinoBalance";
import { casinoLedgerKeys } from "../../../../../hooks/casino/useCasinoLedger";
import { casinoDailyQuestKeys } from "../../../../../hooks/casino/useCasinoDailyQuest";
import GameWrapper, { OddsSection } from "../../components/GameWrapper";
import PlayLauncher from "../../components/PlayLauncher";
import PachinkoBoard, { PachinkoLaunchResult, PachinkoLayoutData, PachinkoPocketType, PachinkoSession } from "../../components/PachinkoBoard";
import PachinkoBuyPanel from "../../components/PachinkoBuyPanel";
import { formatOddsRatio } from "../../utils/odds";

// Everything Pachinko needs lives in this one file, same shape as Plinko.tsx - it only
// imports shared infrastructure (GameWrapper, the board/buy-panel components, the odds/
// currency utils). Unlike every other game, Pachinko has two "screens" inside the
// PlayLauncher modal (buy a batch, then launch it) instead of one - which of the two shows
// is just local `session` state here, not anything PlayLauncher itself needs to know about.
const POCKET_LABELS: Record<PachinkoPocketType, string> = {
    jackpot: "Jackpot",
    small: "Small Win",
    start: "Start (Jackpot Pool)",
    miss: "Miss",
};

interface PachinkoPaytableRow {
    index: number;
    type: PachinkoPocketType;
    probability: number;
    multiplier?: number;
}

interface PachinkoOddsResponse {
    pricePerBall: number;
    batchSizes: number[];
    layout: PachinkoLayoutData;
    paytable: PachinkoPaytableRow[];
    jackpotPool: number;
    rtp: number;
}

interface ActiveBatchResponse {
    active: boolean;
    roundId?: string;
    ballsTotal?: number;
    ballsRemaining?: number;
    pricePerBall?: number;
    totalPayout?: number;
}

interface BuyResponse {
    roundId: string;
    ballsTotal: number;
    ballsRemaining: number;
    pricePerBall: number;
    totalPayout: number;
    balance: string;
}

const fetchOdds = async (): Promise<PachinkoOddsResponse> => (await apiClient.get<ApiResponse<PachinkoOddsResponse>>("/api/casino/games/pachinko/odds")).data.data!;
const fetchActive = async (): Promise<ActiveBatchResponse> => (await apiClient.get<ApiResponse<ActiveBatchResponse>>("/api/casino/games/pachinko/active")).data.data!;
const buyBalls = async (ballsTotal: number): Promise<BuyResponse> =>
    (await apiClient.post<ApiResponse<BuyResponse>>("/api/casino/games/pachinko/buy", { ballsTotal })).data.data!;
const launchBall = async (): Promise<PachinkoLaunchResult> => (await apiClient.post<ApiResponse<PachinkoLaunchResult>>("/api/casino/games/pachinko/launch")).data.data!;

export default function Pachinko() {
    const queryClient = useQueryClient();
    const { enqueueSnackbar } = useSnackbar();
    const [session, setSession] = useState<PachinkoSession | null>(null);
    const [checkingActive, setCheckingActive] = useState(false);

    const { data: odds } = useQuery({ queryKey: ["pachinkoOdds"], queryFn: fetchOdds, staleTime: 60 * 1000 });

    const invalidateShared = () => {
        queryClient.invalidateQueries({ queryKey: casinoBalanceKeys.all });
        queryClient.invalidateQueries({ queryKey: casinoLedgerKeys.all });
        queryClient.invalidateQueries({ queryKey: casinoDailyQuestKeys.all });
        queryClient.invalidateQueries({ queryKey: ["pachinkoOdds"] }); // jackpot pool moved
    };

    const { mutateAsync: buyAsync, isPending: isBuying } = useMutation({
        mutationFn: buyBalls,
        onSuccess: (data) => {
            setSession({ roundId: data.roundId, ballsTotal: data.ballsTotal, ballsRemaining: data.ballsRemaining, pricePerBall: data.pricePerBall, totalPayout: data.totalPayout });
            invalidateShared();
        },
        onError: (error: Error) => enqueueSnackbar(error.message || "Failed to buy balls", { variant: "error" }),
    });

    const { mutateAsync: launchAsync, isPending: isLaunching } = useMutation({
        mutationFn: launchBall,
        onSuccess: invalidateShared,
        onError: (error: Error) => enqueueSnackbar(error.message || "Failed to launch", { variant: "error" }),
    });

    // Fires every time the modal opens (not just the first time) - a batch bought in a
    // previous visit may still be open, so this decides whether to resume the board or show
    // the buy panel instead of always defaulting to "no session."
    const handleOpen = async () => {
        setCheckingActive(true);
        try {
            const active = await fetchActive();
            if (active.active && active.roundId && active.ballsTotal !== undefined && active.ballsRemaining !== undefined && active.pricePerBall !== undefined) {
                setSession({
                    roundId: active.roundId,
                    ballsTotal: active.ballsTotal,
                    ballsRemaining: active.ballsRemaining,
                    pricePerBall: active.pricePerBall,
                    totalPayout: active.totalPayout ?? 0,
                });
            } else {
                setSession(null);
            }
        } catch {
            setSession(null);
        } finally {
            setCheckingActive(false);
        }
    };

    const oddsLabel = formatOddsRatio(odds?.paytable.filter((row) => row.type !== "miss").reduce((sum, row) => sum + row.probability, 0));
    const rtpLabel = odds ? `RTP ${(odds.rtp * 100).toFixed(1)}%` : undefined;

    const oddsSections: OddsSection[] = odds
        ? [
              {
                  title: "Paytable",
                  rows: odds.paytable.map((row) => ({
                      label: POCKET_LABELS[row.type],
                      probability: row.probability,
                      payout: row.type === "start" ? "Pool" : row.multiplier ? `${row.multiplier}x` : "—",
                  })),
                  footnote: "Most balls miss, like a real pachinko board - rare scoring pockets pay a fixed multiplier, and the Start pocket pays out the entire jackpot pool.",
              },
          ]
        : [];

    return (
        <GameWrapper
            title="Pachinko"
            howToPlay="Buy a batch of balls, then launch them one at a time into the pin field. Most balls miss - land in a scoring pocket for a fixed multiplier, or hit the Start pocket to win the whole jackpot pool."
            oddsSections={oddsSections}
        >
            <PlayLauncher title="Pachinko" oddsLabel={oddsLabel} rtpLabel={rtpLabel} onOpen={handleOpen}>
                {!session ? (
                    <PachinkoBuyPanel batchSizes={odds?.batchSizes ?? []} pricePerBall={odds?.pricePerBall ?? 0} isPending={isBuying || checkingActive} onBuy={buyAsync} />
                ) : (
                    <PachinkoBoard
                        session={session}
                        layout={odds?.layout ?? null}
                        jackpotPool={odds?.jackpotPool ?? 0}
                        isPending={isLaunching}
                        launch={launchAsync}
                        onSessionUpdate={setSession}
                        onBuyMore={() => setSession(null)}
                    />
                )}
            </PlayLauncher>
        </GameWrapper>
    );
}
