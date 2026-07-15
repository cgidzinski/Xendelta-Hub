import { useEffect, useLayoutEffect, useRef } from "react";
import { Box, Button, Typography, useMediaQuery, useTheme } from "@mui/material";
import { formatCheddar } from "../utils/currency";

export interface ScratchPlayResult {
    totalPayout: number;
    balance: string;
}

export interface ScratchCardProps {
    price: number; // THIS ticket's fixed price
    isPending: boolean; // network request in flight
    result: ScratchPlayResult | null; // the current ticket's already-decided outcome, or null before buying
    checked: boolean; // whether Check Ticket has been pressed for the current ticket
    onBuy: () => void; // buy (or buy another) ticket
}

const BRUSH_SIZE = 16; // small square dab, not a soft circle
const MOBILE_ASPECT_RATIO = "9 / 16"; // desktop mirrors the phone-shaped fill mobile gets for free

interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    life: number;
    maxLife: number;
    color: string;
}

const PARTICLE_COLORS = ["#c9ced3", "#aab0b8", "#8f97a1", "#e4e7ea"];
const GRAVITY = 0.00035; // px/ms^2

/**
 * The reusable scratch-off engine every ticket page renders - the scratch-off analog of
 * SlotMachine. Purely presentational + interaction: knows nothing about a specific ticket's
 * odds or backend route - `result`/`checked` are controlled by the parent page (which also
 * places the Check Ticket action in the modal's header bar), this component just owns the
 * canvas/particle mechanics and fills whatever space it's given: the entire screen on
 * mobile, a same-aspect-ratio boxed card on desktop.
 *
 * Scratching reveals the real, already-decided outcome underneath as you go - no mystery
 * layer. Check Ticket (in the header) instantly finishes the reveal and stamps a clear
 * win/lose verdict banner on top, the one definitive "did I win" moment.
 */
