import { useEffect, useRef, useState } from "react";
import { Box, Button, Slider, Typography } from "@mui/material";
import { formatCheddar } from "../utils/currency";

export type PachinkoOutcome = "gutter" | "tulipLeft" | "tulipRight" | "tulipCenter";

export interface PachinkoTrajectorySample {
    x: number;
    y: number;
    r: number;
}

export interface PachinkoPoint {
    x: number;
    y: number;
}

export interface PachinkoBezierSegment {
    p0: PachinkoPoint;
    c1: PachinkoPoint;
    c2: PachinkoPoint;
    p1: PachinkoPoint;
}

export interface PachinkoTulipLayout {
    id: "left" | "right" | "center";
    position: PachinkoPoint;
    closedHalfWidth: number;
    openHalfWidth: number;
}

export interface PachinkoWindmillLayout {
    position: PachinkoPoint;
    radius: number;
}

export interface PachinkoLayoutData {
    canvasWidth: number;
    canvasHeight: number;
    boundaryRightArc: PachinkoBezierSegment[];
    boundaryLeftArc: PachinkoBezierSegment[];
    launcherPosition: PachinkoPoint;
    releasePoint: PachinkoPoint;
    channelInnerX: number;
    channelOuterX: number;
    gutterCutoutXStart: number;
    gutterCutoutXEnd: number;
    gutterPocket: PachinkoPoint[];
    nailField: PachinkoPoint[];
    tulips: PachinkoTulipLayout[];
    windmills: PachinkoWindmillLayout[];
}

export interface PachinkoSession {
    roundId: string;
    ballsTotal: number;
    ballsRemaining: number;
    pricePerBall: number;
    totalPayout: number;
    leftTulipOpen: boolean;
    rightTulipOpen: boolean;
}

export interface PachinkoLaunchResult {
    outcome: PachinkoOutcome;
    payout: number;
    trajectory: PachinkoTrajectorySample[];
    leftTulipOpen: boolean;
    rightTulipOpen: boolean;
    ballsRemaining: number;
    totalPayout: number;
    balance?: string;
}

export interface PachinkoBoardProps {
    session: PachinkoSession;
    layout: PachinkoLayoutData | null;
    jackpotPool: number;
    launchPowerRange: { min: number; max: number };
    isPending: boolean;
    launch: (launchPower: number) => Promise<PachinkoLaunchResult>;
    onSessionUpdate: (session: PachinkoSession) => void;
    onBuyMore: () => void; // starts a fresh batch once this one's fully launched
}

const BALL_RADIUS = 3.5; // matches pachinkoLayout.ts's BALL_RADIUS
const PIN_RADIUS = 2.2;
const FRAME_MS = 1000 / 30; // matches the server's ~30fps trajectory sample rate
const LANDING_PAUSE_MS = 500;

const OUTCOME_LABEL: Record<PachinkoOutcome, string> = {
    gutter: "Miss",
    tulipLeft: "Side Tulip!",
    tulipRight: "Side Tulip!",
    tulipCenter: "JACKPOT!",
};

function drawArc(ctx: CanvasRenderingContext2D, arc: PachinkoBezierSegment[]) {
    if (arc.length === 0) {
        return;
    }
    ctx.moveTo(arc[0].p0.x, arc[0].p0.y);
    for (const seg of arc) {
        ctx.bezierCurveTo(seg.c1.x, seg.c1.y, seg.c2.x, seg.c2.y, seg.p1.x, seg.p1.y);
    }
}

/**
 * The reusable Pachinko board - canvas analog of PlinkoBoard, but replaying a physics
 * trajectory captured server-side instead of walking a discrete peg-row path. The server
 * decides the whole outcome (a real matter-js simulation driven by the player's own launch
 * power) before any of this runs; this component's only job is to play that trajectory back
 * and reflect the session state it's handed - there's no simulation and no odds logic here.
 */
