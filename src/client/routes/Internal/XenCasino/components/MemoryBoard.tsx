import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Typography, ToggleButtonGroup, ToggleButton } from "@mui/material";
import { formatCheddar } from "../utils/currency";
import { generateConfetti, ConfettiOverlay, RoundResultBanner, type RoundResult } from "./slotEffects";

const GRID_SIZE = 5;
const CELL_COUNT = GRID_SIZE * GRID_SIZE; // 25
const PICK_COUNT = 2;
const MAX_REVEALS = 3;
const NO_MATCH_FLIP_BACK_MS = 350;

export interface MemorySymbolGroup {
    symbol: string;
    count: number;
}

export interface MemoryStartResult {
    roundId: string;
    balance: string;
}

export interface MemoryRevealResult {
    picks: { position: number; symbol: string }[];
    matched: boolean;
    revealCount: number;
    matchedPairs: number;
    maxReveals: number;
    isFinal: boolean;
    finalPayout: number;
    balance?: string;
}

export interface MemoryBoardProps {
    symbolGroups: MemorySymbolGroup[];
    symbols: Record<string, string>;
    betOptions: number[];
    betLabels?: string[];
    defaultBet?: number;
    isPending: boolean;
    start: (wager: number) => Promise<MemoryStartResult>;
    reveal: (params: { picks: number[]; revealIndex: number }) => Promise<MemoryRevealResult>;
    onResult?: (payout: number, matchedPairs: number) => void;
}

// Timing beats: a cosmetic shuffle flourish after paying, then up to 3 rounds where the
// player picks 2 cards. If matched, cards stay face-up and are cleared. If not, cards show
// briefly then flip back. After the 3rd reveal (or if no pairs remain), the round resolves.
const SHUFFLE_MS = 1550;
const REVEAL_FLIP_MS = 450;
const POST_REVEAL_PAUSE_MS = 500;

// One card's shuffle "flight path" - several waypoints it darts through (as % of its own
// size, so it scales with layout) before landing back home, not a single in-place wobble.
// 25 of these running at once with independent random directions/timing is what actually
// reads as real mixing rather than a shimmer.
interface ShufflePath {
    delay: number;
    dur: number;
    waypoints: { dx: number; dy: number; rot: number; scale: number }[];
}

function buildShufflePaths(): ShufflePath[] {
    return Array.from({ length: CELL_COUNT }, () => ({
        delay: Math.random() * 250,
        dur: 950 + Math.random() * 350,
        waypoints: Array.from({ length: 3 }, () => ({
            dx: (Math.random() - 0.5) * 260,
            dy: (Math.random() - 0.5) * 260,
            rot: (Math.random() - 0.5) * 55,
            scale: 0.82 + Math.random() * 0.28,
        })),
    }));
}

