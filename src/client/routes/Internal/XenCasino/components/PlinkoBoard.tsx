import { useEffect, useRef, useState } from "react";
import { Box, Button, Typography, ToggleButtonGroup, ToggleButton } from "@mui/material";
import { formatCheddar } from "../utils/currency";

export interface PlinkoDropResult {
    path: number[]; // 0=left, 1=right, one entry per row - the server-decided bounce sequence
    slot: number;
    multiplier: number;
    payout: number;
    balance: string;
}

export interface PlinkoBoardProps {
    betOptions: number[];
    betLabels?: string[];
    defaultBet?: number;
    rows: number; // peg rows - board has rows+1 landing slots
    multipliers: number[]; // length rows+1, indexed by landing slot
    oddsLabel?: string;
    rtpLabel?: string;
    isPending: boolean;
    drop: (wager: number) => Promise<PlinkoDropResult>;
    onResult?: (result: PlinkoDropResult) => void; // fired once the ball has visually landed
}

const CANVAS_WIDTH = 440;
const CANVAS_HEIGHT = 460;
const BOARD_TOP = 30;
const BOARD_BOTTOM = 360;
const SLOT_LABEL_Y = 400;
const PEG_RADIUS = 3.5;
const BALL_RADIUS = 8;
const ROW_DURATION_MS = 170; // how long the ball takes to fall past one peg row
const LANDING_PAUSE_MS = 500; // beat before the verdict appears, once the ball actually lands

interface SessionStats {
    rounds: number;
    wagered: number;
    won: number;
}

// The ball's horizontal position at any point mid-fall is expressed the same way a real
// Galton board narrows toward its final slot: after `bounces` flips with `rights` of them
// going right, offset (in half-peg-spacing units, relative to center) = 2*rights - bounces.
// At bounces===rows this lands exactly on evenly-spaced slot centers, matching the pegs
// drawn above it row by row.
function ballOffset(rights: number, bounces: number): number {
    return 2 * rights - bounces;
}

/**
 * The reusable Plinko board every board-config variant would render - the canvas analog of
 * SlotMachine/ScratchCard for this game. Purely presentational: knows nothing about odds,
 * the backend route, or RTP math - it's handed a peg-row count, a per-slot multiplier
 * table (for the bucket labels), and a `drop` function that resolves with the real
 * (server-decided) path once wagered.
 *
 * The server decides the entire bounce path *before* any money moves, so there's nothing
 * to simulate here - the ball just walks the returned `path` deterministically, one peg
 * row at a time, via a plain requestAnimationFrame position interpolation. No physics
 * engine needed.
 */