export default function PachinkoBoard({ session, layout, jackpotPool, launchPowerRange, isPending, launch, onSessionUpdate, onBuyMore }: PachinkoBoardProps) {
    const [launching, setLaunching] = useState(false);
    const [landedResult, setLandedResult] = useState<PachinkoLaunchResult | null>(null);
    const [launchPower, setLaunchPower] = useState(() => (launchPowerRange.min + launchPowerRange.max) / 2);

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

    const draw = (ball: PachinkoTrajectorySample | null, leftOpen: boolean, rightOpen: boolean, highlightOutcome: PachinkoOutcome | null) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx || !layout) {
            return;
        }
        ctx.clearRect(0, 0, layout.canvasWidth, layout.canvasHeight);

        // The one true playfield boundary - drawn as two separate arcs so the gutter cutout
        // at the bottom is a genuine gap in the line, not a shape drawn over an intact edge.
        ctx.fillStyle = "rgba(255,255,255,0.04)";
        ctx.beginPath();
        drawArc(ctx, layout.boundaryRightArc);
        ctx.lineTo(layout.gutterCutoutXStart, layout.boundaryRightArc[layout.boundaryRightArc.length - 1]?.p1.y ?? 0);
        drawArc(
            ctx,
            [...layout.boundaryLeftArc].reverse().map((seg) => ({ p0: seg.p1, c1: seg.c2, c2: seg.c1, p1: seg.p0 }))
        );
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        drawArc(ctx, layout.boundaryRightArc);
        ctx.stroke();
        ctx.beginPath();
        drawArc(ctx, layout.boundaryLeftArc);
        ctx.stroke();

        // Rail/channel - thin, one ball-width, along the boundary's straight segment down to
        // the launcher below the field.
        ctx.fillStyle = "rgba(255,215,0,0.12)";
        ctx.fillRect(layout.channelInnerX, layout.releasePoint.y, layout.channelOuterX - layout.channelInnerX, layout.launcherPosition.y - layout.releasePoint.y);
        ctx.strokeStyle = "rgba(255,215,0,0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(layout.channelInnerX, layout.releasePoint.y);
        ctx.lineTo(layout.channelInnerX, layout.launcherPosition.y);
        ctx.stroke();

        // Launcher dial, below the field entirely.
        ctx.strokeStyle = "#FFD700";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(layout.launcherPosition.x, layout.launcherPosition.y, 10, 0, Math.PI * 2);
        ctx.stroke();

        // Gutter pocket hanging below the boundary's own cutout.
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.beginPath();
        layout.gutterPocket.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Nail field.
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        for (const pin of layout.nailField) {
            ctx.beginPath();
            ctx.arc(pin.x, pin.y, PIN_RADIUS, 0, Math.PI * 2);
            ctx.fill();
        }

        // Windmills - static bumpers for now (real rotation is a later visual pass).
        ctx.strokeStyle = "rgba(200,200,200,0.6)";
        ctx.lineWidth = 1.2;
        for (const windmill of layout.windmills) {
            ctx.beginPath();
            ctx.arc(windmill.position.x, windmill.position.y, windmill.radius, 0, Math.PI * 2);
            ctx.stroke();
            for (const angle of [0, Math.PI / 2]) {
                ctx.beginPath();
                ctx.moveTo(
                    windmill.position.x - Math.cos(angle) * windmill.radius,
                    windmill.position.y - Math.sin(angle) * windmill.radius
                );
                ctx.lineTo(
                    windmill.position.x + Math.cos(angle) * windmill.radius,
                    windmill.position.y + Math.sin(angle) * windmill.radius
                );
                ctx.stroke();
            }
        }

        // Tulips - open/primed state highlighted.
        for (const tulip of layout.tulips) {
            const isOpen = tulip.id === "left" ? leftOpen : tulip.id === "right" ? rightOpen : leftOpen && rightOpen;
            const isHighlighted =
                (highlightOutcome === "tulipLeft" && tulip.id === "left") ||
                (highlightOutcome === "tulipRight" && tulip.id === "right") ||
                (highlightOutcome === "tulipCenter" && tulip.id === "center");
            const halfWidth = isOpen ? tulip.openHalfWidth : tulip.closedHalfWidth;
            ctx.fillStyle = isHighlighted ? "#FFD700" : isOpen ? "rgba(100,220,140,0.85)" : "rgba(255,255,255,0.15)";
            ctx.strokeStyle = tulip.id === "center" ? "#FF6B6B" : "rgba(255,255,255,0.6)";
            ctx.lineWidth = tulip.id === "center" ? 2 : 1.4;
            ctx.beginPath();
            ctx.ellipse(tulip.position.x, tulip.position.y, halfWidth, 8, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }

        if (ball) {
            ctx.fillStyle = "#FF6B6B";
            ctx.beginPath();
            ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
            ctx.fill();
        }
    };

    useEffect(() => {
        draw(null, session.leftTulipOpen, session.rightTulipOpen, landedResult?.outcome ?? null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [layout, session.leftTulipOpen, session.rightTulipOpen, landedResult]);

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
            draw(sample, session.leftTulipOpen, session.rightTulipOpen, null);
            if (elapsed < totalMs) {
                rafRef.current = requestAnimationFrame(tick);
            } else {
                rafRef.current = null;
                draw(frames[frames.length - 1], result.leftTulipOpen, result.rightTulipOpen, result.outcome);
                landingTimeoutRef.current = setTimeout(() => {
                    setLandedResult(result);
                    setLaunching(false);
                    onSessionUpdate({
                        ...session,
                        ballsRemaining: result.ballsRemaining,
                        totalPayout: result.totalPayout,
                        leftTulipOpen: result.leftTulipOpen,
                        rightTulipOpen: result.rightTulipOpen,
                    });
                }, LANDING_PAUSE_MS);
            }
        };
        rafRef.current = requestAnimationFrame(tick);
    };

    const resetAfterError = () => {
        clearTimers();
        trajectoryRef.current = null;
        setLaunching(false);
        draw(null, session.leftTulipOpen, session.rightTulipOpen, null);
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
        draw(null, session.leftTulipOpen, session.rightTulipOpen, null);

        try {
            const result = await launch(launchPower);
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
                                {OUTCOME_LABEL[landedResult.outcome]}
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 800, color: "warning.light" }}>
                                {landedResult.payout > 0 ? `+${formatCheddar(landedResult.payout)}` : "—"}
                            </Typography>
                        </Box>
                    )}
                </Box>
            </Box>

            <Box sx={{ px: 2, mt: 2.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "center", mb: 0.5 }}>
                    Launch Power
                </Typography>
                <Slider
                    value={launchPower}
                    onChange={(_, value) => typeof value === "number" && setLaunchPower(value)}
                    min={launchPowerRange.min}
                    max={launchPowerRange.max}
                    disabled={!canLaunch}
                    color="warning"
                    aria-label="Launch power"
                />
            </Box>

            <Box sx={{ textAlign: "center", mt: 1.5 }}>
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
