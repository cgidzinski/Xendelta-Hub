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
import PachinkoBoard, { PachinkoLaunchResult, PachinkoLayoutData, PachinkoSession } from "../../components/PachinkoBoard";
import PachinkoBuyPanel from "../../components/PachinkoBuyPanel";

// Everything Pachinko needs lives in this one file, same shape as Plinko.tsx - it only
// imports shared infrastructure (GameWrapper, the board/buy-panel components). Unlike every
// other game, Pachinko has two "screens" inside the PlayLauncher modal (buy a batch, then
// launch it) instead of one - which of the two shows is just local `session` state here, not
// anything PlayLauncher itself needs to know about.
//
// There's no fixed paytable/probability table or RTP figure to show (unlike every other
// game) - the outcome comes from a real physics simulation driven by the player's own launch
// power, not a pre-selected weighted draw, so there's nothing to derive one from. The odds
// section below is a qualitative description instead of a probability table.
interface PachinkoOddsResponse {
    pricePerBall: number;
    batchSizes: number[];
    launchPowerRange: { min: number; max: number };
    layout: PachinkoLayoutData;
    sideTulipMultiplier: number;
    jackpotPool: number;
}

interface ActiveBatchResponse {
    active: boolean;
    roundId?: string;
    ballsTotal?: number;
    ballsRemaining?: number;
    pricePerBall?: number;
    totalPayout?: number;
    leftTulipOpen?: boolean;
    rightTulipOpen?: boolean;
}

interface BuyResponse {
    roundId: string;
    ballsTotal: number;
    ballsRemaining: number;
    pricePerBall: number;
    totalPayout: number;
    leftTulipOpen: boolean;
    rightTulipOpen: boolean;
    balance: string;
}

const fetchOdds = async (): Promise<PachinkoOddsResponse> => (await apiClient.get<ApiResponse<PachinkoOddsResponse>>("/api/casino/games/pachinko/odds")).data.data!;
const fetchActive = async (): Promise<ActiveBatchResponse> => (await apiClient.get<ApiResponse<ActiveBatchResponse>>("/api/casino/games/pachinko/active")).data.data!;
const buyBalls = async (ballsTotal: number): Promise<BuyResponse> =>
    (await apiClient.post<ApiResponse<BuyResponse>>("/api/casino/games/pachinko/buy", { ballsTotal })).data.data!;
const launchBall = async (launchPower: number): Promise<PachinkoLaunchResult> =>
    (await apiClient.post<ApiResponse<PachinkoLaunchResult>>("/api/casino/games/pachinko/launch", { launchPower })).data.data!;

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
            setSession({
                roundId: data.roundId,
                ballsTotal: data.ballsTotal,
                ballsRemaining: data.ballsRemaining,
                pricePerBall: data.pricePerBall,
                totalPayout: data.totalPayout,
                leftTulipOpen: data.leftTulipOpen,
                rightTulipOpen: data.rightTulipOpen,
            });
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
                    leftTulipOpen: active.leftTulipOpen ?? false,
                    rightTulipOpen: active.rightTulipOpen ?? false,
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

    const oddsSections: OddsSection[] = odds
        ? [
              {
                  title: "How balls score",
                  rows: [
                      { label: "Miss (most balls)", payout: "—" },
                      { label: "Side tulip (left or right)", payout: `${odds.sideTulipMultiplier}x` },
                      { label: "Center tulip, primed", payout: "Jackpot Pool" },
                  ],
                  footnote:
                      "Most balls miss, like a real pachinko board. Side tulips toggle open/closed each time they catch a ball; the center tulip is nearly impossible to catch until both side tulips are open at once, then it pays out the entire jackpot pool.",
              },
          ]
        : [];

    return (
        <GameWrapper
            title="Pachinko"
            howToPlay="Buy a batch of balls, then launch them one at a time with your own launch power. Most balls miss - land in a side tulip for a fixed multiplier, or open both side tulips to prime the center tulip and win the whole jackpot pool."
            oddsSections={oddsSections}
        >
            <PlayLauncher title="Pachinko" onOpen={handleOpen}>
                {!session ? (
                    <PachinkoBuyPanel batchSizes={odds?.batchSizes ?? []} pricePerBall={odds?.pricePerBall ?? 0} isPending={isBuying || checkingActive} onBuy={buyAsync} />
                ) : (
                    <PachinkoBoard
                        session={session}
                        layout={odds?.layout ?? null}
                        jackpotPool={odds?.jackpotPool ?? 0}
                        launchPowerRange={odds?.launchPowerRange ?? { min: 0, max: 100 }}
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