export default function PlinkoBoard({ betOptions, betLabels, defaultBet, rows, multipliers, oddsLabel, rtpLabel, isPending, drop, onResult }: PlinkoBoardProps) {
    const [wager, setWager] = useState(defaultBet ?? betOptions[0]);
    const [dropping, setDropping] = useState(false); // a round is active (Drop clicked, ball not yet landed)
    const [landedResult, setLandedResult] = useState<PlinkoDropResult | null>(null);
    const [stats, setStats] = useState<SessionStats>({ rounds: 0, wagered: 0, won: 0 });

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const rafRef = useRef<number | null>(null);
    const landingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pathRef = useRef<number[] | null>(null); // the path currently animating, once known

    const clearTimers = () => {
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        if (landingTimeoutRef.current !== null) {
            clearTimeout(landingTimeoutRef.current);
            landingTimeoutRef.current = null;
        }
    };

    useEffect(() => () => clearTimers(), []);

    const pegSpacing = CANVAS_WIDTH / (rows + 2);
    const rowHeight = (BOARD_BOTTOM - BOARD_TOP) / rows;
    const centerX = CANVAS_WIDTH / 2;

    const xFor = (rights: number, bounces: number) => centerX + ballOffset(rights, bounces) * (pegSpacing / 2);

    // Draws the static peg triangle, the slot/multiplier labels, and (if given) the ball at
    // its current fractional fall position.
    const draw = (ballProgress: number | null, landedSlot: number | null) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) {
            return;
        }
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        // Pegs: row i (0-indexed) has i+1 positions, matching every reachable ball offset.
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        for (let row = 0; row < rows; row++) {
            const y = BOARD_TOP + row * rowHeight;
            for (let j = 0; j <= row; j++) {
                const x = xFor(j, row);
                ctx.beginPath();
                ctx.arc(x, y, PEG_RADIUS, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Slot/multiplier labels along the bottom, highlighting the landed one (if any).
        for (let slot = 0; slot < multipliers.length; slot++) {
            const x = xFor(slot, rows);
            const isLanded = landedSlot === slot;
            ctx.fillStyle = isLanded ? "#FFD700" : "rgba(255,255,255,0.7)";
            ctx.font = isLanded ? "bold 12px sans-serif" : "11px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(`${multipliers[slot]}x`, x, SLOT_LABEL_Y);
        }

        // The ball, mid-fall - interpolates linearly between its position after `bounces`
        // flips and its position after `bounces+1`, using the fractional part of progress.
        if (ballProgress !== null && pathRef.current) {
            const bounces = Math.min(rows, Math.floor(ballProgress));
            const frac = Math.min(1, ballProgress - bounces);
            const rightsSoFar = pathRef.current.slice(0, bounces).filter((b) => b === 1).length;
            const x0 = xFor(rightsSoFar, bounces);
            const y0 = BOARD_TOP + bounces * rowHeight;
            let x = x0;
            let y = y0;
            if (bounces < rows) {
                const nextRights = rightsSoFar + pathRef.current[bounces];
                const x1 = xFor(nextRights, bounces + 1);
                const y1 = BOARD_TOP + (bounces + 1) * rowHeight;
                x = x0 + (x1 - x0) * frac;
                y = y0 + (y1 - y0) * frac;
            }
            ctx.fillStyle = "#FF6B6B";
            ctx.beginPath();
            ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2);
            ctx.fill();
        }
    };

    useEffect(() => {
        draw(null, landedResult?.slot ?? null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [rows, multipliers, landedResult]);

    const animatePath = (result: PlinkoDropResult) => {
        pathRef.current = result.path;
        const start = performance.now();
        const totalMs = rows * ROW_DURATION_MS;
        const tick = (now: number) => {
            const progress = Math.min(rows, ((now - start) / totalMs) * rows);
            draw(progress, null);
            if (progress < rows) {
                rafRef.current = requestAnimationFrame(tick);
            } else {
                rafRef.current = null;
                draw(rows, result.slot);
                landingTimeoutRef.current = setTimeout(() => {
                    setStats((prev) => ({ ...prev, won: prev.won + result.payout }));
                    setLandedResult(result);
                    setDropping(false);
                    onResult?.(result);
                }, LANDING_PAUSE_MS);
            }
        };
        rafRef.current = requestAnimationFrame(tick);
    };

    // Immediately halts everything and puts the board back in idle - used when drop()
    // itself fails, so a network/balance error can't leave the ball "in the air" forever
    // with nothing to land it. `drop` is backed by an axios instance with its own request
    // timeout, so a hung request still rejects (and lands here) rather than never settling.
    const resetAfterError = () => {
        clearTimers();
        pathRef.current = null;
        setDropping(false);
        draw(null, null);
    };

    const canDrop = !isPending && !dropping && wager > 0;

    const handleDrop = async () => {
        if (!canDrop) {
            return;
        }
        clearTimers();
        pathRef.current = null;
        setLandedResult(null);
        setDropping(true);
        setStats((prev) => ({ ...prev, rounds: prev.rounds + 1, wagered: prev.wagered + wager }));
        draw(null, null);

        try {
            const result = await drop(wager);
            animatePath(result);
        } catch {
            // The caller's own mutation already surfaces the error (e.g. a toast) - there's
            // nothing decided to land on, so just go back to idle.
            resetAfterError();
        }
    };

    const netResult = stats.won - stats.wagered;
    const ratio = stats.wagered > 0 ? stats.won / stats.wagered : 0;

    return (
        <Box sx={{ maxWidth: 480, mx: "auto" }}>
            <Box
                sx={{
                    position: "relative",
                    borderRadius: 3,
                    p: 2,
                    background: "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.15) 100%)",
                    bgcolor: "background.paper",
                    border: "3px solid",
                    borderColor: "warning.main",
                    boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
                }}
            >
                {(oddsLabel || rtpLabel) && (
                    <Box sx={{ textAlign: "center", mb: 1 }}>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                            {[oddsLabel, rtpLabel].filter(Boolean).join(" · ")}
                        </Typography>
                    </Box>
                )}

                <Box
                    sx={{
                        position: "relative",
                        borderRadius: 2,
                        bgcolor: "#000",
                        border: "3px solid",
                        borderColor: "grey.800",
                        boxShadow: "inset 0 6px 18px rgba(0,0,0,0.75)",
                        display: "flex",
                        justifyContent: "center",
                        overflow: "hidden",
                    }}
                >
                    <canvas ref={canvasRef} width={CANVAS_WIDTH} height={CANVAS_HEIGHT} style={{ maxWidth: "100%", height: "auto" }} />

                    {landedResult && (
                        <Box
                            sx={{
                                position: "absolute",
                                top: 8,
                                left: "50%",
                                transform: "translateX(-50%)",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                bgcolor: landedResult.payout > 0 ? "rgba(0,0,0,0.7)" : "rgba(0,0,0,0.55)",
                                borderRadius: 1,
                                px: 2,
                                py: 0.5,
                                animation: "plinkoVerdictIn 0.3s ease-out",
                                "@keyframes plinkoVerdictIn": {
                                    "0%": { opacity: 0, transform: "translateX(-50%) scale(0.8)" },
                                    "100%": { opacity: 1, transform: "translateX(-50%) scale(1)" },
                                },
                            }}
                        >
                            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: landedResult.payout >= wager ? "success.light" : "grey.300" }}>
                                {landedResult.multiplier}x
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 800, color: "warning.light" }}>
                                {landedResult.payout > 0 ? `+${formatCheddar(landedResult.payout)}` : "Lose"}
                            </Typography>
                        </Box>
                    )}
                </Box>
            </Box>

            <ToggleButtonGroup
                exclusive
                size="small"
                value={wager}
                onChange={(_, value) => value !== null && setWager(value)}
                sx={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 1, mt: 3, "& .MuiToggleButtonGroup-grouped": { border: "1px solid", borderColor: "divider", borderRadius: "4px !important" } }}
            >
                {betOptions.map((amount, idx) => (
                    <ToggleButton key={amount} value={amount} disabled={dropping || isPending} sx={{ px: 2, fontWeight: 700, textTransform: "none" }}>
                        {betLabels?.[idx] ?? formatCheddar(amount)}
                    </ToggleButton>
                ))}
            </ToggleButtonGroup>

            <Box sx={{ textAlign: "center", mt: 2.5 }}>
                <Button
                    variant="contained"
                    color="error"
                    size="large"
                    onClick={handleDrop}
                    disabled={!canDrop}
                    sx={{ borderRadius: 999, px: 6, py: 1.25, fontWeight: 800, fontSize: "1.05rem" }}
                >
                    {dropping ? "Dropping…" : `Drop Ball (${formatCheddar(wager)})`}
                </Button>
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
