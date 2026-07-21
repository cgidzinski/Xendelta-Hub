import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Typography, ToggleButtonGroup, ToggleButton } from "@mui/material";
import { formatCheddar } from "../utils/currency";
import { generateConfetti, ConfettiOverlay, RoundResultBanner, type RoundResult } from "./slotEffects";

export interface SlotSpinResult {
    reels: string[]; // symbol keys - must match the `symbols` prop's keys
    payout: number;
    jackpot?: boolean;
    balance: string;
}

export interface SlotMachineProps {
    symbols: Record<string, string>; // symbol key -> emoji/image for THIS machine
    betOptions: number[]; // THIS machine's denomination buttons
    betLabels?: string[]; // parallel to betOptions, e.g. "1x"/"2x"/"5x" - falls back to the cheddar amount
    defaultBet?: number; // defaults to betOptions[0]
    reelCount?: number; // defaults to 3
    jackpotPool?: number; // omit to hide the jackpot readout
    denominationLabel?: string; // e.g. "500" - this machine's cost per spin
    oddsLabel?: string; // e.g. "1:2.97" - shown between the jackpot and cost-per readouts
    rtpLabel?: string; // e.g. "RTP 95.2%" - shown right beside oddsLabel, always
    isPending: boolean; // network request in flight
    spin: (wager: number) => Promise<SlotSpinResult>;
    onResult?: (result: SlotSpinResult) => void; // fired once reels have visually landed
}

const REEL_HEIGHT = 96;
const FILLER_COUNT = 300; // random cells scrolled through while spinning - the player decides how long that lasts
const LANDING_COUNT = 6; // extra cells right before the true symbol, for a multi-symbol descent
const TOTAL_COUNT = FILLER_COUNT + LANDING_COUNT + 1;
const SPIN_VELOCITY = 900; // px/sec while a reel is still "spinning"
const LANDING_DURATION_MS = 700; // how long a single reel's decelerating stop takes
const STOP_STAGGER_MS = [0, 200, 400]; // stagger between reels once Stop is clicked/triggered
// A short beat after the last reel settles before the win/lose verdict appears - it reads as
// "hold on... did I win?" instead of slamming in the instant the reel lands.
const POST_STOP_PAUSE_MS = 500;
// Backstop for a round that never lands (hung request, dropped response, anything else
// unforeseen) - forces the reels back to resting rather than leaving Stop stuck forever.
const WATCHDOG_MS = 25000;

interface SessionStats {
    rounds: number;
    wagered: number;
    won: number;
}

/**
 * The reusable slot-machine engine every machine page renders - required template for
 * every future machine (more denominations, more themes). Purely presentational +
 * animation state: knows nothing about a specific machine's odds, backend route, or
 * theme - it's just handed a symbol map, a list of bet amounts, and a `spin` function
 * that resolves with the real (server-decided) result.
 *
 * Each reel is a tall vertical strip scrolled behind a clipped viewport, symbols entering
 * from the top and exiting the bottom (real reel direction). Clicking the button (labeled
 * "Spin") starts every reel scrolling continuously and fires `spin()` in the background -
 * the reels keep spinning indefinitely, with no fixed duration, until the player clicks the
 * same button again (now labeled "Stop"). At that point each reel (staggered per
 * `STOP_STAGGER_MS`) hands off from the continuous scroll to a single decelerating CSS
 * transition landing on the true result symbol - if the network hasn't answered yet when
 * Stop is clicked, the reels keep spinning a little longer and the stop sequence begins the
 * instant the result arrives. If `spin()` itself throws, the reel motion is cancelled and
 * reset immediately rather than spinning forever with nothing to stop it.
 *
 * Every round (win, jackpot, or loss) shows a verdict banner that stays up until the next
 * spin or the modal closes, not on a timer - bigger celebration (glow + confetti) the bigger
 * the win. A running session tally (rounds/wagered/won/ratio) is always visible under the
 * button.
 */
