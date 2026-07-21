import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Typography, ToggleButtonGroup, ToggleButton } from "@mui/material";
import { formatCheddar } from "../utils/currency";
import { generateConfetti, ConfettiOverlay, RoundResultBanner, type RoundResult } from "./slotEffects";

const JACKPOT_ITEM = "JACKPOT_ITEM";
const GRID_COLS = 5;
const GRID_ROWS = 3;

export interface SpinmaniaWin {
    symbol: string;
    runLength: number;
    ways: number;
    multiplier: number;
    payout: number;
    cells: { col: number; row: number }[];
}

export interface SpinmaniaCascadeStep {
    grid: string[][]; // column-major, grid[col][row] - matches the server's Grid shape exactly
    wins: SpinmaniaWin[];
    stepMultiplier: number;
    stepPayout: number;
}

export interface SpinmaniaSpinResult {
    initialGrid: string[][];
    steps: SpinmaniaCascadeStep[];
    finalGrid: string[][];
    jackpot?: boolean;
    payout: number;
    balance: string;
}

export interface SpinmaniaGridProps {
    symbols: Record<string, string>; // symbol key -> emoji, plus "BLANK" for the non-paying filler
    betOptions: number[];
    betLabels?: string[];
    defaultBet?: number;
    jackpotPool?: number;
    denominationLabel?: string;
    oddsLabel?: string;
    rtpLabel?: string;
    isPending: boolean;
    spin: (wager: number) => Promise<SpinmaniaSpinResult>;
    onResult?: (result: SpinmaniaSpinResult) => void;
}

// Every timing beat of one cascade step, in order: highlight the matched cells, clear them,
// then let the dropped-in replacement grid settle before either the next step or the verdict.
const HIGHLIGHT_MS = 650;
const CLEAR_MS = 300;
const DROP_MS = 450;
const DROP_ANIM_MS = 320; // drop-in keyframe duration for refilled cells; stays inside DROP_MS's pause
const POST_SEQUENCE_PAUSE_MS = 300;
// Reel-scroll animation constants — mirrors SlotMachine's continuous reel model.
const CELL_HEIGHT = 96;
const FILLER_COUNT = 300;
const LANDING_COUNT = 6;
const TOTAL_COUNT = FILLER_COUNT + LANDING_COUNT + GRID_ROWS;
const SPIN_VELOCITY = 900;
const LANDING_DURATION_MS = 700;
const STOP_STAGGER_MS = [0, 180, 360, 540, 720];
const POST_STOP_PAUSE_MS = 150;
// Backstop for a sequence that never completes (shouldn't happen - every step comes from
// data already in hand - but mirrors SlotMachine's own watchdog as a defensive floor).
const WATCHDOG_MS = 25000;

function cellKey(col: number, row: number): string {
    return `${col}-${row}`;
}

interface SessionStats {
    rounds: number;
    wagered: number;
    won: number;
}

/**
 * SpinMania's own 5x3 all-ways-pay grid with cascading wins - a sibling to SlotMachine, not
 * a variant of it (see spinmaniaGrid.ts's server-side file header for why this is a
 * genuinely different game shape). The entire outcome (initial grid, every cascade step, the
 * resting grid, the payout) is already fully decided by the server by the time `spin()`
 * resolves, so this component's animation is a bounded, linear player over that trace - no
 * indefinite spin/stop/watchdog state machine is needed the way SlotMachine's continuous-
 * reel model requires.
 *
 * Visually it reuses SlotMachine's exact reel-strip model: each column is one clipped
 * viewport with a scrollable strip inside it, used for spin, landing, AND the resting/
 * cascade grid - there's no second "grid view" that gets swapped in, so nothing ever jumps
 * shape. Once a spin lands, cascade steps just mutate the same strip's top GRID_ROWS cells
 * in place (highlight -> clear -> drop-in) instead of handing off to a different element.
 */
