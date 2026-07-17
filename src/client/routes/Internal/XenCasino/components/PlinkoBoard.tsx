import { useEffect, useRef, useState } from "react";
import { Box, Button, Typography, ToggleButtonGroup, ToggleButton } from "@mui/material";
import { formatCheddar } from "../utils/currency";

export interface PlinkoTrajectorySample {
    x: number;
    y: number;
    r: number; // ball rotation, radians - purely cosmetic
}

export interface PlinkoPegPosition {
    x: number;
    y: number;
}

export interface PlinkoLayoutData {
    canvasWidth: number;
    canvasHeight: number;
    boardTop: number;
    boardBottom: number;
    slotFloorY: number;
    dropY: number;
    dropMinX: number;
    dropMaxX: number;
    pegRadius: number;
    ballRadius: number;
    pegPositions: PlinkoPegPosition[];
    slotBoundaries: number[]; // length multipliers.length + 1
}

export interface PlinkoDropResult {
    trajectory: PlinkoTrajectorySample[];
    slot: number;
    multiplier: number;
    payout: number;
    balance: string;
}

export interface PlinkoBoardProps {
    betOptions: number[];
    betLabels?: string[];
    defaultBet?: number;
    layout: PlinkoLayoutData | null;
    multipliers: number[]; // indexed by landing slot
    isPending: boolean;
    drop: (wager: number, dropX: number) => Promise<PlinkoDropResult>;
    onResult?: (result: PlinkoDropResult) => void; // fired once the ball has visually landed
}

// Fallback board dimensions, used only for the very first render before /odds has resolved
// and handed us the real layout - the board redraws against the real thing the moment it
// arrives.
const FALLBACK_CANVAS_WIDTH = 440;
const FALLBACK_CANVAS_HEIGHT = 460;

const FRAME_MS = 1000 / 30; // matches the server's ~30fps trajectory sampling rate
const LANDING_PAUSE_MS = 500; // beat before the verdict appears, once the ball actually lands
const INDICATOR_PERIOD_MS = 2200; // one full sweep left-to-right-to-left while idle

interface SessionStats {
    rounds: number;
    wagered: number;
    won: number;
}

/**
 * The reusable Plinko board - the canvas analog of SlotMachine/ScratchCard for this game.
 * Purely presentational: knows nothing about the backend route or how a drop is decided -
 * it's handed the real board geometry (from the server, so it draws exactly what the physics
 * sim ran against), a per-slot multiplier table for the bucket labels, and a `drop` function
 * that resolves with the real (server-simulated) trajectory once wagered.
 *
 * The one interactive element beyond the wager/drop button is the aim marker gliding back
 * and forth above the peg field - wherever it is the instant "Drop Ball" is clicked becomes
 * `dropX`, a genuine physics input the server's real ball actually falls from. Everything
 * after that - the fall itself - is a real matter-js simulation on the server; the client
 * only replays the returned trajectory samples via plain requestAnimationFrame interpolation,
 * same as every other physics-backed game in this app (see PachinkoBoard.tsx).
 */
