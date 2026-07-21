import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Box, Button, Typography, useMediaQuery, useTheme } from "@mui/material";
import { formatCheddar } from "../utils/currency";

// Every ticket has a wildly different result shape (Kitty Scratch: just a prize; Crossword: a
// grid/letters/found-words) - ScratchCard only ever needs `totalPayout`/`balance` off of it,
// everything else is opaque and handed straight to the ticket's own `renderDynamicLayer`.
export interface ScratchPlayResultBase {
    totalPayout: number;
    balance: string;
}

export interface ScratchCardProps<TResult extends ScratchPlayResultBase> {
    price: number; // THIS ticket's fixed price
    isPending: boolean; // network request in flight
    result: TResult | null; // the current ticket's already-decided outcome, or null before buying
    checked: boolean; // whether Check Ticket has been pressed for the current ticket
    onBuy: () => void; // buy (or buy another) ticket
    backgroundImageSrc: string; // static premade background, always drawn full-bleed underneath everything
    renderDynamicLayer: (result: TResult) => ReactNode; // outcome-dependent content, on top of the background
    topImageSrc: string; // the foil texture that gets scratched off
    renderVerdictDetails?: (result: TResult) => ReactNode; // ticket-specific "what won" breakdown, shown in the verdict banner
}

const BRUSH_SIZE = 16; // diameter of the round scratch dab
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
const WIN_PARTICLE_COLORS = ["#FFD700", "#FF6B6B", "#4ECDC4", "#95E1D3", "#F38181", "#AA96DA"];
const GRAVITY = 0.00035; // px/ms^2

/**
 * The reusable scratch-off engine every ticket page renders - the scratch-off analog of
 * SlotMachine. Every ticket is composed of exactly three layers, in this order, and this
 * component owns the composition of all three:
 *   1. `backgroundImageSrc` - static premade background, drawn full-bleed.
 *   2. `renderDynamicLayer(result)` - the outcome-dependent content, ticket-owned.
 *   3. `topImageSrc` - the foil, drawn onto a canvas and scratched off via drag.
 * `result`/`checked` are controlled by the parent page (which also places the Check Ticket
 * action in the modal's header bar) - this component just owns the layer composition plus
 * the canvas/particle scratch mechanics, and fills whatever space it's given: the entire
 * screen on mobile, a same-aspect-ratio boxed card on desktop.
 *
 * Scratching reveals the real, already-decided outcome underneath as you go - no mystery
 * layer. Check Ticket (in the header) instantly finishes the reveal and stamps a clear
 * win/lose verdict banner on top, the one definitive "did I win" moment.
 */