function shuffleKeyframes(path: ShufflePath): Record<string, { transform: string }> {
    const stops = ["25%", "50%", "75%"];
    const kf: Record<string, { transform: string }> = {
        "0%": { transform: "translate(0%, 0%) rotate(0deg) scale(1)" },
        "100%": { transform: "translate(0%, 0%) rotate(0deg) scale(1)" },
    };
    path.waypoints.forEach((w, i) => {
        kf[stops[i]] = { transform: `translate(${w.dx}%, ${w.dy}%) rotate(${w.rot}deg) scale(${w.scale})` };
    });
    return kf;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

type Phase = "idle" | "starting" | "shuffling" | "picking" | "revealingPair" | "done";

interface SessionStats {
    rounds: number;
    wagered: number;
    won: number;
}

function buildPeekDeck(symbolGroups: MemorySymbolGroup[]): string[] {
    const deck = symbolGroups.flatMap((g) => Array.from({ length: g.count }, () => g.symbol));
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

/**
 * Memory's card-grid engine — classic match-two mechanic. The player pays, sees a peek of
 * all 25 cards, watches a shuffle, then gets up to 3 attempts: each attempt they pick 2
 * face-down cards. If they match, the cards stay face-up with a green glow and are removed
 * from play. If not, they show briefly then flip back. After 3 attempts, the round resolves
 * with a payout based on how many pairs were matched.
 */
export default function MemoryBoard({ symbolGroups, symbols, betOptions, betLabels, defaultBet, isPending, start, reveal, onResult }: MemoryBoardProps) {
    const [wager, setWager] = useState(defaultBet ?? betOptions[0]);
    const [phase, setPhase] = useState<Phase>("idle");
    const [peekDeck, setPeekDeck] = useState<string[]>(() => buildPeekDeck(symbolGroups));
    const [selected, setSelected] = useState<Set<number>>(new Set());
    // Positions whose symbol is currently visible (peek, revealed pair, or matched+cleared).
    const [visibleSymbols, setVisibleSymbols] = useState<Map<number, string>>(new Map());
    // Positions permanently cleared (matched pairs).
    const [clearedPositions, setClearedPositions] = useState<Set<number>>(new Set());
    const [revealIndex, setRevealIndex] = useState(0);
    const [matchedPairs, setMatchedPairs] = useState(0);
    const [finalPayout, setFinalPayout] = useState(0);
    const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
    const [stats, setStats] = useState<SessionStats>({ rounds: 0, wagered: 0, won: 0 });
    const [shuffleSeed, setShuffleSeed] = useState(0);

    const mountedRef = useRef(true);
    useEffect(() => () => { mountedRef.current = false; }, []);

    const shufflePaths = useMemo(() => buildShufflePaths(), [shuffleSeed]);

    const canStart = phase === "idle" && !isPending && wager > 0;

    const handleStart = async () => {
        if (!canStart) return;
        setPhase("starting");
        setRoundResult(null);
        setFinalPayout(0);
        setSelected(new Set());
        setVisibleSymbols(new Map());
        setClearedPositions(new Set());
        setRevealIndex(0);
        setMatchedPairs(0);
        setStats((prev) => ({ ...prev, rounds: prev.rounds + 1, wagered: prev.wagered + wager }));

        try {
            await start(wager);
            if (!mountedRef.current) return;
            setShuffleSeed((s) => s + 1);
            setPhase("shuffling");
            await sleep(SHUFFLE_MS);
            if (!mountedRef.current) return;
            setPhase("picking");
        } catch {
            if (mountedRef.current) setPhase("idle");
        }
    };

    const toggleCard = (position: number) => {
        if (phase !== "picking" || clearedPositions.has(position)) return;
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(position)) {
                next.delete(position);
            } else if (next.size < PICK_COUNT) {
                next.add(position);
            }
            return next;
        });
    };

    // Auto-reveal as soon as both cards are picked — no manual "Flip" button needed.
    useEffect(() => {
        if (phase === "picking" && selected.size === PICK_COUNT) {
            handleReveal();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected, phase]);

    const handleReveal = async () => {
        if (phase !== "picking" || selected.size !== PICK_COUNT) return;
        const picks = [...selected];
        const currentIndex = revealIndex;
        setPhase("revealingPair");

        try {
            const res = await reveal({ picks, revealIndex: currentIndex });
            if (!mountedRef.current) return;

            // Show both cards.
            const newVisible = new Map(visibleSymbols);
            for (const p of res.picks) {
                newVisible.set(p.position, p.symbol);
            }
            setVisibleSymbols(newVisible);
            await sleep(REVEAL_FLIP_MS);
            if (!mountedRef.current) return;

            if (res.matched) {
                // Match — cards stay face-up and become cleared.
                setClearedPositions((prev) => {
                    const next = new Set(prev);
                    for (const p of res.picks) next.add(p.position);
                    return next;
                });
                setMatchedPairs(res.matchedPairs);
            } else {
                // No match — let the player see the cards briefly, then flip them back.
                await sleep(NO_MATCH_FLIP_BACK_MS);
                if (!mountedRef.current) return;
                // Remove these positions from visible symbols (they flip back).
                setVisibleSymbols((prev) => {
                    const next = new Map(prev);
                    for (const p of res.picks) next.delete(p.position);
                    return next;
                });
            }
            await sleep(POST_REVEAL_PAUSE_MS);
            if (!mountedRef.current) return;

            if (res.isFinal) {
                setFinalPayout(res.finalPayout);
                setMatchedPairs(res.matchedPairs);
                onResult?.(res.finalPayout, res.matchedPairs);
                setStats((prev) => ({ ...prev, won: prev.won + res.finalPayout }));
                setRoundResult({
                    payout: res.finalPayout,
                    jackpot: res.matchedPairs >= 3,
                    won: res.finalPayout > 0,
                });
                setPhase("done");
            } else {
                setRevealIndex(res.revealCount);
                setMatchedPairs(res.matchedPairs);
                setSelected(new Set());
                setPhase("picking");
            }
        } catch {
            if (mountedRef.current) setPhase("picking");
        }
    };

    const handlePlayAgain = () => {
        setPeekDeck(buildPeekDeck(symbolGroups));
        setPhase("idle");
        setSelected(new Set());
        setVisibleSymbols(new Map());
        setClearedPositions(new Set());
        setRevealIndex(0);
        setMatchedPairs(0);
        setFinalPayout(0);
        setRoundResult(null);
    };

    const confettiPieces = useMemo(() => (roundResult?.won ? generateConfetti(roundResult.jackpot) : []), [roundResult]);
    const netResult = stats.won - stats.wagered;
    const ratio = stats.wagered > 0 ? stats.won / stats.wagered : 0;
    const roundLabel = revealIndex < MAX_REVEALS ? `${revealIndex + 1}/${MAX_REVEALS}` : `${MAX_REVEALS}/${MAX_REVEALS}`;

    return (
        <Box sx={{ maxWidth: 480, mx: "auto" }}>
            <Box
                sx={{
                    position: "relative",
                    borderRadius: 3,
                    p: 2.5,
                    background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.15) 100%)",
                    bgcolor: "background.paper",
                    border: "3px solid",
                    borderColor: "warning.main",
                    boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
                }}
            >
                <Box
                    sx={{
                        position: "relative",
                        display: "grid",
                        gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
                        gap: 1,
                        p: 1.5,
                        borderRadius: 2,
                        bgcolor: "#000",
                        border: "3px solid",
                        borderColor: "grey.800",
                        boxShadow: "inset 0 6px 18px rgba(0,0,0,0.75)",
                    }}
                >
                    {Array.from({ length: CELL_COUNT }, (_, position) => {
                        const isCleared = clearedPositions.has(position);
                        const faceUp = phase === "idle" ? true : isCleared || visibleSymbols.has(position);
                        const symbol = phase === "idle" ? peekDeck[position] : visibleSymbols.get(position);
                        const isSelected = selected.has(position);
                        const isShuffling = phase === "shuffling";
                        const isClickable = phase === "picking" && !isCleared && (isSelected || selected.size < PICK_COUNT);
                        const path = shufflePaths[position];

                        return (
                            <Box
                                key={position}
                                onClick={() => toggleCard(position)}
                                sx={{
                                    aspectRatio: "1",
                                    perspective: 600,
                                    cursor: isClickable ? "pointer" : "default",
                                    opacity: isCleared ? 0.85 : 1,
                                    ...(isShuffling && {
                                        position: "relative",
                                        zIndex: 1,
                                        animation: `memoryShuffleMove ${path.dur}ms ${path.delay}ms ease-in-out`,
                                        "@keyframes memoryShuffleMove": shuffleKeyframes(path),
                                    }),
                                }}
                            >
                                <Box
                                    sx={{
                                        position: "relative",
                                        width: "100%",
                                        height: "100%",
                                        transformStyle: "preserve-3d",
                                        transition: "transform 0.45s cubic-bezier(0.4, 0.2, 0.2, 1)",
                                        transform: faceUp ? "rotateY(180deg)" : "rotateY(0deg)",
                                    }}
                                >
                                    <Box
                                        sx={{
                                            position: "absolute",
                                            inset: 0,
                                            backfaceVisibility: "hidden",
                                            borderRadius: 1,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: 20,
                                            bgcolor: isSelected ? "rgba(255,193,7,0.18)" : "#0d0d0d",
                                            border: "1px solid",
                                            borderColor: isSelected ? "warning.main" : "grey.800",
                                            boxShadow: isSelected ? "0 0 10px 1px rgba(255,193,7,0.6)" : "none",
                                            color: "grey.700",
                                        }}
                                    >
                                        ?
                                    </Box>
                                    <Box
                                        sx={{
                                            position: "absolute",
                                            inset: 0,
                                            backfaceVisibility: "hidden",
                                            transform: "rotateY(180deg)",
                                            borderRadius: 1,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: phase === "idle" ? 20 : 26,
                                            bgcolor: isCleared ? "rgba(76,175,80,0.22)" : "grey.900",
                                            border: "1px solid",
                                            borderColor: isCleared ? "success.main" : "grey.700",
                                            boxShadow: isCleared ? "0 0 12px 2px rgba(76,175,80,0.6)" : "none",
                                            opacity: phase === "idle" ? 0.85 : 1,
                                        }}
                                    >
                                        {symbol ? symbols[symbol] ?? "❔" : ""}
                                    </Box>
                                </Box>
                            </Box>
                        );
                    })}

                    {roundResult?.won && <ConfettiOverlay pieces={confettiPieces} />}
                    {roundResult && <RoundResultBanner roundResult={roundResult} />}
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
                    <ToggleButton key={amount} value={amount} disabled={phase !== "idle" || isPending} sx={{ px: 2, fontWeight: 700, textTransform: "none" }}>
                        {betLabels?.[idx] ?? formatCheddar(amount)}
                    </ToggleButton>
                ))}
            </ToggleButtonGroup>

            <Box sx={{ textAlign: "center", mt: 2.5, minHeight: 56, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {phase === "idle" && (
                    <Button
                        variant="contained"
                        color="error"
                        size="large"
                        onClick={handleStart}
                        disabled={!canStart}
                        sx={{ borderRadius: 999, px: 6, py: 1.25, fontWeight: 800, fontSize: "1.05rem" }}
                    >
                        {`Start (${formatCheddar(wager)})`}
                    </Button>
                )}
                {(phase === "starting" || phase === "shuffling") && (
                    <Button variant="contained" color="warning" size="large" disabled sx={{ borderRadius: 999, px: 6, py: 1.25, fontWeight: 800, fontSize: "1.05rem" }}>
                        {phase === "starting" ? "Dealing…" : "Shuffling…"}
                    </Button>
                )}
                {phase === "picking" && (
                    <Box sx={{ py: 1.25, lineHeight: 1 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
                            Pick 2 cards ({roundLabel})
                        </Typography>
                    </Box>
                )}
                {phase === "revealingPair" && (
                    <Button variant="contained" color="warning" size="large" disabled sx={{ borderRadius: 999, px: 6, py: 1.25, fontWeight: 800, fontSize: "1.05rem" }}>
                        Flipping…
                    </Button>
                )}
                {phase === "done" && (
                    <Button
                        variant="contained"
                        color="error"
                        size="large"
                        onClick={handlePlayAgain}
                        sx={{ borderRadius: 999, px: 6, py: 1.25, fontWeight: 800, fontSize: "1.05rem" }}
                    >
                        Play Again
                    </Button>
                )}
            </Box>
            <Typography
                variant="body2"
                color="text.secondary"
                sx={{ textAlign: "center", mt: 1, visibility: phase === "picking" ? "visible" : "hidden" }}
            >
                Pick 2 cards — matches stay and are cleared. {MAX_REVEALS} tries total.
                {matchedPairs > 0 && ` Matches so far: ${matchedPairs}.`}
            </Typography>

            {/* Session stats — same across all games */}
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
