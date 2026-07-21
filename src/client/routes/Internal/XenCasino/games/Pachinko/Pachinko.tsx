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
import { formatCheddar } from "../../utils/currency";

// Everything Pachinko needs lives in this one file, same shape as Plinko.tsx - it only imports
// shared infrastructure (GameWrapper, the board). There's no separate "buy panel" screen gating
// the board - the board renders immediately (even with no active batch, `session === null`) and
// reup buttons live inside it, matching how Plinko's own board keeps its bet controls inline.
//
// Unlike every other game, there's no fixed paytable/probability table or RTP figure to show -
// the outcome comes from a real physics simulation driven by the player's own launch power, not
// a pre-selected weighted draw. There's also no cash payout per shot: every catch adds balls to
// the tray, and Cash Out (wired up below) is the only thing that ever converts that tray back
// to real cheddar - see pachinko.ts's own file header for the full economy shape.
interface PachinkoOddsResponse {
    pricePerBall: number;
    reupSizes: number[];
    launchPowerRange: { min: number; max: number };
    layout: PachinkoLayoutData;
    sideTulipBalls: number;
    bonusPocketBalls: number;
    attackerBalls: number;
    attackerOpenMs: number;
    cashOutRate: number;
    jackpotPool: number;
}

interface ActiveBatchResponse {
    active: boolean;
    roundId?: string;
    ballsTotal?: number;
    ballsRemaining?: number;
    pricePerBall?: number;
    leftTulipOpen?: boolean;
    rightTulipOpen?: boolean;
    attackerOpenUntil?: number;
    jackpotOpenUntil?: number;
}

interface BuyResponse {
    roundId: string;
    ballsTotal: number;
    ballsRemaining: number;
    pricePerBall: number;
    leftTulipOpen: boolean;
    rightTulipOpen: boolean;
    attackerOpenUntil: number;
    jackpotOpenUntil: number;
    balance: string;
}

interface CashOutResponse {
    ballsCashedOut: number;
    amount: number;
    balance: string;
}

const fetchOdds = async (): Promise<PachinkoOddsResponse> => (await apiClient.get<ApiResponse<PachinkoOddsResponse>>("/api/casino/games/pachinko/odds")).data.data!;
const fetchActive = async (): Promise<ActiveBatchResponse> => (await apiClient.get<ApiResponse<ActiveBatchResponse>>("/api/casino/games/pachinko/active")).data.data!;
// Same endpoint creates a fresh batch or reups an existing one - the server decides which based
// on whether the player already has an active round (see pachinko.ts's /buy handler).
const buyBalls = async (balls: number): Promise<BuyResponse> => (await apiClient.post<ApiResponse<BuyResponse>>("/api/casino/games/pachinko/buy", { balls })).data.data!;
const launchBall = async (launchPower: number): Promise<PachinkoLaunchResult> =>
    (await apiClient.post<ApiResponse<PachinkoLaunchResult>>("/api/casino/games/pachinko/launch", { launchPower })).data.data!;