export default function ScratchCard<TResult extends ScratchPlayResultBase>({
    price,
    isPending,
    result,
    checked,
    onBuy,
    backgroundImageSrc,
    renderDynamicLayer,
    topImageSrc,
    renderVerdictDetails,
}: ScratchCardProps<TResult>) {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

    const frameRef = useRef<HTMLDivElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const foilCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const particleCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const foilImageRef = useRef<HTMLImageElement | null>(null);
    const [foilImageLoaded, setFoilImageLoaded] = useState(false);
    const [mobileCardSize, setMobileCardSize] = useState<{ width: number; height: number } | null>(null);
    const [verdictDismissed, setVerdictDismissed] = useState(false);
    const drawingRef = useRef(false);
    const lastPointRef = useRef<{ x: number; y: number } | null>(null);
    const particlesRef = useRef<Particle[]>([]);
    const animationRef = useRef<number | null>(null);
    const lastFrameTimeRef = useRef<number | null>(null);

    // Every visible child of the card is position:absolute, so the card box itself has no
    // normal-flow content to derive a size from - pure CSS (aspect-ratio + max-width/height
    // alone) collapses it to 0x0 on mobile. Measure the available space in JS instead and
    // compute an exact contain-fit (never cropped, letterboxed on whichever axis has slack).
    useEffect(() => {
        if (!isMobile) {
            return;
        }
        const el = frameRef.current;
        if (!el) {
            return;
        }
        const CARD_RATIO = 9 / 16; // width / height
        const measure = () => {
            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) {
                return;
            }
            const width = Math.min(rect.width, rect.height * CARD_RATIO);
            setMobileCardSize({ width, height: width / CARD_RATIO });
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(el);
        return () => observer.disconnect();
    }, [isMobile]);

    // Preload the foil image as soon as the ticket's src is known (well before the browser
    // paints a scratch canvas for a real result) so `paintFoil` almost never has to fall back
    // to the solid-color placeholder below.
    useEffect(() => {
        setFoilImageLoaded(false);
        foilImageRef.current = null;
        const img = new Image();
        img.onload = () => {
            foilImageRef.current = img;
            setFoilImageLoaded(true);
        };
        img.src = topImageSrc;
        return () => {
            img.onload = null;
        };
    }, [topImageSrc]);

    const paintFoil = (width: number, height: number) => {
        const canvas = foilCanvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx || width === 0 || height === 0) {
            return;
        }
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
        ctx.clearRect(0, 0, width, height);
        const img = foilImageRef.current;
        if (img) {
            // Same "object-fit: cover" behavior as the plain <img> shown before a ticket
            // exists (crop to fill, preserve aspect ratio) rather than a naive stretch-to-fit
            // - otherwise the foil visibly shifts/distorts the instant a ticket is bought and
            // this canvas replaces that <img>. Preserves the image's own per-pixel alpha as-is
            // (including any mixed opaque/semi-transparent tint areas) - destination-out
            // erasing on top of that works with no special handling.
            const imgRatio = img.naturalWidth / img.naturalHeight;
            const boxRatio = width / height;
            let sx = 0;
            let sy = 0;
            let sw = img.naturalWidth;
            let sh = img.naturalHeight;
            if (imgRatio > boxRatio) {
                sw = img.naturalHeight * boxRatio;
                sx = (img.naturalWidth - sw) / 2;
            } else {
                sh = img.naturalWidth / boxRatio;
                sy = (img.naturalHeight - sh) / 2;
            }
            ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
        } else {
            // Image hasn't finished loading yet (rare - preloaded on mount) - a safe fully
            // opaque fallback so the real result never shows through unpainted.
            ctx.fillStyle = "#9aa3ad";
            ctx.fillRect(0, 0, width, height);
        }
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

    // The canvas is always mounted (idle, pending, or active) and always painted fully
    // opaque here - before a ticket exists, before a new one arrives, and the instant a new
    // buy *starts* (isPending flipping true), so a previous ticket's scratched-away holes are
    // covered again immediately rather than staying visible while the new one is in flight.
    // Runs in a layout effect so this lands before the browser ever paints a frame.
    useLayoutEffect(() => {
        particlesRef.current = [];
        resizeAndPaint();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [result, foilImageLoaded, isPending]);

    // Keep the foil correctly sized (and repainted) across real container resizes too.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) {
            return;
        }
        const observer = new ResizeObserver(() => resizeAndPaint());
        observer.observe(el);
        return () => observer.disconnect();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Check Ticket (owned by the parent/header) finishes the reveal instantly.
    useEffect(() => {
        const canvas = foilCanvasRef.current;
        if (checked && canvas) {
            const ctx = canvas.getContext("2d");
            ctx?.clearRect(0, 0, canvas.width, canvas.height);
        }
    }, [checked]);

    // A dismissed verdict banner should only stay dismissed for *this* ticket - a fresh one
    // (new `result`) always gets to show its own banner again.
    useEffect(() => {
        setVerdictDismissed(false);
    }, [result]);

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

    // A bigger, brighter, falling burst - visually distinct from the small gray scratch-debris
    // puffs above - reusing the exact same particle canvas/animation loop, just a different
    // spawn shape (many more particles, wider color set, falling from just above the card
    // instead of radiating from a scratch point).
    const spawnWinCelebration = () => {
        const canvas = particleCanvasRef.current;
        if (!canvas) {
            return;
        }
        const width = canvas.width || 1;
        for (let i = 0; i < 50; i++) {
            particlesRef.current.push({
                x: Math.random() * width,
                y: -10 - Math.random() * 40,
                vx: (Math.random() - 0.5) * 0.25,
                vy: Math.random() * 0.15,
                size: 4 + Math.random() * 4,
                life: 0,
                maxLife: 1400 + Math.random() * 800,
                color: WIN_PARTICLE_COLORS[Math.floor(Math.random() * WIN_PARTICLE_COLORS.length)],
            });
        }
        if (animationRef.current === null) {
            lastFrameTimeRef.current = null;
            animationRef.current = requestAnimationFrame(tickParticles);
        }
    };

    // Fires exactly once per newly-revealed win: `checked` transitioning to true (Check
    // Ticket) with a present, non-pending, winning result. Buying a new ticket resets
    // `checked` to false before this could re-fire, and dismissing/reopening the verdict
    // banner doesn't touch `checked`/`result`/`isPending` at all, so neither re-triggers it.
    useEffect(() => {
        if (checked && result && !isPending && result.totalPayout > 0) {
            spawnWinCelebration();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [checked, result, isPending]);

    // Round dabs stepped along the drag segment, full-alpha (not a soft blurred stroke) so
    // the scratch still reads as chipped-off foil, just circular chips instead of square ones.
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
            ctx.beginPath();
            ctx.arc(x, y, BRUSH_SIZE / 2, 0, Math.PI * 2);
            ctx.fill();
            if (i % 2 === 0) {
                spawnParticles(x, y);
            }
        }
    };

    const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const canScratch = Boolean(result) && !isPending && !checked;

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!canScratch) {
            return;
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        drawingRef.current = true;
        const point = pointFromEvent(e);
        lastPointRef.current = point;
        erase(point.x, point.y, point.x, point.y);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!drawingRef.current || !canScratch) {
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
                // Always centered (never stretched) - the card below is a fixed ratio on
                // every device now, so any leftover space is a deliberate letterbox, not
                // something to stretch away.
                alignItems: "center",
                p: isMobile ? 0 : 2,
            }}
            ref={frameRef}
        >
            <Box
                ref={containerRef}
                sx={{
                    position: "relative",
                    overflow: "hidden",
                    bgcolor: "background.paper",
                    aspectRatio: MOBILE_ASPECT_RATIO,
                    // Every visible child here is position:absolute, so this box has no
                    // normal-flow content to size itself from - CSS aspect-ratio alone
                    // (max-width/max-height with no explicit width/height) collapses it to
                    // 0x0. On mobile, `mobileCardSize` is measured in JS (see the effect
                    // above) and gives an exact contain-fit pixel size instead; until that
                    // first measurement lands, fall back to a rule that at least renders
                    // something (letterboxed via height, capped via maxWidth) rather than
                    // nothing.
                    ...(isMobile
                        ? mobileCardSize
                            ? { width: `${mobileCardSize.width}px`, height: `${mobileCardSize.height}px` }
                            : { height: "100%", width: "auto", maxWidth: "100%" }
                        : {
                              width: "100%",
                              maxWidth: 420,
                              maxHeight: "75vh",
                              borderRadius: 3,
                              border: "3px solid",
                              borderColor: "warning.main",
                              boxShadow: "0 12px 32px rgba(0,0,0,0.4)",
                          }),
                }}
            >
                {/* Layer 1: background - static premade image, always full-bleed underneath
                    everything. Owned entirely by ScratchCard - a ticket never renders its own
                    background. */}
                <Box
                    component="img"
                    src={backgroundImageSrc}
                    alt=""
                    sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />

                {/* Layer 2: dynamic - the outcome-dependent content, 100% ticket-owned. Could
                    be a handful of positioned glyphs or a fully generated grid - ScratchCard
                    has zero knowledge of which. Nothing to generate before a ticket exists -
                    and while a new ticket is being bought (including "Buy Another Ticket"),
                    treat it the same as not having one yet, so the *previous* ticket's already-
                    revealed content never flashes on screen while the new one is in flight. */}
                {result && !isPending && <Box sx={{ position: "absolute", inset: 0 }}>{renderDynamicLayer(result)}</Box>}

                {/* Layer 3: the scratch-off foil - always this same canvas, always painted
                    from the same preloaded image (see `foilImageRef`/`paintFoil`), whether
                    idle, pending, or active. One decode, one draw call, one DOM node - so
                    there's no second lower-fidelity render of the same image to visibly pop
                    in/out when a ticket is bought. Only *scratchability* changes (`canScratch`),
                    never what's actually painted. */}
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
                        cursor: canScratch ? "crosshair" : "default",
                    }}
                />

                {/* Transient scratch debris (and, on a win, the celebration burst) - never
                    intercepts pointer events. zIndex above the verdict banner below so the
                    win celebration isn't dimmed/smothered by the banner's translucent backing. */}
                {result && !isPending && (
                    <canvas
                        ref={particleCanvasRef}
                        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 2 }}
                    />
                )}

                {/* The verdict: only appears once Check Ticket is pressed, on top of everything -
                    never while a new ticket is already being bought (see layer 2/3 above), and
                    dismissible - closing it just reveals the fully scratched ticket underneath,
                    it doesn't reset `checked` or anything else. */}
                {checked && result && !isPending && !verdictDismissed && (
                    <Box
                        sx={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            zIndex: 1,
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
                        {renderVerdictDetails && (
                            <Box sx={{ maxWidth: "100%", color: "grey.200" }}>{renderVerdictDetails(result)}</Box>
                        )}
                        {/* Purely closes this overlay back to the plain scratched ticket - buying
                            another ticket is the header button's job now (see each ticket
                            page's `headerActions`), not this banner's. */}
                        <Button
                            variant="contained"
                            color="error"
                            size="large"
                            onClick={() => setVerdictDismissed(true)}
                            sx={{ mt: 2, borderRadius: 999, px: 5, py: 1.1, fontWeight: 800 }}
                        >
                            Dismiss
                        </Button>
                    </Box>
                )}

                {/* Buy Ticket: shown before any ticket exists, and also while a new one (first
                    or "another") is in flight, since the verdict banner that normally hosts
                    the buy button is hidden during that window (see layer 2/3 above). A dark
                    radial backdrop sits behind the button so it stays readable against busy,
                    brightly-colored foil art (e.g. Kitty Scratch's grid of colored squares)
                    instead of blending into whatever's directly behind it. */}
                {(!result || isPending) && (
                    <Box
                        sx={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            background: "radial-gradient(circle, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.25) 55%, rgba(0,0,0,0) 75%)",
                        }}
                    >
                        <Button
                            variant="contained"
                            color="error"
                            size="large"
                            onClick={onBuy}
                            disabled={isPending}
                            sx={{
                                borderRadius: 999,
                                px: 6,
                                py: 1.25,
                                fontWeight: 800,
                                fontSize: "1.05rem",
                                border: "2px solid",
                                borderColor: "common.white",
                                boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
                            }}
                        >
                            {isPending ? "Buying…" : `Buy Ticket (${formatCheddar(price)})`}
                        </Button>
                    </Box>
                )}
            </Box>
        </Box>
    );
}
