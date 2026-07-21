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
    drop: (wager: number, dropX: number) => Promise<PlinkoDropResult>;
    onResult?: (result: PlinkoDropResult) => void; // fired once a ball has visually landed
}

// Fallback board dimensions, used only for the very first render before /odds has resolved
// and handed us the real layout - the board redraws against the real thing the moment it
// arrives.
const FALLBACK_CANVAS_WIDTH = 440;
const FALLBACK_CANVAS_HEIGHT = 460;

const FRAME_MS = 1000 / 30; // matches the server's ~30fps trajectory sampling rate
const INDICATOR_PERIOD_MS = 2200; // one full sweep left-to-right-to-left while idle
const POOF_MS = 450; // how long the ball+particle burst takes once a trajectory finishes
const CALLOUT_MS = 1000; // how long the center win/loss callout stays on screen
const MAX_CONCURRENT_BALLS = 10; // mirrors the server's own per-user cap in plinko.ts
const PARTICLE_COUNT = 12;
const CUP_INSET = 2; // gap between adjacent cups
const CUP_CORNER_RADIUS = 6;

interface SessionStats {
    rounds: number;
    wagered: number;
    won: number;
}

interface Particle {
    angle: number;
    speed: number; // px/sec
    radius: number;
}

// One ball's whole lifecycle client-side: "pending" from the instant it's clicked (dropX is
// known, the server hasn't answered yet - drawn immediately, at full opacity, right at the
// drop point, so there's instant visual feedback despite network latency instead of nothing
// showing up until the response lands, and no jarring swap from "a marker" to "a ball" once it
// does land), then "falling" once the real trajectory arrives and starts interpolating, then
// "landed" (a brief poof of the ball shrinking away while particles burst outward at its
// resting spot) before it's removed entirely. Lives in a plain ref (not React state) since
// it's driven by a 60fps rAF loop - re-rendering on every frame for this would be wasteful, so
// only the one-time phase transitions below ever touch React state
// (stats/callouts/active-count).
type ActiveBall =
    | { id: number; phase: "pending"; dropX: number }
    | { id: number; phase: "falling"; result: PlinkoDropResult; startTime: number }
    | { id: number; phase: "landed"; result: PlinkoDropResult; landedAt: number; particles: Particle[] };

interface Callout {
    id: number;
    multiplier: number;
    payout: number;
    won: boolean;
}

let nextBallId = 0;
let nextCalloutId = 0;

function makeParticles(): Particle[] {
    return Array.from({ length: PARTICLE_COUNT }, () => ({
        angle: Math.random() * Math.PI * 2,
        speed: 50 + Math.random() * 70,
        radius: 1.5 + Math.random() * 2,
    }));
}

/**
 * The reusable Plinko board - the canvas analog of SlotMachine/ScratchCard for this game.
 * Purely presentational: knows nothing about the backend route or how a drop is decided -
 * it's handed the real board geometry (from the server, so it draws exactly what the physics
 * sim ran against), a per-slot multiplier table for the cup labels, and a `drop` function
 * that resolves with the real (server-simulated) trajectory once wagered.
 *
 * Multiple balls can be in flight at once - `drop` is fired independently per click (not
 * gated on any previous drop resolving), and every active ball animates concurrently off a
 * single shared rAF loop. The aim marker never freezes for an in-flight ball; it keeps
 * gliding continuously so the next drop can be aimed while earlier ones are still falling.
 *
 * The one interactive element beyond the wager/drop button is that aim marker - wherever it
 * is the instant "Drop Ball" is clicked becomes that ball's own `dropX`, a genuine physics
 * input the server's real ball actually falls from. Everything after that - the fall itself -
 * is a real matter-js simulation on the server; the client only replays the returned
 * trajectory samples via plain requestAnimationFrame interpolation, same as every other
 * physics-backed game in this app (see PachinkoBoard.tsx).
 */