const cashOutBalls = async (): Promise<CashOutResponse> => (await apiClient.post<ApiResponse<CashOutResponse>>("/api/casino/games/pachinko/cashout")).data.data!;

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

    // A reup response's gate fields (leftTulipOpen/rightTulipOpen/attackerOpenUntil/
    // jackpotOpenUntil) are just whatever the DB happened to hold at that read - reup doesn't
    // change any of them - and this request has no seq/staleness guard the way launch responses
    // do (see PachinkoBoard.tsx's latestAppliedSeqRef). If a reup fired while balls were still
    // resolving from hold-to-fire, applying it wholesale could clobber fresher gate state a
    // just-landed launch response already applied. So: only overwrite the fields a buy/reup
    // response actually owns, and carry forward the existing session's gate state when there
    // already is one - a fresh buy (no prior session) still gets correct initial values from the
    // response itself, since those start false/0 for a brand new round anyway.
    const applyBuyResponse = (data: BuyResponse) => {
        setSession((prev) => ({
            roundId: data.roundId,
            ballsTotal: data.ballsTotal,
            ballsRemaining: data.ballsRemaining,
            pricePerBall: data.pricePerBall,
            leftTulipOpen: prev?.leftTulipOpen ?? data.leftTulipOpen,
            rightTulipOpen: prev?.rightTulipOpen ?? data.rightTulipOpen,
            attackerOpenUntil: prev?.attackerOpenUntil ?? data.attackerOpenUntil,
            jackpotOpenUntil: prev?.jackpotOpenUntil ?? data.jackpotOpenUntil,
        }));
        invalidateShared();
    };

    const { mutateAsync: reupAsync, isPending: isReuping } = useMutation({
        mutationFn: buyBalls,
        onSuccess: applyBuyResponse,
        onError: (error: Error) => enqueueSnackbar(error.message || "Failed to buy balls", { variant: "error" }),
    });

    const { mutateAsync: launchAsync } = useMutation({
        mutationFn: launchBall,
        onSuccess: invalidateShared,
        onError: (error: Error) => enqueueSnackbar(error.message || "Failed to launch", { variant: "error" }),
    });

    const { mutateAsync: cashOutAsync } = useMutation({
        mutationFn: cashOutBalls,
        onSuccess: (data) => {
            enqueueSnackbar(`Cashed out ${data.ballsCashedOut} balls`, { variant: "success" });
            setSession(null);
            invalidateShared();
        },
        onError: (error: Error) => enqueueSnackbar(error.message || "Failed to cash out", { variant: "error" }),
    });

    // No manual Cash Out button - closing the modal (X or Escape, see PlayLauncher's own
    // onClose) settles up automatically instead, same as walking away from a real machine and
    // having the attendant count out your tray. Only fires the transfer if there's actually
    // something to cash out - opening and immediately closing without playing shouldn't throw
    // an error toast.
    const handleClose = () => {
        if (session && session.ballsRemaining > 0) {
            cashOutAsync();
        }
    };

    // Fires every time the modal opens (not just the first time) - a batch bought in a previous
    // visit may still be open, so this decides whether to resume it or start with no session
    // (the board still renders either way - see PachinkoBoard).
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
                    leftTulipOpen: active.leftTulipOpen ?? false,
                    rightTulipOpen: active.rightTulipOpen ?? false,
                    attackerOpenUntil: active.attackerOpenUntil ?? 0,
                    jackpotOpenUntil: active.jackpotOpenUntil ?? 0,
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
                    { label: "Bonus pocket", payout: `+${odds.bonusPocketBalls} balls` },
                    { label: "Side tulip (left or right)", payout: `+${odds.sideTulipBalls} balls` },
                    { label: "Chucker", payout: "Spins the reel" },
                    { label: "Reel, 2 of a kind", payout: "Small ball bonus" },
                    { label: "Reel, 3 of a kind", payout: `Bigger bonus + opens attacker (${Math.round(odds.attackerOpenMs / 1000)}s)` },
                    { label: "Attacker (while open)", payout: `+${odds.attackerBalls} balls` },
                    { label: "Jackpot, primed", payout: "Pool → balls" },
                ],
                footnote:
                    "Every catch pays out in balls, never cheddar directly - closing the game cashes out your tray automatically. Most balls miss, like a real pachinko board. Side tulips toggle open/closed each time they catch a ball; the jackpot pocket is nearly impossible to catch until both side tulips are open at once, then it pays the whole jackpot pool, converted to balls. The chucker doesn't pay anything itself directly, but opens the attacker gate for a few seconds and spins the board's central reel - a real modern machine's own start-chucker-triggers-the-LCD-reel gimmick. Two or three matching symbols add a modest ball bonus on top, and three of a kind also extends the attacker's open window.",
            },
        ]
        : [];

    return (
        <GameWrapper
            title="Pachinko"
            howToPlay="Buy balls with the +100/+1000 buttons, then hold Launch to fire them at your own power - balls fly one every 600ms while held. Most balls miss - catches add more balls to your tray instead of paying cash. Closing the game cashes out your tray automatically."
            oddsSections={oddsSections}
        >
            <PlayLauncher
                title="Pachinko"
                description="Buy balls and fire them at your own power - catches add balls to your tray."
                jackpotLabel={odds?.jackpotPool ? `🎰 ${formatCheddar(odds.jackpotPool)}` : undefined}
                price={odds?.pricePerBall}
                onOpen={handleOpen}
                onClose={handleClose}
            >
                <PachinkoBoard
                    session={session}
                    layout={odds?.layout ?? null}
                    jackpotPool={odds?.jackpotPool ?? 0}
                    cashOutRate={odds?.cashOutRate ?? 1}
                    bonusPocketBalls={odds?.bonusPocketBalls ?? 0}
                    sideTulipBalls={odds?.sideTulipBalls ?? 0}
                    attackerBalls={odds?.attackerBalls ?? 0}
                    launchPowerRange={odds?.launchPowerRange ?? { min: 0, max: 100 }}
                    pricePerBall={odds?.pricePerBall ?? 0}
                    isResuming={checkingActive}
                    launch={launchAsync}
                    reup={reupAsync}
                    isReuping={isReuping}
                    onSessionUpdate={setSession}
                />
            </PlayLauncher>
        </GameWrapper>
    );
}
