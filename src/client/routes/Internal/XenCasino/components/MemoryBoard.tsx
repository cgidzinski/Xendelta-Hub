import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Typography, ToggleButtonGroup, ToggleButton } from "@mui/material";
import { formatCheddar } from "../utils/currency";
import { generateConfetti, ConfettiOverlay, RoundResultBanner, type RoundResult } from "./slotEffects";

const GRID_SIZE = 5;
const CELL_COUNT = GRID_SIZE * GRID_SIZE; // 25
const PICK_COUNT = 4;

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
    matchCount: number;
    payout: number;
    balance?: string;
}

export interface MemoryBoardProps {
    symbolGroups: MemorySymbolGroup[]; // the fixed deck composition - drives the peek flourish only, real per-round assignment is secret server-side
    symbols: Record<string, string>; // symbol key -> emoji
    betOptions: number[];
    betLabels?: string[];
    defaultBet?: number;
    isPending: boolean; // a start()/reveal() request is in flight
    start: (wager: number) => Promise<MemoryStartResult>;
    reveal: (picks: number[]) => Promise<MemoryRevealResult>;
    onResult?: (result: MemoryRevealResult) => void;
}

// Every timing beat: a cosmetic shuffle flourish right after paying (the real per-round grid
// is never sent to the client until reveal() resolves - see memory.ts's file header - so
// this can only ever be a flourish, not a literal re-position of known data), then the
// player picks 4 of the 25 blind cards, then a staggered flip reveals exactly those 4.
const SHUFFLE_MS = 1550;
const REVEAL_FLIP_MS = 450;
const REVEAL_STAGGER_MS = 140;
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

type Phase = "idle" | "starting" | "shuffling" | "picking" | "revealing" | "done";

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
 * Memory's card-grid engine - a sibling to SlotMachine/SpinmaniaGrid/ScratchCard, not a
 * variant of any of them, and the first of these engines built around a genuinely two-step
 * round: start() pays and privately commits the server's secret grid, reveal() is the
 * player's real choice of which 4 of the 25 cards to flip. The idle grid shows a locally-
 * shuffled arrangement of the *public, fixed* deck composition (symbolGroups) - never real
 * per-round data, since the server never sends that before reveal() (see memory.ts). The
 * "shuffle" after Start is therefore always cosmetic, not a literal re-position of anything
 * the player just saw.
 */
export default function MemoryBoard({ symbolGroups, symbols, betOptions, betLabels, defaultBet, isPending, start, reveal, onResult }: MemoryBoardProps) {
    const [wager, setWager] = useState(defaultBet ?? betOptions[0]);
    const [phase, setPhase] = useState<Phase>("idle");
    const [peekDeck, setPeekDeck] = useState<string[]>(() => buildPeekDeck(symbolGroups));
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [revealedSymbols, setRevealedSymbols] = useState<Map<number, string>>(new Map());
    const [result, setResult] = useState<MemoryRevealResult | null>(null);
    const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
    const [stats, setStats] = useState<SessionStats>({ rounds: 0, wagered: 0, won: 0 });
    const [shuffleSeed, setShuffleSeed] = useState(0);

    const mountedRef = useRef(true);
    useEffect(() => () => { mountedRef.current = false; }, []);

    const shufflePaths = useMemo(() => buildShufflePaths(), [shuffleSeed]);

    const matchedSymbolCounts = useMemo(() => {
        const counts = new Map<string, number>();
        for (const symbol of revealedSymbols.values()) counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
        return counts;
    }, [revealedSymbols]);

    const canStart = phase === "idle" && !isPending && wager > 0;

    const handleStart = async () => {
        if (!canStart) return;
        setPhase("starting");
        setRoundResult(null);
        setResult(null);
        setSelected(new Set());
        setRevealedSymbols(new Map());
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
        if (phase !== "picking") return;
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

    const handleReveal = async () => {
        if (phase !== "picking" || selected.size !== PICK_COUNT) return;
        const picks = [...selected];
        setPhase("revealing");

        try {
            const res = await reveal(picks);
            if (!mountedRef.current) return;
            setResult(res);

            for (let i = 0; i < res.picks.length; i++) {
                await sleep(i === 0 ? REVEAL_FLIP_MS : REVEAL_STAGGER_MS);
                if (!mountedRef.current) return;
                setRevealedSymbols((prev) => {
                    const next = new Map(prev);
                    next.set(res.picks[i].position, res.picks[i].symbol);
                    return next;
                });
            }
            await sleep(REVEAL_FLIP_MS + POST_REVEAL_PAUSE_MS);
            if (!mountedRef.current) return;

            onResult?.(res);
            setStats((prev) => ({ ...prev, won: prev.won + res.payout }));
            setRoundResult({ payout: res.payout, jackpot: res.matchCount === 3, won: res.payout > 0 });
            setPhase("done");
        } catch {
            if (mountedRef.current) setPhase("picking");
        }
    };

    const handlePlayAgain = () => {
        setPeekDeck(buildPeekDeck(symbolGroups));
        setPhase("idle");
        setSelected(new Set());
        setRevealedSymbols(new Map());
        setResult(null);
        setRoundResult(null);
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
                        const faceUp = phase === "idle" ? true : revealedSymbols.has(position);
                        const symbol = phase === "idle" ? peekDeck[position] : revealedSymbols.get(position);
                        const isSelected = selected.has(position);
                        const isMatched = !!symbol && (matchedSymbolCounts.get(symbol) ?? 0) >= 2;
                        const isShuffling = phase === "shuffling";
                        const isClickable = phase === "picking" && (isSelected || selected.size < PICK_COUNT);
                        const path = shufflePaths[position];

                        return (
                            <Box
                                key={position}
                                onClick={() => toggleCard(position)}
                                sx={{
                                    aspectRatio: "1",
                                    perspective: 600,
                                    cursor: isClickable ? "pointer" : "default",
                                    // Moves the whole card around during the shuffle - a separate
                                    // element/property from the flip below, so the two animations
                                    // (position vs. face) never fight over `transform`.
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
                                            bgcolor: isMatched ? "rgba(76,175,80,0.22)" : "grey.900",
                                            border: "1px solid",
                                            borderColor: isMatched ? "success.main" : "grey.700",
                                            boxShadow: isMatched ? "0 0 12px 2px rgba(76,175,80,0.6)" : "none",
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

            <Box sx={{ textAlign: "center", mt: 2.5 }}>
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
                    <Button
                        variant="contained"
                        color="warning"
                        size="large"
                        onClick={handleReveal}
                        disabled={selected.size !== PICK_COUNT}
                        sx={{ borderRadius: 999, px: 6, py: 1.25, fontWeight: 800, fontSize: "1.05rem" }}
                    >
                        {`Flip ${selected.size}/${PICK_COUNT} Cards`}
                    </Button>
                )}
                {phase === "revealing" && (
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
                Pick {PICK_COUNT} cards to flip - matches among them decide the prize.
            </Typography>

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