export default function PlinkoBoard({ betOptions, betLabels, defaultBet, layout, multipliers, drop, onResult }: PlinkoBoardProps) {
    const [wager, setWager] = useState(defaultBet ?? betOptions[0]);
    const [activeCount, setActiveCount] = useState(0); // mirrors activeBallsRef.current.size for rendering
    const [callouts, setCallouts] = useState<Callout[]>([]);
    const [stats, setStats] = useState<SessionStats>({ rounds: 0, wagered: 0, won: 0 });
    // Mirrors indicatorXRef's "has a real value yet" state as an actual re-render trigger -
    // the ref itself is written 60x/second by the idle animation below and reading it alone
    // wouldn't ever re-enable the Drop button once the layout first arrives (ref writes
    // don't cause re-renders).
    const [indicatorReady, setIndicatorReady] = useState(false);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const rafRef = useRef<number | null>(null);
    const indicatorXRef = useRef<number | null>(null); // current aim marker x - read at click time as dropX
    const activeBallsRef = useRef<Map<number, ActiveBall>>(new Map());

    const canvasWidth = layout?.canvasWidth ?? FALLBACK_CANVAS_WIDTH;
    const canvasHeight = layout?.canvasHeight ?? FALLBACK_CANVAS_HEIGHT;

    // Draws the static peg field, one cup per landing slot (with its multiplier permanently
    // shown inside, highlighted while a ball is poofing there), the live aim marker, every
    // currently-falling ball, and every currently-poofing ball's shrinking remnant + particles.
    const draw = (now: number, hotSlots: Set<number>) => {
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

        // Cup pockets - one per landing slot. The multiplier itself is drawn rotated 90°, in
        // the margin strip below the pocket rather than packed horizontally inside it - 13
        // narrow cup columns sharing a horizontal string ("2.48x") was cramped, especially
        // once the canvas is scaled down to fit a phone screen; the vertical margin below
        // slotFloorY has more room to spare than each cup's own width does.
        for (let slot = 0; slot < multipliers.length; slot++) {
            const left = layout.slotBoundaries[slot] + CUP_INSET;
            const right = layout.slotBoundaries[slot + 1] - CUP_INSET;
            const top = layout.boardBottom;
            const bottom = layout.slotFloorY;
            const centerX = (left + right) / 2;
            const isDead = multipliers[slot] === 0;
            const isHot = hotSlots.has(slot);

            ctx.beginPath();
            ctx.roundRect(left, top, right - left, bottom - top, [0, 0, CUP_CORNER_RADIUS, CUP_CORNER_RADIUS]);
            ctx.fillStyle = isHot ? "rgba(255,215,0,0.35)" : isDead ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.08)";
            ctx.fill();
            ctx.strokeStyle = isHot ? "#FFD700" : "rgba(255,255,255,0.25)";
            ctx.lineWidth = isHot ? 2 : 1;
            ctx.stroke();

            ctx.save();
            ctx.translate(centerX, (bottom + canvasHeight) / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillStyle = isDead ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.85)";
            ctx.font = isHot ? "bold 11px sans-serif" : "11px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(`${multipliers[slot]}x`, 0, 0);
            ctx.restore();
        }

        // A triangle + dashed guide line down to the peg field, at a given x and color.
        const drawMarker = (x: number, color: string) => {
            ctx.strokeStyle = "rgba(255,255,255,0.15)";
            ctx.setLineDash([3, 4]);
            ctx.beginPath();
            ctx.moveTo(x, layout.dropY + 6);
            ctx.lineTo(x, layout.boardTop);
            ctx.stroke();
            ctx.setLineDash([]);

            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(x, layout.dropY + 6);
            ctx.lineTo(x - 5, layout.dropY - 4);
            ctx.lineTo(x + 5, layout.dropY - 4);
            ctx.closePath();
            ctx.fill();
        };

        // One ball per still-pending click, appearing immediately (full opacity, no fade-in -
        // "immediately" means immediately) right at the exact x/y it'll actually fall from.
        // Same shape/color/position the real falling ball takes over from, so there's no
        // jarring swap once the trajectory actually arrives - it just keeps going from a ball
        // that was already sitting there.
        for (const ball of activeBallsRef.current.values()) {
            if (ball.phase === "pending") {
                ctx.fillStyle = "#FF6B6B";
                ctx.beginPath();
                ctx.arc(ball.dropX, layout.dropY, layout.ballRadius, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        for (const ball of activeBallsRef.current.values()) {
            if (ball.phase === "falling") {
                const lastIndex = ball.result.trajectory.length - 1;
                const rawIndex = Math.max(0, (now - ball.startTime) / FRAME_MS);
                const index = Math.min(lastIndex, rawIndex);
                const i0 = Math.floor(index);
                const frac = index - i0;
                const s0 = ball.result.trajectory[i0];
                const s1 = ball.result.trajectory[Math.min(lastIndex, i0 + 1)];
                const x = s0.x + (s1.x - s0.x) * frac;
                const y = s0.y + (s1.y - s0.y) * frac;
                ctx.fillStyle = "#FF6B6B";
                ctx.beginPath();
                ctx.arc(x, y, layout.ballRadius, 0, Math.PI * 2);
                ctx.fill();
            } else if (ball.phase === "landed") {
                const final = ball.result.trajectory[ball.result.trajectory.length - 1];
                const t = Math.min(1, (now - ball.landedAt) / POOF_MS);

                // The ball itself shrinks and fades as it "settles into" the cup...
                const remainingRadius = layout.ballRadius * (1 - t);
                if (remainingRadius > 0.3) {
                    ctx.fillStyle = `rgba(255,107,107,${1 - t})`;
                    ctx.beginPath();
                    ctx.arc(final.x, final.y, remainingRadius, 0, Math.PI * 2);
                    ctx.fill();
                }

                // ...while a burst of particles poofs outward from the same spot.
                const won = ball.result.payout > 0;
                for (const particle of ball.particles) {
                    const dist = particle.speed * (t * (POOF_MS / 1000));
                    const px = final.x + Math.cos(particle.angle) * dist;
                    const py = final.y + Math.sin(particle.angle) * dist;
                    const alpha = 1 - t;
                    ctx.fillStyle = won ? `rgba(255,215,0,${alpha})` : `rgba(200,200,200,${alpha * 0.6})`;
                    ctx.beginPath();
                    ctx.arc(px, py, particle.radius, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // The live aim marker - drawn last so it always renders above any ball beneath it
        // (including a just-clicked pending ball at the same spot) - always gliding, never
        // frozen (a ball in flight doesn't stop the next one from being aimed).
        if (indicatorXRef.current !== null) {
            drawMarker(indicatorXRef.current, "#FFC107");
        }
    };

    // One persistent loop for the whole board's lifetime (once the real layout has arrived):
    // advances the idle marker, interpolates every falling ball's position, promotes any ball
    // whose trajectory just finished into its poof phase (firing the one-time stats/callout
    // side effects exactly once via landedAt), and retires any ball whose poof has finished.
    useEffect(() => {
        if (!layout) {
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

            const hotSlots = new Set<number>();
            const toRemove: number[] = [];
            for (const ball of activeBallsRef.current.values()) {
                if (ball.phase === "falling") {
                    const lastIndex = ball.result.trajectory.length - 1;
                    const elapsedFrames = (now - ball.startTime) / FRAME_MS;
                    if (elapsedFrames >= lastIndex) {
                        const { result } = ball;
                        // Replaces this id's map entry (safe to do mid-iteration - it's a
                        // value swap on an already-visited key, not an insertion).
                        activeBallsRef.current.set(ball.id, { id: ball.id, phase: "landed", result, landedAt: now, particles: makeParticles() });
                        setStats((prev) => ({ ...prev, won: prev.won + result.payout }));
                        const calloutId = nextCalloutId++;
                        setCallouts((prev) => [...prev, { id: calloutId, multiplier: result.multiplier, payout: result.payout, won: result.payout > 0 }]);
                        setTimeout(() => setCallouts((prev) => prev.filter((c) => c.id !== calloutId)), CALLOUT_MS);
                        onResult?.(result);
                    }
                } else if (ball.phase === "landed") {
                    if (now - ball.landedAt >= POOF_MS) {
                        toRemove.push(ball.id);
                    } else {
                        hotSlots.add(ball.result.slot);
                    }
                }
                // "pending" balls have nothing to advance here - they just contribute their
                // frozen marker via draw() until handleDrop promotes them to "falling".
            }
            if (toRemove.length > 0) {
                for (const id of toRemove) {
                    activeBallsRef.current.delete(id);
                }
                setActiveCount(activeBallsRef.current.size);
            }

            draw(now, hotSlots);
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
    }, [layout]);

    const canDrop = wager > 0 && !!layout && indicatorReady && activeCount < MAX_CONCURRENT_BALLS;

    const handleDrop = async () => {
        if (!canDrop || indicatorXRef.current === null) {
            return;
        }
        const dropX = indicatorXRef.current;
        const id = nextBallId++;
        // Inserted synchronously, before the request even goes out - this is what gives
        // instant feedback at the exact click position, independent of however long the
        // server round-trip takes (see the "pending" case in draw()).
        activeBallsRef.current.set(id, { id, phase: "pending", dropX });
        setActiveCount((c) => c + 1);
        setStats((prev) => ({ ...prev, rounds: prev.rounds + 1, wagered: prev.wagered + wager }));

        try {
            const result = await drop(wager, dropX);
            activeBallsRef.current.set(id, { id, phase: "falling", result, startTime: performance.now() });
        } catch {
            // The caller's own mutation already surfaces the error (e.g. a toast) - this ball
            // never actually started falling, so just release the slot it reserved.
            activeBallsRef.current.delete(id);
            setActiveCount((c) => c - 1);
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

                    {callouts.map((callout) => (
                        <Box
                            key={callout.id}
                            sx={{
                                position: "absolute",
                                top: "50%",
                                left: "50%",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                bgcolor: "#0d0d0d",
                                border: "2px solid",
                                borderColor: callout.won ? "#FFD700" : "grey.700",
                                borderRadius: 1,
                                px: 2,
                                py: 0.75,
                                pointerEvents: "none",
                                animation: `plinkoCalloutPop ${CALLOUT_MS}ms ease-out`,
                                "@keyframes plinkoCalloutPop": {
                                    "0%": { opacity: 0, transform: "translate(-50%, -50%) scale(0.7)" },
                                    "15%": { opacity: 1, transform: "translate(-50%, -50%) scale(1.1)" },
                                    "30%": { transform: "translate(-50%, -50%) scale(1)" },
                                    "80%": { opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
                                    "100%": { opacity: 0, transform: "translate(-50%, -50%) scale(0.9)" },
                                },
                            }}
                        >
                            <Typography variant="h6" sx={{ fontWeight: 800, color: callout.won ? "success.light" : "grey.300" }}>
                                {callout.multiplier}x
                            </Typography>
                            <Typography variant="body1" sx={{ fontWeight: 800, color: "warning.light" }}>
                                {callout.payout > 0 ? `+${formatCheddar(callout.payout)}` : "Lose"}
                            </Typography>
                        </Box>
                    ))}
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
                    <ToggleButton key={amount} value={amount} sx={{ px: 2, fontWeight: 700, textTransform: "none" }}>
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
                    {activeCount >= MAX_CONCURRENT_BALLS ? "Max balls in flight" : `Drop Ball (${formatCheddar(wager)})`}
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