export default function SlotMachine({
    symbols,
    betOptions,
    betLabels,
    defaultBet,
    reelCount = 3,
    jackpotPool,
    denominationLabel,
    oddsLabel,
    rtpLabel,
    isPending,
    spin,
    onResult,
}: SlotMachineProps) {
    const symbolKeys = Object.keys(symbols);
    const randomSymbol = () => symbolKeys[Math.floor(Math.random() * symbolKeys.length)];

    const [wager, setWager] = useState(defaultBet ?? betOptions[0]);
    const [spinning, setSpinning] = useState(false); // a round is active (Spin clicked, not yet fully landed)
    const [stopping, setStopping] = useState(false); // Stop has been triggered, reels decelerating
    const [reelStopped, setReelStopped] = useState<boolean[]>(Array.from({ length: reelCount }, () => true));
    const [reelBlurred, setReelBlurred] = useState<boolean[]>(Array.from({ length: reelCount }, () => false));
    const [strips, setStrips] = useState<string[][]>(Array.from({ length: reelCount }, () => [symbolKeys[0]]));
    const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
    const [stats, setStats] = useState<SessionStats>({ rounds: 0, wagered: 0, won: 0 });

    const stripRefs = useRef<(HTMLDivElement | null)[]>([]);
    const scrollRef = useRef<number[]>(Array.from({ length: reelCount }, () => 0));
    const stoppingRef = useRef<boolean[]>(Array.from({ length: reelCount }, () => true));
    const rafRef = useRef<number | null>(null);
    const lastFrameRef = useRef<number | null>(null);
    const stopTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
    const pendingResultRef = useRef<SlotSpinResult | null>(null); // set once spin() resolves
    const stopRequestedRef = useRef(false); // set once the player clicks Stop
    const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearWatchdog = () => {
        if (watchdogRef.current !== null) {
            clearTimeout(watchdogRef.current);
            watchdogRef.current = null;
        }
    };

    const clearTimers = () => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        lastFrameRef.current = null;
        stopTimeoutsRef.current.forEach(clearTimeout);
        stopTimeoutsRef.current = [];
        clearWatchdog();
    };

    useEffect(() => () => clearTimers(), []);

    const spinLoop = (timestamp: number) => {
        const last = lastFrameRef.current ?? timestamp;
        const dt = (timestamp - last) / 1000;
        lastFrameRef.current = timestamp;

        for (let i = 0; i < reelCount; i++) {
            if (stoppingRef.current[i]) {
                continue;
            }
            scrollRef.current[i] += SPIN_VELOCITY * dt;
            const el = stripRefs.current[i];
            if (el) {
                // Symbols enter from the top and exit the bottom (real reel direction) - see
                // stopReel's landing transform for the matching math.
                el.style.transform = `translateY(${scrollRef.current[i] - (TOTAL_COUNT - 1) * REEL_HEIGHT}px)`;
            }
        }

        if (stoppingRef.current.every(Boolean)) {
            rafRef.current = null;
            lastFrameRef.current = null;
            return;
        }
        rafRef.current = requestAnimationFrame(spinLoop);
    };

    // Hands one reel off from the continuous scroll to a decelerating stop on the true
    // symbol - only the head of its (already-rendered) strip changes content, so there's no
    // append/layout race to land on. The strip is scrolled so the reel counts DOWN toward
    // index 0 (symbols entering from the top, exiting the bottom, like a real reel) - so the
    // true symbol lives at index 0, with a few random cells just ahead of it for a multi-
    // symbol descent into place.
    const stopReel = (i: number, targetSymbol: string) => {
        stoppingRef.current[i] = true;

        setStrips((prev) => {
            const next = [...prev];
            const strip = [...next[i]];
            strip[0] = targetSymbol;
            for (let k = 1; k <= LANDING_COUNT; k++) {
                strip[k] = randomSymbol();
            }
            next[i] = strip;
            return next;
        });
        setReelBlurred((prev) => {
            const next = [...prev];
            next[i] = false;
            return next;
        });

        const el = stripRefs.current[i];
        if (el) {
            el.style.transition = `transform ${LANDING_DURATION_MS}ms cubic-bezier(0.12, 0.85, 0.28, 1)`;
            requestAnimationFrame(() => {
                el.style.transform = "translateY(0px)";
            });
        }

        const t = setTimeout(() => {
            setReelStopped((prev) => {
                const next = [...prev];
                next[i] = true;
                return next;
            });
            if (el) {
                el.style.transition = "";
            }
        }, LANDING_DURATION_MS);
        stopTimeoutsRef.current.push(t);
    };

    // Stagger every reel's decelerating stop, then (once the last one lands, plus a short
    // pause) reveal the verdict and update the session tally.
    const beginStopSequence = (result: SlotSpinResult) => {
        // A malformed payload must never be allowed to schedule a per-reel timeout that
        // throws deep inside a setTimeout callback - that would orphan just that one reel's
        // rAF loop (stoppingRef never flips) with nothing left to stop it. Bail out to the
        // same recovery path a network error already uses instead.
        if (!Array.isArray(result.reels) || result.reels.length !== reelCount || !Number.isFinite(result.payout)) {
            resetReelsAfterError();
            return;
        }
        setStopping(true);
        for (let i = 0; i < reelCount; i++) {
            const delay = STOP_STAGGER_MS[i] ?? STOP_STAGGER_MS[STOP_STAGGER_MS.length - 1] + (i - (STOP_STAGGER_MS.length - 1)) * 200;
            const t = setTimeout(() => stopReel(i, result.reels[i]), delay);
            stopTimeoutsRef.current.push(t);
        }
        const lastStagger = STOP_STAGGER_MS[reelCount - 1] ?? STOP_STAGGER_MS[STOP_STAGGER_MS.length - 1];
        const totalWait = lastStagger + LANDING_DURATION_MS + POST_STOP_PAUSE_MS;
        const t = setTimeout(() => {
            clearWatchdog();
            onResult?.(result);
            // Rounds/wagered already counted the instant Spin was clicked - only the payout
            // is new information at this point.
            setStats((prev) => ({ ...prev, won: prev.won + result.payout }));
            setRoundResult({ payout: result.payout, jackpot: !!result.jackpot, won: result.payout > 0 });
            setSpinning(false);
            setStopping(false);
            pendingResultRef.current = null;
            stopRequestedRef.current = false;
        }, totalWait);
        stopTimeoutsRef.current.push(t);
    };

    // Immediately halts the reel motion and puts the reels back in a resting state - used
    // when spin() itself fails, so a network/balance error can't leave the reels scrolling
    // forever with no way to stop them.
    const resetReelsAfterError = () => {
        clearTimers();
        stoppingRef.current = Array.from({ length: reelCount }, () => true);
        setReelBlurred(Array.from({ length: reelCount }, () => false));
        setReelStopped(Array.from({ length: reelCount }, () => true));
        for (const el of stripRefs.current) {
            if (el) {
                el.style.transition = "";
            }
        }
        pendingResultRef.current = null;
        stopRequestedRef.current = false;
        setSpinning(false);
        setStopping(false);
    };

    const canSpin = !isPending && !spinning && wager > 0;
    const canStop = spinning && !stopping;

    const handleSpin = async () => {
        if (!canSpin) {
            return;
        }
        clearTimers();
        setRoundResult(null);
        setSpinning(true);
        setStopping(false);
        pendingResultRef.current = null;
        stopRequestedRef.current = false;
        // Rounds/spent count the instant the player commits to a spin, not once the outcome
        // is known - only "won" updates later, when the round actually finishes.
        setStats((prev) => ({ ...prev, rounds: prev.rounds + 1, wagered: prev.wagered + wager }));
        setReelStopped(Array.from({ length: reelCount }, () => false));
        setReelBlurred(Array.from({ length: reelCount }, () => true));
        stoppingRef.current = Array.from({ length: reelCount }, () => false);
        scrollRef.current = Array.from({ length: reelCount }, () => 0);
        setStrips(Array.from({ length: reelCount }, () => Array.from({ length: TOTAL_COUNT }, () => randomSymbol())));
        lastFrameRef.current = null;
        rafRef.current = requestAnimationFrame(spinLoop);
        watchdogRef.current = setTimeout(() => {
            watchdogRef.current = null;
            resetReelsAfterError();
        }, WATCHDOG_MS);

        try {
            const result = await spin(wager);
            pendingResultRef.current = result;
            if (stopRequestedRef.current) {
                // The player already clicked Stop while this was in flight - land now.
                beginStopSequence(result);
            }
            // Otherwise keep spinning indefinitely - handleStopClick will land it later.
        } catch {
            // Nothing decided the reels' fate, so there's nothing to land on. Stop the
            // scroll instead of leaving it running with no way to end. The caller's own
            // mutation already surfaces the error (e.g. a toast).
            resetReelsAfterError();
        }
    };

    const handleStopClick = () => {
        if (!canStop) {
            return;
        }
        stopRequestedRef.current = true;
        setStopping(true); // acknowledge the click immediately even if still awaiting the result
        if (pendingResultRef.current) {
            beginStopSequence(pendingResultRef.current);
        }
        // Otherwise the reels keep scrolling until spin() resolves, which triggers the stop.
    };

    const confettiPieces = useMemo(() => (roundResult?.won ? generateConfetti(roundResult.jackpot) : []), [roundResult]);
    const netResult = stats.won - stats.wagered;
    const ratio = stats.wagered > 0 ? stats.won / stats.wagered : 0;

    return (
        <Box sx={{ maxWidth: 480, mx: "auto" }}>
            <Box
                sx={{
                    position: "relative",
                    borderRadius: 3,
                    p: 3,
                    background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.15) 100%)",
                    bgcolor: "background.paper",
                    border: "3px solid",
                    borderColor: "warning.main",
                    boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
                }}
            >
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 2 }}>
                    <Box sx={{ minWidth: 64, textAlign: "left" }}>
                        {jackpotPool !== undefined && (
                            <>
                                <Typography
                                    variant="overline"
                                    sx={{ letterSpacing: 1.5, color: "warning.main", fontWeight: 700, display: "block", lineHeight: 1.2, fontSize: "0.65rem" }}
                                >
                                    Jackpot
                                </Typography>
                                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: "warning.light", fontVariantNumeric: "tabular-nums" }}>
                                    {formatCheddar(jackpotPool)}
                                </Typography>
                            </>
                        )}
                    </Box>

                    <Box sx={{ minWidth: 64, textAlign: "right" }}>
                        {denominationLabel && (
                            <>
                                <Typography
                                    variant="overline"
                                    sx={{ letterSpacing: 1.5, color: "text.secondary", fontWeight: 700, display: "block", lineHeight: 1.2, fontSize: "0.65rem" }}
                                >
                                    Per Spin
                                </Typography>
                                <Typography variant="subtitle2" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                                    {formatCheddar(Number(denominationLabel))}
                                </Typography>
                            </>
                        )}
                    </Box>
                </Box>

                <Box
                    sx={{
                        position: "relative",
                        display: "flex",
                        gap: 1,
                        p: 1.5,
                        borderRadius: 2,
                        bgcolor: "#000",
                        border: "3px solid",
                        borderColor: "grey.800",
                        boxShadow: "inset 0 6px 18px rgba(0,0,0,0.75)",
                    }}
                >
                    {strips.map((strip, i) => (
                        <Box
                            key={i}
                            sx={{
                                position: "relative",
                                flex: 1,
                                height: REEL_HEIGHT,
                                overflow: "hidden",
                                borderRadius: 1,
                                bgcolor: "#0d0d0d",
                                border: "1px solid",
                                borderColor: reelStopped[i] ? "warning.main" : "grey.900",
                                transition: "border-color 0.3s",
                                ...(roundResult?.won
                                    ? roundResult.jackpot
                                        ? {
                                            animation: "reelGlowPulse 500ms ease-in-out infinite",
                                            "@keyframes reelGlowPulse": {
                                                "0%, 100%": { boxShadow: "0 0 0 4px rgba(255,215,0,0.95), 0 0 30px 10px rgba(255,215,0,0.7)" },
                                                "50%": { boxShadow: "0 0 0 8px rgba(255,215,0,1), 0 0 50px 18px rgba(255,215,0,0.95)" },
                                            },
                                        }
                                        : {
                                            animation: "reelGlowPulse 700ms ease-in-out infinite",
                                            "@keyframes reelGlowPulse": {
                                                "0%, 100%": { boxShadow: "0 0 0 3px rgba(255,215,0,0.85), 0 0 16px 4px rgba(255,215,0,0.5)" },
                                                "50%": { boxShadow: "0 0 0 5px rgba(255,215,0,1), 0 0 28px 10px rgba(255,215,0,0.85)" },
                                            },
                                        }
                                    : {}),
                            }}
                        >
                            <Box
                                ref={(el: HTMLDivElement | null) => {
                                    stripRefs.current[i] = el;
                                }}
                                sx={{
                                    position: "absolute",
                                    left: 0,
                                    right: 0,
                                    top: 0,
                                    filter: reelBlurred[i] ? "blur(3px)" : "blur(0px)",
                                    transition: "filter 0.3s",
                                }}
                            >
                                {strip.map((symbolKey, j) => (
                                    <Box
                                        key={j}
                                        sx={{
                                            height: REEL_HEIGHT,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: 48,
                                            lineHeight: 1,
                                        }}
                                    >
                                        {symbols[symbolKey] ?? "❔"}
                                    </Box>
                                ))}
                            </Box>
                        </Box>
                    ))}

                    {roundResult?.won && <ConfettiOverlay pieces={confettiPieces} />}

                    {roundResult && (
                        <Box
                            sx={{
                                position: "absolute",
                                inset: 0,
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 0.25,
                                zIndex: 1,
                                bgcolor: roundResult.jackpot ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.55)",
                                borderRadius: 1,
                                ...(roundResult.jackpot
                                    ? {
                                        animation: "jackpotBannerIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
                                        "@keyframes jackpotBannerIn": {
                                            "0%": { opacity: 0, transform: "scale(0.5)" },
                                            "60%": { opacity: 1, transform: "scale(1.12)" },
                                            "100%": { opacity: 1, transform: "scale(1)" },
                                        },
                                    }
                                    : {
                                        animation: "winBannerIn 0.3s ease-out",
                                        "@keyframes winBannerIn": {
                                            "0%": { opacity: 0, transform: "scale(0.8)" },
                                            "100%": { opacity: 1, transform: "scale(1)" },
                                        },
                                    }),
                            }}
                        >
                            {roundResult.won ? (
                                <>
                                    <Typography variant={roundResult.jackpot ? "h2" : "h4"} sx={{ lineHeight: 1 }}>
                                        {roundResult.jackpot ? "🎰" : "🎉"}
                                    </Typography>
                                    <Typography
                                        variant={roundResult.jackpot ? "h3" : "h6"}
                                        sx={{
                                            fontWeight: 800,
                                            color: roundResult.jackpot ? "warning.light" : "success.light",
                                            textShadow: roundResult.jackpot ? "0 0 18px rgba(255,193,7,0.8)" : "none",
                                        }}
                                    >
                                        {roundResult.jackpot ? "JACKPOT!" : "You won!"}
                                    </Typography>
                                    <Typography variant={roundResult.jackpot ? "h5" : "body1"} sx={{ fontWeight: 800, color: "warning.light" }}>
                                        +{formatCheddar(roundResult.payout)} cheddar
                                    </Typography>
                                </>
                            ) : (
                                <Typography variant="h6" sx={{ fontWeight: 700, color: "grey.400" }}>
                                    Lose
                                </Typography>
                            )}
                        </Box>
                    )}
                </Box>
                <Box sx={{ height: 3, bgcolor: "error.main", opacity: 0.5, borderRadius: 1, mt: 1.5 }} />
            </Box>

            <ToggleButtonGroup
                exclusive
                size="small"
                value={wager}
                onChange={(_, value) => value !== null && setWager(value)}
                sx={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 1, mt: 3, "& .MuiToggleButtonGroup-grouped": { border: "1px solid", borderColor: "divider", borderRadius: "4px !important" } }}
            >
                {betOptions.map((amount, idx) => (
                    <ToggleButton key={amount} value={amount} disabled={spinning || isPending} sx={{ px: 2, fontWeight: 700, textTransform: "none" }}>
                        {betLabels?.[idx] ?? formatCheddar(amount)}
                    </ToggleButton>
                ))}
            </ToggleButtonGroup>

            <Box sx={{ textAlign: "center", mt: 2.5 }}>
                {!spinning ? (
                    <Button
                        variant="contained"
                        color="error"
                        size="large"
                        onClick={handleSpin}
                        disabled={!canSpin}
                        sx={{ borderRadius: 999, px: 6, py: 1.25, fontWeight: 800, fontSize: "1.05rem" }}
                    >
                        {`Spin (${formatCheddar(wager)})`}
                    </Button>
                ) : (
                    <Button
                        variant="contained"
                        color="warning"
                        size="large"
                        onClick={handleStopClick}
                        disabled={!canStop}
                        sx={{ borderRadius: 999, px: 6, py: 1.25, fontWeight: 800, fontSize: "1.05rem" }}
                    >
                        {stopping ? "Stopping…" : "Stop"}
                    </Button>
                )}
            </Box>

            <Box
                sx={{
                    display: "flex",
                    justifyContent: "center",
                    flexWrap: "wrap",
                    gap: 2.5,
                    mt: 3,
                    px: 2,
                    py: 1.25,
                    borderRadius: 2,
                    bgcolor: "action.hover",
                }}
            >
                <Box sx={{ textAlign: "center" }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.3 }}>
                        Rounds
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                        {stats.rounds}
                    </Typography>
                </Box>
                <Box sx={{ textAlign: "center" }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.3 }}>
                        Spent
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                        {formatCheddar(stats.wagered)}
                    </Typography>
                </Box>
                <Box sx={{ textAlign: "center" }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.3 }}>
                        Won / Lost
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: netResult >= 0 ? "success.main" : "error.main" }}>
                        {netResult >= 0 ? "+" : "-"}
                        {formatCheddar(Math.abs(netResult))}
                    </Typography>
                </Box>
                <Box sx={{ textAlign: "center" }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.3 }}>
                        Ratio
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                        {ratio.toFixed(2)}x
                    </Typography>
                </Box>
            </Box>
        </Box>
    );
}