export default function PlinkoBoard({ betOptions, betLabels, defaultBet, layout, multipliers, isPending, drop, onResult }: PlinkoBoardProps) {
    const [wager, setWager] = useState(defaultBet ?? betOptions[0]);
    const [dropping, setDropping] = useState(false); // a round is active (Drop clicked, ball not yet landed)
    const [landedResult, setLandedResult] = useState<PlinkoDropResult | null>(null);
    const [stats, setStats] = useState<SessionStats>({ rounds: 0, wagered: 0, won: 0 });
    // Mirrors indicatorXRef's "has a real value yet" state as an actual re-render trigger -
    // the ref itself is written 60x/second by the idle animation below and reading it alone
    // wouldn't ever re-enable the Drop button once the layout first arrives (ref writes
    // don't cause re-renders).
    const [indicatorReady, setIndicatorReady] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const rafRef = useRef<number | null>(null);
    const landingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const trajectoryRef = useRef<PlinkoTrajectorySample[] | null>(null); // the trajectory currently animating, once known
    const indicatorXRef = useRef<number | null>(null); // current aim marker x - read at click time as dropX
    const droppedAtXRef = useRef<number | null>(null); // frozen marker position while a ball is in the air

    const canvasWidth = layout?.canvasWidth ?? FALLBACK_CANVAS_WIDTH;
    const canvasHeight = layout?.canvasHeight ?? FALLBACK_CANVAS_HEIGHT;

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

    // Draws the static peg field, slot/multiplier labels, the aim marker (idle) or its
    // frozen drop point (mid-fall), and the ball itself at its current fractional fall
    // position, if any.
    const draw = (ball: { x: number; y: number } | null, landedSlot: number | null) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx || !layout) {
            return;
        }
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        ctx.fillStyle = "rgba(255,255,255,0.55)";
        for (const peg of layout.pegPositions) {
            ctx.beginPath();
            ctx.arc(peg.x, peg.y, layout.pegRadius, 0, Math.PI * 2);
            ctx.fill();
        }

        const slotLabelY = layout.slotFloorY + 18;
        for (let slot = 0; slot < multipliers.length; slot++) {
            const x = (layout.slotBoundaries[slot] + layout.slotBoundaries[slot + 1]) / 2;
            const isLanded = landedSlot === slot;
            ctx.fillStyle = isLanded ? "#FFD700" : "rgba(255,255,255,0.7)";
            ctx.font = isLanded ? "bold 12px sans-serif" : "11px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(`${multipliers[slot]}x`, x, slotLabelY);
        }

        // The aim marker - either gliding back and forth (idle) or frozen at the position it
        // was captured from (mid-fall), with a faint dashed guide line down to the peg field
        // so the drop point actually reads as a drop point.
        const markerX = dropping ? droppedAtXRef.current : indicatorXRef.current;
        if (markerX !== null && markerX !== undefined) {
            ctx.strokeStyle = "rgba(255,255,255,0.15)";
            ctx.setLineDash([3, 4]);
            ctx.beginPath();
            ctx.moveTo(markerX, layout.dropY + 6);
            ctx.lineTo(markerX, layout.boardTop);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = dropping ? "rgba(255,193,7,0.5)" : "#FFC107";
            ctx.beginPath();
            ctx.moveTo(markerX, layout.dropY + 6);
            ctx.lineTo(markerX - 5, layout.dropY - 4);
            ctx.lineTo(markerX + 5, layout.dropY - 4);
            ctx.closePath();
            ctx.fill();
        }

        if (ball) {
            ctx.fillStyle = "#FF6B6B";
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, layout.ballRadius, 0, Math.PI * 2);
            ctx.fill();
        }
    };

    // Idle animation: the aim marker sweeps back and forth across the drop range on a plain
    // sine wave, purely client-side (there's nothing server-authoritative about *where the
    // marker currently is* - only the dropX value captured at click time ever reaches the
    // server, and that's a real physics input to the simulation, not a display concern).
    useEffect(() => {
        if (!layout || dropping) {
            return;
        }
        const centerX = (layout.dropMinX + layout.dropMaxX) / 2;
        const amplitude = (layout.dropMaxX - layout.dropMinX) / 2;
        if (indicatorXRef.current === null) {
            indicatorXRef.current = centerX;
        }
        setIndicatorReady(true);
        const start = performance.now();
        const tick = (now: number) => {
            const phase = ((now - start) % INDICATOR_PERIOD_MS) / INDICATOR_PERIOD_MS;
            indicatorXRef.current = centerX + amplitude * Math.sin(phase * Math.PI * 2);
            draw(null, landedResult?.slot ?? null);
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => {
            if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layout, dropping, landedResult]);

    const animateTrajectory = (result: PlinkoDropResult) => {
        trajectoryRef.current = result.trajectory;
        const start = performance.now();
        const lastIndex = result.trajectory.length - 1;
        const tick = (now: number) => {
            const rawIndex = (now - start) / FRAME_MS;
            const index = Math.min(lastIndex, rawIndex);
            const i0 = Math.floor(index);
            const frac = index - i0;
            const s0 = result.trajectory[i0];
            const s1 = result.trajectory[Math.min(lastIndex, i0 + 1)];
            const x = s0.x + (s1.x - s0.x) * frac;
            const y = s0.y + (s1.y - s0.y) * frac;
            draw({ x, y }, null);
            if (index < lastIndex) {
                rafRef.current = requestAnimationFrame(tick);
            } else {
                rafRef.current = null;
                const final = result.trajectory[lastIndex];
                draw({ x: final.x, y: final.y }, result.slot);
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
        trajectoryRef.current = null;
        droppedAtXRef.current = null;
        setDropping(false);
        draw(null, null);
    };

    const canDrop = !isPending && !dropping && wager > 0 && !!layout && indicatorReady;

    const handleDrop = async () => {
        if (!canDrop || indicatorXRef.current === null) {
            return;
        }
        const dropX = indicatorXRef.current;
        clearTimers();
        trajectoryRef.current = null;
        droppedAtXRef.current = dropX;
        setLandedResult(null);
        setDropping(true);
        setStats((prev) => ({ ...prev, rounds: prev.rounds + 1, wagered: prev.wagered + wager }));
        draw(null, null);

        try {
            const result = await drop(wager, dropX);
            animateTrajectory(result);
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
                <Box sx={{ textAlign: "center", mb: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                        Click Drop Ball when the marker's where you want to aim
                    </Typography>
                </Box>

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
                    <canvas ref={canvasRef} width={canvasWidth} height={canvasHeight} style={{ maxWidth: "100%", height: "auto" }} />

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