export default function SpinmaniaGrid({ symbols, betOptions, betLabels, defaultBet, jackpotPool, denominationLabel, oddsLabel, rtpLabel, isPending, spin, onResult }: SpinmaniaGridProps) {
    const symbolKeys = Object.keys(symbols);
    const randomSymbol = () => symbolKeys[Math.floor(Math.random() * symbolKeys.length)];

    const [wager, setWager] = useState(defaultBet ?? betOptions[0]);
    const [spinning, setSpinning] = useState(false);
    const [stopping, setStopping] = useState(false);
    const [displayGrid, setDisplayGrid] = useState<string[][]>(() => Array.from({ length: GRID_COLS }, () => Array.from({ length: GRID_ROWS }, () => symbolKeys[0])));
    const [highlighted, setHighlighted] = useState<Set<string>>(new Set());
    const [clearing, setClearing] = useState<Set<string>>(new Set());
    const [entering, setEntering] = useState<Set<string>>(new Set());
    const [cascadeMultiplier, setCascadeMultiplier] = useState<number | null>(null);
    const [roundResult, setRoundResult] = useState<RoundResult | null>(null);
    const [stats, setStats] = useState<SessionStats>({ rounds: 0, wagered: 0, won: 0 });
    const [strips, setStrips] = useState<string[][]>(Array.from({ length: GRID_COLS }, () => [symbolKeys[0]]));
    const [columnStopped, setColumnStopped] = useState<boolean[]>(Array.from({ length: GRID_COLS }, () => true));

    const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
    const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const stripRefs = useRef<(HTMLDivElement | null)[]>([]);
    const scrollRef = useRef<number[]>(Array.from({ length: GRID_COLS }, () => 0));
    const stoppingRef = useRef<boolean[]>(Array.from({ length: GRID_COLS }, () => true));
    const rafRef = useRef<number | null>(null);
    const lastFrameRef = useRef<number | null>(null);
    const stopTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
    const pendingResultRef = useRef<SpinmaniaSpinResult | null>(null);
    const stopRequestedRef = useRef(false);

    const clearAllTimers = () => {
        timeoutsRef.current.forEach(clearTimeout); timeoutsRef.current = [];
        if (watchdogRef.current !== null) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
        if (rafRef.current !== null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
        lastFrameRef.current = null;
        stopTimeoutsRef.current.forEach(clearTimeout); stopTimeoutsRef.current = [];
    };

    useEffect(() => () => clearAllTimers(), []);

    const schedule = (fn: () => void, delay: number) => { const t = setTimeout(fn, delay); timeoutsRef.current.push(t); };

    // ---- Reel-scroll animation (mirrors SlotMachine) ----
    const spinLoop = (timestamp: number) => {
        const last = lastFrameRef.current ?? timestamp;
        const dt = (timestamp - last) / 1000;
        lastFrameRef.current = timestamp;
        for (let i = 0; i < GRID_COLS; i++) {
            if (stoppingRef.current[i]) continue;
            scrollRef.current[i] += SPIN_VELOCITY * dt;
            const el = stripRefs.current[i];
            if (el) el.style.transform = `translateY(${scrollRef.current[i] - (TOTAL_COUNT - GRID_ROWS) * CELL_HEIGHT}px)`;
        }
        if (stoppingRef.current.every(Boolean)) { rafRef.current = null; lastFrameRef.current = null; return; }
        rafRef.current = requestAnimationFrame(spinLoop);
    };

    const stopColumn = (col: number, targetSymbols: string[]) => {
        stoppingRef.current[col] = true;
        setStrips((prev) => {
            const next = [...prev]; const strip = [...next[col]];
            strip[0] = targetSymbols[0]; strip[1] = targetSymbols[1]; strip[2] = targetSymbols[2];
            for (let k = GRID_ROWS; k < GRID_ROWS + LANDING_COUNT; k++) strip[k] = randomSymbol();
            next[col] = strip; return next;
        });
        const el = stripRefs.current[col];
        if (el) {
            el.style.transition = `transform ${LANDING_DURATION_MS}ms cubic-bezier(0.12, 0.85, 0.28, 1)`;
            requestAnimationFrame(() => { el.style.transform = "translateY(0px)"; });
        }
        const t = setTimeout(() => {
            setColumnStopped((prev) => { const n = [...prev]; n[col] = true; return n; });
            if (el) el.style.transition = "";
        }, LANDING_DURATION_MS);
        stopTimeoutsRef.current.push(t);
    };

    const beginStopSequence = (result: SpinmaniaSpinResult) => {
        if (!Array.isArray(result.initialGrid) || result.initialGrid.length !== GRID_COLS) { resetAfterError(); return; }
        setStopping(true);
        for (let col = 0; col < GRID_COLS; col++) {
            const t = setTimeout(() => stopColumn(col, result.initialGrid[col]), STOP_STAGGER_MS[col] ?? 0);
            stopTimeoutsRef.current.push(t);
        }
        const lastStagger = STOP_STAGGER_MS[GRID_COLS - 1] ?? 0;
        const totalWait = lastStagger + LANDING_DURATION_MS + POST_STOP_PAUSE_MS;
        const t = setTimeout(() => {
            if (watchdogRef.current !== null) { clearTimeout(watchdogRef.current); watchdogRef.current = null; }
            playSequence(result);
        }, totalWait);
        stopTimeoutsRef.current.push(t);
    };

    const resetAfterError = () => {
        clearAllTimers();
        stoppingRef.current = Array.from({ length: GRID_COLS }, () => true);
        setColumnStopped(Array.from({ length: GRID_COLS }, () => true));
        for (const el of stripRefs.current) { if (el) el.style.transition = ""; }
        pendingResultRef.current = null; stopRequestedRef.current = false;
        setHighlighted(new Set()); setClearing(new Set()); setCascadeMultiplier(null);
        setSpinning(false); setStopping(false);
    };

    const finishRound = (payout: number, jackpot: boolean) => {
        clearAllTimers();
        setHighlighted(new Set()); setClearing(new Set()); setCascadeMultiplier(null);
        setStats((prev) => ({ ...prev, won: prev.won + payout }));
        setRoundResult({ payout, jackpot, won: payout > 0 });
        pendingResultRef.current = null; stopRequestedRef.current = false;
        setSpinning(false); setStopping(false);
    };

    // ---- Cascade reveal (unchanged from original) ----
    const playStep = (result: SpinmaniaSpinResult, stepIndex: number) => {
        const step = result.steps[stepIndex];
        const cells = new Set(step.wins.flatMap((win) => win.cells.map((c) => cellKey(c.col, c.row))));
        setHighlighted(cells); setCascadeMultiplier(step.stepMultiplier);
        schedule(() => {
            // Stop the glow the instant the clear/shrink starts - keeping both active at once
            // read as a flicker (cell pulsing gold while also shrinking away).
            setClearing(cells); setHighlighted(new Set());
            schedule(() => {
                const nextGrid = stepIndex + 1 < result.steps.length ? result.steps[stepIndex + 1].grid : result.finalGrid;
                setDisplayGrid(nextGrid); setHighlighted(new Set()); setClearing(new Set());
                schedule(() => {
                    if (stepIndex + 1 < result.steps.length) { playStep(result, stepIndex + 1); }
                    else schedule(() => { onResult?.(result); finishRound(result.payout, !!result.jackpot); }, POST_SEQUENCE_PAUSE_MS);
                }, DROP_MS);
            }, CLEAR_MS);
        }, HIGHLIGHT_MS);
    };

    const playJackpot = (result: SpinmaniaSpinResult) => {
        const cells = new Set<string>();
        result.initialGrid.forEach((column, col) => { column.forEach((symbol, row) => { if (symbol === JACKPOT_ITEM) cells.add(cellKey(col, row)); }); });
        setHighlighted(cells);
        schedule(() => { onResult?.(result); finishRound(result.payout, true); }, HIGHLIGHT_MS);
    };

    const playSequence = (result: SpinmaniaSpinResult) => {
        setDisplayGrid(result.initialGrid);
        if (result.jackpot) playJackpot(result);
        else if (result.steps.length > 0) playStep(result, 0);
        else { onResult?.(result); finishRound(result.payout, false); }
    };

    // ---- Spin / Stop handlers (mirrors SlotMachine) ----
    const canSpin = !isPending && !spinning && wager > 0;
    const canStop = spinning && !stopping;

    const handleSpin = async () => {
        if (!canSpin) return;
        clearAllTimers(); setRoundResult(null); setSpinning(true); setStopping(false);
        pendingResultRef.current = null; stopRequestedRef.current = false;
        setStats((prev) => ({ ...prev, rounds: prev.rounds + 1, wagered: prev.wagered + wager }));
        stoppingRef.current = Array.from({ length: GRID_COLS }, () => false);
        setColumnStopped(Array.from({ length: GRID_COLS }, () => false));
        scrollRef.current = Array.from({ length: GRID_COLS }, () => 0);
        setStrips(Array.from({ length: GRID_COLS }, () => Array.from({ length: TOTAL_COUNT }, () => randomSymbol())));
        lastFrameRef.current = null;
        rafRef.current = requestAnimationFrame(spinLoop);
        watchdogRef.current = setTimeout(() => { watchdogRef.current = null; resetAfterError(); }, WATCHDOG_MS);
        try { const result = await spin(wager); pendingResultRef.current = result; if (stopRequestedRef.current) beginStopSequence(result); }
        catch { resetAfterError(); }
    };

    const handleStopClick = () => {
        if (!canStop) return;
        stopRequestedRef.current = true; setStopping(true);
        if (pendingResultRef.current) beginStopSequence(pendingResultRef.current);
    };

    const confettiPieces = useMemo(() => (roundResult?.won ? generateConfetti(roundResult.jackpot) : []), [roundResult]);
    const netResult = stats.won - stats.wagered;
    const ratio = stats.wagered > 0 ? stats.won / stats.wagered : 0;

    const isSpinningReels = spinning && !stopping;

    return (
        <Box sx={{ maxWidth: 560, mx: "auto" }}>
            <Box sx={{ position: "relative", borderRadius: 3, p: 3, background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.15) 100%)", bgcolor: "background.paper", border: "3px solid", borderColor: "warning.main", boxShadow: "0 12px 32px rgba(0,0,0,0.4)" }}>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 2 }}>
                    <Box sx={{ minWidth: 64, textAlign: "left" }}>
                        {jackpotPool !== undefined && (
                            <>
                                <Typography variant="overline" sx={{ letterSpacing: 1.5, color: "warning.main", fontWeight: 700, display: "block", lineHeight: 1.2, fontSize: "0.65rem" }}>
                                    Jackpot
                                </Typography>
                                <Typography variant="subtitle2" sx={{ fontWeight: 800, color: "warning.light", fontVariantNumeric: "tabular-nums" }}>
                                    {formatCheddar(jackpotPool)}
                                </Typography>
                            </>
                        )}
                    </Box>

                    {(oddsLabel || rtpLabel) && (
                        <Box sx={{ textAlign: "center" }}>
                            <Typography variant="overline" sx={{ letterSpacing: 1.5, color: "text.secondary", fontWeight: 700, display: "block", lineHeight: 1.2, fontSize: "0.65rem" }}>
                                Odds
                            </Typography>
                            <Typography variant="subtitle2" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                                {[oddsLabel, rtpLabel].filter(Boolean).join(" ┬╖ ")}
                            </Typography>
                        </Box>
                    )}

                    <Box sx={{ minWidth: 64, textAlign: "right" }}>
                        {denominationLabel && (
                            <>
                                <Typography variant="overline" sx={{ letterSpacing: 1.5, color: "text.secondary", fontWeight: 700, display: "block", lineHeight: 1.2, fontSize: "0.65rem" }}>
                                    Per Spin
                                </Typography>
                                <Typography variant="subtitle2" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                                    {formatCheddar(Number(denominationLabel))}
                                </Typography>
                            </>
                        )}
                    </Box>
                </Box>

                <Box sx={{ position: "relative" }}>
                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
                            gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`,
                            gap: 1,
                            p: 1.5,
                            borderRadius: 2,
                            bgcolor: "#000",
                            border: "3px solid",
                            borderColor: "grey.800",
                            boxShadow: "inset 0 6px 18px rgba(0,0,0,0.75)",
                        }}
                    >
                    {displayGrid.map((column, col) =>
                        column.map((symbolKey, row) => {
                            const key = cellKey(col, row);
                            const isHighlighted = highlighted.has(key);
                            const isClearing = clearing.has(key);
                            return (
                                <Box
                                    key={key}
                                    sx={{
                                        gridColumn: col + 1,
                                        gridRow: row + 1,
                                        aspectRatio: "1 / 1",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: { xs: 28, sm: 36 },
                                        lineHeight: 1,
                                        borderRadius: 1,
                                        bgcolor: "#0d0d0d",
                                        border: "1px solid",
                                        borderColor: isHighlighted ? "warning.main" : "grey.900",
                                        transition: "border-color 0.2s, opacity 0.25s, transform 0.25s",
                                        opacity: isClearing ? 0 : 1,
                                        transform: isClearing ? "scale(0.4)" : "scale(1)",
                                        ...(isHighlighted
                                            ? {
                                                  animation: "spinmaniaCellGlow 500ms ease-in-out infinite",
                                                  "@keyframes spinmaniaCellGlow": {
                                                      "0%, 100%": { boxShadow: "0 0 0 2px rgba(255,215,0,0.9), 0 0 14px 3px rgba(255,215,0,0.6)" },
                                                      "50%": { boxShadow: "0 0 0 4px rgba(255,215,0,1), 0 0 22px 8px rgba(255,215,0,0.9)" },
                                                  },
                                              }
                                            : {}),
                                    }}
                                >
                                    {symbols[symbolKey] ?? "Γ¥ö"}
                                </Box>
                            );
                        })
                    )}

                    {cascadeMultiplier !== null && cascadeMultiplier > 1 && (
                        <Box
                            sx={{
                                position: "absolute",
                                top: 8,
                                right: 8,
                                px: 1.25,
                                py: 0.5,
                                borderRadius: 999,
                                bgcolor: "warning.main",
                                color: "#000",
                                fontWeight: 800,
                                fontSize: "0.85rem",
                                zIndex: 3,
                                animation: "spinmaniaMultiplierIn 0.25s cubic-bezier(0.34, 1.56, 0.64, 1)",
                                "@keyframes spinmaniaMultiplierIn": {
                                    "0%": { opacity: 0, transform: "scale(0.5)" },
                                    "100%": { opacity: 1, transform: "scale(1)" },
                                },
                            }}
                        >
                            ├ù{cascadeMultiplier}
                        </Box>
                    )}

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
                                          animation: "spinmaniaJackpotBannerIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
                                          "@keyframes spinmaniaJackpotBannerIn": {
                                              "0%": { opacity: 0, transform: "scale(0.5)" },
                                              "60%": { opacity: 1, transform: "scale(1.12)" },
                                              "100%": { opacity: 1, transform: "scale(1)" },
                                          },
                                      }
                                    : {
                                          animation: "spinmaniaWinBannerIn 0.3s ease-out",
                                          "@keyframes spinmaniaWinBannerIn": {
                                              "0%": { opacity: 0, transform: "scale(0.8)" },
                                              "100%": { opacity: 1, transform: "scale(1)" },
                                          },
                                      }),
                            }}
                        >
                            {roundResult.won ? (
                                <>
                                    <Typography variant={roundResult.jackpot ? "h2" : "h4"} sx={{ lineHeight: 1 }}>
                                        {roundResult.jackpot ? "≡ƒÄ░" : "≡ƒÄë"}
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

                {spinning && (
                    <Box sx={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`, gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`, gap: 1, p: 1.5, borderRadius: 2, bgcolor: "#000", border: "3px solid", borderColor: "grey.800", boxShadow: "inset 0 6px 18px rgba(0,0,0,0.75)", filter: isSpinningReels ? "blur(1px)" : "blur(0px)", transition: "filter 0.25s", zIndex: 1 }}>
                        {Array.from({ length: GRID_COLS }, (_, col) => (
                            <Box key={`reel-${col}`} sx={{ gridColumn: col + 1, gridRow: "1 / 4", overflow: "hidden", borderRadius: 1, bgcolor: "#0d0d0d", border: "1px solid", borderColor: columnStopped[col] ? "warning.main" : "grey.900", transition: "border-color 0.3s" }}>
                                <Box ref={(el: HTMLDivElement | null) => { stripRefs.current[col] = el; }} sx={{ display: "flex", flexDirection: "column", willChange: "transform" }}>
                                    {strips[col].map((symbolKey, idx) => (
                                        <Box key={idx} sx={{ height: CELL_HEIGHT, display: "flex", alignItems: "center", justifyContent: "center", fontSize: { xs: 28, sm: 36 }, lineHeight: 1, flexShrink: 0 }}>{symbols[symbolKey] ?? "❔"}</Box>
                                    ))}
                                </Box>
                            </Box>
                        ))}
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
                    <Button variant="contained" color="error" size="large" onClick={handleSpin} disabled={!canSpin} sx={{ borderRadius: 999, px: 6, py: 1.25, fontWeight: 800, fontSize: "1.05rem" }}>{`Spin (${formatCheddar(wager)})`}</Button>
                ) : (
                    <Button variant="contained" color="warning" size="large" onClick={handleStopClick} disabled={!canStop} sx={{ borderRadius: 999, px: 6, py: 1.25, fontWeight: 800, fontSize: "1.05rem" }}>{stopping ? "Stopping…" : "Stop"}</Button>
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
