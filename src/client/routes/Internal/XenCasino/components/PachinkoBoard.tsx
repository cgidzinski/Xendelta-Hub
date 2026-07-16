import { useEffect, useRef, useState } from "react";
import { Box, Button, Typography } from "@mui/material";
import { formatCheddar } from "../utils/currency";

export type PachinkoPocketType = "miss" | "small" | "start" | "jackpot";

export interface PachinkoTrajectorySample {
    x: number;
    y: number;
    r: number;
}

export interface PachinkoPocketLayout {
    index: number;
    xStart: number;
    xEnd: number;
    type: PachinkoPocketType;
    multiplier?: number;
}

export interface PachinkoLayoutData {
    canvasWidth: number;
    canvasHeight: number;
    boardTop: number;
    boardBottom: number;
    pocketFloorY: number;
    pins: { x: number; y: number }[];
    pockets: PachinkoPocketLayout[];
}

export interface PachinkoSession {
    roundId: string;
    ballsTotal: number;
    ballsRemaining: number;
    pricePerBall: number;
    totalPayout: number;
}

export interface PachinkoLaunchResult {
    pocket: number;
    pocketType: PachinkoPocketType;
    payout: number;
    trajectory: PachinkoTrajectorySample[];
    ballsRemaining: number;
    totalPayout: number;
    balance?: string;
}

export interface PachinkoBoardProps {
    session: PachinkoSession;
    layout: PachinkoLayoutData | null;
    jackpotPool: number;
    isPending: boolean;
    launch: () => Promise<PachinkoLaunchResult>;
    onSessionUpdate: (session: PachinkoSession) => void;
    onBuyMore: () => void; // starts a fresh batch once this one's fully launched
}

const PIN_RADIUS = 4;
const BALL_RADIUS = 7;
const FRAME_MS = 1000 / 30; // matches the server's ~30fps trajectory sample rate
const LANDING_PAUSE_MS = 500;

const POCKET_COLOR: Record<PachinkoPocketType, string> = {
    miss: "rgba(255,255,255,0.35)",
    small: "#64B5F6",
    start: "#FFD54F",
    jackpot: "#FF6B6B",
};

function pocketLabel(pocket: PachinkoPocketLayout): string {
    if (pocket.type === "start") {
        return "POOL";
    }
    if (pocket.type === "miss") {
        return "";
    }
    return `${pocket.multiplier}x`;
}

/**
 * The reusable Pachinko board - canvas analog of PlinkoBoard, but replaying a physics
 * trajectory captured server-side instead of walking a discrete peg-row path. The server
 * decides the whole outcome (pocket + trajectory) before any of this runs; this component's
 * only job is to play that trajectory back and reflect the session state it's handed -
 * there's no simulation and no odds logic here.
 */