export default function ScratchCard({ price, isPending, result, checked, onBuy }: ScratchCardProps) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

    const containerRef = useRef<HTMLDivElement | null>(null);
    const foilCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const particleCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const drawingRef = useRef(false);
    const lastPointRef = useRef<{ x: number; y: number } | null>(null);
    const particlesRef = useRef<Particle[]>([]);
    const animationRef = useRef<number | null>(null);
    const lastFrameTimeRef = useRef<number | null>(null);

    const paintFoil = (width: number, height: number) => {
        const canvas = foilCanvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx || width === 0 || height === 0) {
            return;
        }
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, "#9aa3ad");
        gradient.addColorStop(0.5, "#d7dbe0");
        gradient.addColorStop(1, "#9aa3ad");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = "rgba(255,255,255,0.25)";
        ctx.lineWidth = 6;
        for (let x = -height; x < width; x += 18) {
            ctx.beginPath();
            ctx.moveTo(x, height);
            ctx.lineTo(x + height, 0);
            ctx.stroke();
        }

        ctx.fillStyle = "rgba(60,60,60,0.55)";
        ctx.font = "700 20px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("SCRATCH HERE", width / 2, height / 2);
    };

    // Measures the container and paints both canvases at that resolution, all
    // synchronously (imperative DOM writes, not React state) so it can run inside a layout
    // effect and land before the browser ever paints a frame.
    const resizeAndPaint = () => {
        const container = containerRef.current;
        const foil = foilCanvasRef.current;
        const particle = particleCanvasRef.current;
        if (!container) {
            return;
        }
        const rect = container.getBoundingClientRect();
        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));
        if (foil) {
            foil.width = width;
            foil.height = height;
            paintFoil(width, height);
        }
        if (particle) {
            particle.width = width;
            particle.height = height;
        }
    };

    // A fresh ticket gets measured and fully foil-painted before the browser paints - no
    // frame where the real result underneath is visible unpainted.
    useLayoutEffect(() => {
        if (result) {
            particlesRef.current = [];
            resizeAndPaint();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [result]);

    // Keep the foil correctly sized (and repainted) across real container resizes too.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) {
            return;
        }
        const observer = new ResizeObserver(() => {
            if (result) {
                resizeAndPaint();
            }
        });
        observer.observe(el);
        return () => observer.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [result]);

    // Check Ticket (owned by the parent/header) finishes the reveal instantly.
    useEffect(() => {
        const canvas = foilCanvasRef.current;
        if (checked && canvas) {
            const ctx = canvas.getContext("2d");
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
        }
    }, [checked]);

    useEffect(
        () => () => {
            if (animationRef.current !== null) {
                cancelAnimationFrame(animationRef.current);
            }
        },
        []
    );

    const spawnParticles = (x: number, y: number) => {
        for (let i = 0; i < 3; i++) {
            particlesRef.current.push({
                x,
                y,
                vx: (Math.random() - 0.5) * 0.35,
                vy: -Math.random() * 0.3 - 0.05,
                size: 2 + Math.random() * 3,
                life: 0,
                maxLife: 350 + Math.random() * 250,
                color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
            });
        }
        if (animationRef.current === null) {
            lastFrameTimeRef.current = null;
            animationRef.current = requestAnimationFrame(tickParticles);
        }
    };

    const tickParticles = (timestamp: number) => {
        const canvas = particleCanvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx) {
            animationRef.current = null;
            return;
        }
        const last = lastFrameTimeRef.current ?? timestamp;
        const dt = timestamp - last;
        lastFrameTimeRef.current = timestamp;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particlesRef.current = particlesRef.current.filter((p) => p.life < p.maxLife);
        for (const p of particlesRef.current) {
            p.vy += GRAVITY * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.life += dt;
            const alpha = Math.max(0, 1 - p.life / p.maxLife);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
        ctx.globalAlpha = 1;

        if (particlesRef.current.length > 0) {
            animationRef.current = requestAnimationFrame(tickParticles);
        } else {
            animationRef.current = null;
            lastFrameTimeRef.current = null;
        }
    };

    // Square dabs stepped along the drag segment (not a soft round stroke) so the scratch
    // reads as chipped-off foil bits, not a blurred half-alpha smear.
    const erase = (x0: number, y0: number, x1: number, y1: number) => {
        const ctx = foilCanvasRef.current?.getContext("2d");
        if (!ctx) {
            return;
        }
        ctx.globalCompositeOperation = "destination-out";
        ctx.globalAlpha = 1;
        const dist = Math.hypot(x1 - x0, y1 - y0);
        const steps = Math.max(1, Math.ceil(dist / (BRUSH_SIZE / 2)));
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = x0 + (x1 - x0) * t;
            const y = y0 + (y1 - y0) * t;
            ctx.fillRect(Math.round(x - BRUSH_SIZE / 2), Math.round(y - BRUSH_SIZE / 2), BRUSH_SIZE, BRUSH_SIZE);
            if (i % 2 === 0) {
                spawnParticles(x, y);
            }
        }
    };

    const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (checked) {
            return;
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        drawingRef.current = true;
        const point = pointFromEvent(e);
        lastPointRef.current = point;
        erase(point.x, point.y, point.x, point.y);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!drawingRef.current || checked) {
            return;
        }
        const point = pointFromEvent(e);
        const from = lastPointRef.current ?? point;
        erase(from.x, from.y, point.x, point.y);
        lastPointRef.current = point;
    };

    const handlePointerUp = () => {
        drawingRef.current = false;
        lastPointRef.current = null;
    };

    return (
        <Box
            sx={{
                width: "100%",
                height: isMobile ? "100%" : "auto",
                flex: isMobile ? 1 : "0 0 auto",
                minHeight: 0,
                display: "flex",
                justifyContent: "center",
                alignItems: isMobile ? "stretch" : "center",
                p: isMobile ? 0 : 2,
            }}
        >
            <Box
                ref={containerRef}
                sx={{
                    position: "relative",
                    overflow: "hidden",
                    bgcolor: "background.paper",
                    ...(isMobile
                        ? { width: "100%", height: "100%" }
                        : {
                              width: "100%",
                              maxWidth: 420,
                              aspectRatio: MOBILE_ASPECT_RATIO,
                              maxHeight: "75vh",
                              borderRadius: 3,
                              border: "3px solid",
                              borderColor: "warning.main",
                              boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
                          }),
                }}
            >
                {/* Generic bottom layer: the real outcome, visible wherever the foil comes off */}
                <Box
                    sx={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 1,
                        background: result
                            ? result.totalPayout > 0
                                ? "linear-gradient(180deg, rgba(46,125,50,0.25) 0%, rgba(0,0,0,0.1) 100%)"
                                : "linear-gradient(180deg, rgba(97,97,97,0.25) 0%, rgba(0,0,0,0.1) 100%)"
                            : "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, rgba(0,0,0,0.15) 100%)",
                    }}
                >
                    {result ? (
                        <>
                            <Typography variant="h2" sx={{ lineHeight: 1 }}>
                                {result.totalPayout > 0 ? "🎉" : "😢"}
                            </Typography>
                            <Typography variant="h5" sx={{ fontWeight: 800 }} color={result.totalPayout > 0 ? "success.main" : "text.secondary"}>
                                {result.totalPayout > 0 ? `+${formatCheddar(result.totalPayout)} cheddar` : "No win this time"}
                            </Typography>
                        </>
                    ) : (
                        <Typography variant="h3" sx={{ opacity: 0.3 }}>
                            🎟️
                        </Typography>
                    )}
                </Box>

                {/* Generic top layer: the scratch-off foil, erased via drag. A layout effect
                    measures the container and paints this synchronously before the browser
                    ever paints, so the real outcome above is never visible unpainted - no CSS
                    background trick needed (that would also block the reveal once cleared). */}
                {result && (
                    <canvas
                        ref={foilCanvasRef}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerLeave={handlePointerUp}
                        style={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            touchAction: "none",
                            cursor: checked ? "default" : "crosshair",
                        }}
                    />
                )}

                {/* Transient scratch debris - never intercepts pointer events */}
                {result && (
                    <canvas
                        ref={particleCanvasRef}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
                    />
                )}

                {/* The verdict: only appears once Check Ticket is pressed, on top of everything */}
                {checked && result && (
                    <Box
                        sx={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            textAlign: "center",
                            gap: 0.5,
                            px: 3,
                            bgcolor: "rgba(0,0,0,0.55)",
                            animation: "scratchVerdictIn 0.25s ease-out",
                            "@keyframes scratchVerdictIn": {
                                "0%": { opacity: 0, transform: "scale(0.85)" },
                                "100%": { opacity: 1, transform: "scale(1)" },
                            },
                        }}
                    >
                        <Typography variant="h3" sx={{ lineHeight: 1 }}>
                            {result.totalPayout > 0 ? "🎉" : "😢"}
                        </Typography>
                        <Typography variant="h4" sx={{ fontWeight: 800, color: result.totalPayout > 0 ? "success.light" : "grey.300" }}>
                            {result.totalPayout > 0 ? `You won ${formatCheddar(result.totalPayout)} cheddar!` : "No win this time"}
                        </Typography>
                        <Button
                            variant="contained"
                            color="error"
                            size="large"
                            onClick={onBuy}
                            disabled={isPending}
                            sx={{ mt: 2, borderRadius: 999, px: 5, py: 1.1, fontWeight: 800 }}
                        >
                            {isPending ? "Buying…" : `Buy Another Ticket (${formatCheddar(price)})`}
                        </Button>
                    </Box>
                )}

                {/* Buy Ticket: the only control before a ticket exists */}
                {!result && (
                    <Box sx={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Button
                            variant="contained"
                            color="error"
                            size="large"
                            onClick={onBuy}
                            disabled={isPending}
                            sx={{ borderRadius: 999, px: 6, py: 1.25, fontWeight: 800, fontSize: "1.05rem" }}
                        >
                            {isPending ? "Buying…" : `Buy Ticket (${formatCheddar(price)})`}
                        </Button>
                    </Box>
                )}
            </Box>
        </Box>
    );
}