export default function PachinkoBoard({ session, layout, jackpotPool, isPending, launch, onSessionUpdate, onBuyMore }: PachinkoBoardProps) {
    const [launching, setLaunching] = useState(false);
    const [landedResult, setLandedResult] = useState<PachinkoLaunchResult | null>(null);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const rafRef = useRef<number | null>(null);
    const landingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const trajectoryRef = useRef<PachinkoTrajectorySample[] | null>(null);

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

    const draw = (ball: PachinkoTrajectorySample | null, landedPocketIndex: number | null) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx || !layout) {
            return;
        }
        ctx.clearRect(0, 0, layout.canvasWidth, layout.canvasHeight);

        ctx.fillStyle = "rgba(255,255,255,0.55)";
        for (const pin of layout.pins) {
            ctx.beginPath();
            ctx.arc(pin.x, pin.y, PIN_RADIUS, 0, Math.PI * 2);
            ctx.fill();
        }

        for (const pocket of layout.pockets) {
            const isLanded = landedPocketIndex === pocket.index;
            ctx.strokeStyle = "rgba(255,255,255,0.25)";
            ctx.beginPath();
            ctx.moveTo(pocket.xStart, layout.boardBottom);
            ctx.lineTo(pocket.xStart, layout.canvasHeight);
            ctx.stroke();

            ctx.fillStyle = isLanded ? "#FFD700" : POCKET_COLOR[pocket.type];
            ctx.fillRect(pocket.xStart + 2, layout.pocketFloorY, pocket.xEnd - pocket.xStart - 4, layout.canvasHeight - layout.pocketFloorY);

            const label = pocketLabel(pocket);
            if (label) {
                ctx.fillStyle = isLanded ? "#000" : "rgba(0,0,0,0.75)";
                ctx.font = isLanded ? "bold 10px sans-serif" : "9px sans-serif";
                ctx.textAlign = "center";
                ctx.fillText(label, (pocket.xStart + pocket.xEnd) / 2, layout.pocketFloorY + 16);
            }
        }

        if (ball) {
            ctx.fillStyle = "#FF6B6B";
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
            ctx.fill();
        }
    };

    useEffect(() => {
        draw(null, landedResult?.pocket ?? null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layout, landedResult]);

    const animateTrajectory = (result: PachinkoLaunchResult) => {
        trajectoryRef.current = result.trajectory;
        const frames = result.trajectory;
        if (frames.length === 0) {
            setLandedResult(result);
            setLaunching(false);
            return;
        }
        const start = performance.now();
        const totalMs = (frames.length - 1) * FRAME_MS;
        const tick = (now: number) => {
            const elapsed = Math.min(totalMs, now - start);
            const progress = totalMs > 0 ? elapsed / FRAME_MS : frames.length - 1;
            const i0 = Math.min(frames.length - 1, Math.floor(progress));
            const i1 = Math.min(frames.length - 1, i0 + 1);
            const frac = progress - i0;
            const sample: PachinkoTrajectorySample = {
                x: frames[i0].x + (frames[i1].x - frames[i0].x) * frac,
                y: frames[i0].y + (frames[i1].y - frames[i0].y) * frac,
                r: frames[i0].r + (frames[i1].r - frames[i0].r) * frac,
            };
            draw(sample, null);
            if (elapsed < totalMs) {
                rafRef.current = requestAnimationFrame(tick);
            } else {
                rafRef.current = null;
                draw(frames[frames.length - 1], result.pocket);
                landingTimeoutRef.current = setTimeout(() => {
                    setLandedResult(result);
                    setLaunching(false);
                    onSessionUpdate({ ...session, ballsRemaining: result.ballsRemaining, totalPayout: result.totalPayout });
                }, LANDING_PAUSE_MS);
            }
        };
        rafRef.current = requestAnimationFrame(tick);
    };

    const resetAfterError = () => {
        clearTimers();
        trajectoryRef.current = null;
        setLaunching(false);
        draw(null, null);
    };

    const complete = session.ballsRemaining <= 0;
    const canLaunch = !isPending && !launching && !complete;

    const handleLaunch = async () => {
        if (!canLaunch) {
            return;
        }
        clearTimers();
        trajectoryRef.current = null;
        setLandedResult(null);
        setLaunching(true);
        draw(null, null);

        try {
            const result = await launch();
            animateTrajectory(result);
        } catch {
            // The launch mutation's own onError already surfaces a toast - nothing was
            // decided to animate, so just go back to idle.
            resetAfterError();
        }
    };

    const spent = session.ballsTotal * session.pricePerBall;
    const netResult = session.totalPayout - spent;
    const ballsLaunched = session.ballsTotal - session.ballsRemaining;

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
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                        Balls {ballsLaunched}/{session.ballsTotal} · Pool {formatCheddar(jackpotPool)}
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
                    {layout ? (
                        <canvas ref={canvasRef} width={layout.canvasWidth} height={layout.canvasHeight} style={{ maxWidth: "100%", height: "auto" }} />
                    ) : (
                        <Box sx={{ width: "100%", height: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <Typography variant="body2" color="text.secondary">
                                Loading board…
                            </Typography>
                        </Box>
                    )}

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
                                animation: "pachinkoVerdictIn 0.3s ease-out",
                                "@keyframes pachinkoVerdictIn": {
                                    "0%": { opacity: 0, transform: "translateX(-50%) scale(0.8)" },
                                    "100%": { opacity: 1, transform: "translateX(-50%) scale(1)" },
                                },
                            }}
                        >
                            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: landedResult.payout > 0 ? "success.light" : "grey.300" }}>
                                {landedResult.pocketType === "start" ? "JACKPOT POOL!" : landedResult.pocketType === "jackpot" ? "JACKPOT!" : landedResult.pocketType === "miss" ? "Miss" : "Win"}
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 800, color: "warning.light" }}>
                                {landedResult.payout > 0 ? `+${formatCheddar(landedResult.payout)}` : "—"}
                            </Typography>
                        </Box>
                    )}
                </Box>
            </Box>

            <Box sx={{ textAlign: "center", mt: 2.5 }}>
                {!complete ? (
                    <Button
                        variant="contained"
                        color="error"
                        size="large"
                        onClick={handleLaunch}
                        disabled={!canLaunch}
                        sx={{ borderRadius: 999, px: 6, py: 1.25, fontWeight: 800, fontSize: "1.05rem" }}
                    >
                        {launching ? "Launching…" : `Launch Ball (${session.ballsRemaining} left)`}
                    </Button>
                ) : (
                    <Button
                        variant="contained"
                        color="warning"
                        size="large"
                        onClick={onBuyMore}
                        sx={{ borderRadius: 999, px: 6, py: 1.25, fontWeight: 800, fontSize: "1.05rem" }}
                    >
                        Buy More Balls
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
                        Spent
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                        {formatCheddar(spent)}
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
                        {spent > 0 ? (session.totalPayout / spent).toFixed(2) : "0.00"}x
                    </Typography>
                </Box>
            </Box>
        </Box>
    );
}
