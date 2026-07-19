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
    channelBottomY: number;
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
}

export interface PachinkoBoardProps {
    session: PachinkoSession | null;
    layout: PachinkoLayoutData | null;
    jackpotPool: number;
    launchPowerRange: { min: number; max: number };
    pricePerBall: number; // needed even when session is null, so reup button costs can show before any batch exists
    isResuming: boolean; // the post-open "resume an existing batch?" check is in flight
    launch: (launchPower: number) => Promise<PachinkoLaunchResult>;
    reup: (balls: number) => Promise<unknown>;
    isReuping: boolean;
    onSessionUpdate: (session: PachinkoSession) => void;
}

const BALL_RADIUS = 3.5; // matches pachinkoLayout.ts's BALL_RADIUS
const PIN_RADIUS = 2.2;
const FRAME_MS = 1000 / 30; // matches the server's ~30fps trajectory sample rate
const POOF_MS = 450; // how long the ball+particle burst takes once a trajectory finishes
const CALLOUT_MS = 1000; // how long the center win/loss callout stays on screen
const FIRE_INTERVAL_MS = 600; // 100 balls/minute while the launch button is held
const MAX_CONCURRENT_BALLS = 8; // client-side cap - narrower oval canvas than Plinko's peg field, so a bit below its MAX_CONCURRENT_BALLS=10
const PARTICLE_COUNT = 12;
const REUP_AMOUNTS = [100, 1000];

const OUTCOME_LABEL: Record<PachinkoOutcome, string> = {
    gutter: "Miss",
    tulipLeft: "Side Tulip!",
    tulipRight: "Side Tulip!",
    tulipCenter: "JACKPOT!",
};

interface Particle {
    angle: number;
    speed: number; // px/sec
    radius: number;
}

interface Callout {
    id: number;
    outcome: PachinkoOutcome;
    payout: number;
    won: boolean;
}

// One ball's whole client-side lifecycle, same shape as PlinkoBoard's ActiveBall: "pending"
// from the instant the launch request goes out (rendered immediately at the launcher so
// there's no dead gap while the server simulates the shot), "falling" once the real
// trajectory comes back and starts interpolating, "landed" (poof + particle burst) before
// it's removed. `seq` on "falling"/"landed" is this ball's own launch order, used so a
// late-arriving response for an earlier-fired ball can never clobber session state a
// later-arriving one already applied (see the tick loop below).
type ActiveBall =
    | { id: number; phase: "pending" }
    | { id: number; phase: "falling"; result: PachinkoLaunchResult; startTime: number; seq: number }
    | { id: number; phase: "landed"; result: PachinkoLaunchResult; landedAt: number; particles: Particle[] };

let nextBallId = 0;
let nextCalloutId = 0;
let nextLaunchSeq = 0;

function makeParticles(): Particle[] {
    return Array.from({ length: PARTICLE_COUNT }, () => ({
        angle: Math.random() * Math.PI * 2,
        speed: 50 + Math.random() * 70,
        radius: 1.5 + Math.random() * 2,
    }));
}

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
 * The reusable Pachinko board - canvas analog of PlinkoBoard, replaying physics trajectories
 * captured server-side. The server decides the whole outcome (a real matter-js simulation
 * driven by the player's own launch power) before any of this runs; this component's only
 * job is to play trajectories back and reflect the session state it's handed.
 *
 * Multiple balls can be in flight at once, same as Plinko: holding the launch button fires
 * one shot immediately and then one every FIRE_INTERVAL_MS while held, and every active ball
 * animates concurrently off a single shared rAF loop (activeBallsRef). Balls, buying, and
 * launching aren't gated behind separate screens - the board (and its +100/+1000 reup
 * buttons) render even before any batch has ever been bought (`session === null`).
 */
export default function PachinkoBoard({ session, layout, jackpotPool, launchPowerRange, pricePerBall, isResuming, launch, reup, isReuping, onSessionUpdate }: PachinkoBoardProps) {
    const [activeCount, setActiveCount] = useState(0); // mirrors activeBallsRef.current.size for rendering
    const [callouts, setCallouts] = useState<Callout[]>([]);
    const [launchPower, setLaunchPower] = useState(() => launchPowerRange.min); // starts at 0, same value the plunger springs back to on release

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const rafRef = useRef<number | null>(null);
    const fireIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const activeBallsRef = useRef<Map<number, ActiveBall>>(new Map());
    const latestAppliedSeqRef = useRef(0); // highest launch seq whose response has actually been applied to session

    // "Latest ref" mirrors of props/state that the persistent rAF loop below needs to read
    // fresh values from without being recreated on every render (it's only ever recreated
    // when `layout` changes, same as PlinkoBoard's own tick effect).
    const sessionRef = useRef(session);
    sessionRef.current = session;
    const launchPowerRef = useRef(launchPower);
    launchPowerRef.current = launchPower;

    // Tracks the ball count used to gate hold-to-fire's self-throttle. Deliberately NOT kept
    // in sync on every render (see the dedicated effect below, keyed only on the server's own
    // ballsRemaining) - fireOnce decrements this optimistically at request time so the
    // interval stops itself right around the true depletion point instead of a couple of
    // round-trips late, and an unconditional per-render resync here would immediately erase
    // that optimism.
    const ballsRemainingRef = useRef(session?.ballsRemaining ?? 0);
    useEffect(() => {
        ballsRemainingRef.current = session?.ballsRemaining ?? 0;
    }, [session?.ballsRemaining]);

    // The plunger's current window-level release listener, if a press is in progress - tracked
    // so it can be torn down on unmount too (see the cleanup effect below), not just on an
    // actual pointerup/pointercancel.
    const plungerReleaseRef = useRef<(() => void) | null>(null);

    const draw = (now: number, hotTulips: Set<PachinkoTulipLayout["id"]>) => {
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

        // Rail/channel decoration - only drawn below channelBottomY, where the field's own
        // boundary curves away and the rail becomes a genuinely separate structure leading
        // down to the launcher. From releasePoint.y to channelBottomY, that same x=400 line is
        // already the field's own right wall (drawn above via the boundary arcs) - filling it
        // a second time here used to visually bury the release deflector nail (which sits
        // just a few px inside that stretch, right where the ball needs an early catch point)
        // under an unrelated "rail" graphic, making it look like a nail stuck inside the
        // launcher mechanism instead of the field.
        ctx.fillStyle = "rgba(255,215,0,0.12)";
        ctx.fillRect(layout.channelInnerX, layout.channelBottomY, layout.channelOuterX - layout.channelInnerX, layout.launcherPosition.y - layout.channelBottomY);
        ctx.strokeStyle = "rgba(255,215,0,0.5)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(layout.channelInnerX, layout.channelBottomY);
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
                ctx.moveTo(windmill.position.x - Math.cos(angle) * windmill.radius, windmill.position.y - Math.sin(angle) * windmill.radius);
                ctx.lineTo(windmill.position.x + Math.cos(angle) * windmill.radius, windmill.position.y + Math.sin(angle) * windmill.radius);
                ctx.stroke();
            }
        }

        // Tulips - open/closed sizing and color are Pachinko-specific and unchanged; the
        // highlight-on-hit treatment now matches Plinko's cups (translucent gold overlay
        // instead of a solid fill), and can apply to more than one tulip at once now that
        // balls can land concurrently (hotTulips is a Set, not a single "last outcome").
        const leftOpen = sessionRef.current?.leftTulipOpen ?? false;
        const rightOpen = sessionRef.current?.rightTulipOpen ?? false;
        for (const tulip of layout.tulips) {
            const isOpen = tulip.id === "left" ? leftOpen : tulip.id === "right" ? rightOpen : leftOpen && rightOpen;
            const isHot = hotTulips.has(tulip.id);
            const halfWidth = isOpen ? tulip.openHalfWidth : tulip.closedHalfWidth;
            ctx.fillStyle = isHot ? "rgba(255,215,0,0.35)" : isOpen ? "rgba(100,220,140,0.85)" : "rgba(255,255,255,0.15)";
            ctx.strokeStyle = isHot ? "#FFD700" : tulip.id === "center" ? "#FF6B6B" : "rgba(255,255,255,0.6)";
            ctx.lineWidth = isHot ? 2 : tulip.id === "center" ? 2 : 1.4;
            ctx.beginPath();
            ctx.ellipse(tulip.position.x, tulip.position.y, halfWidth, 8, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
        }

        // Pending balls - appear instantly at the launcher the moment a shot is fired, same
        // "something shows up immediately" principle as Plinko's pending balls, even though
        // the real trajectory (which starts riding up the rail from here) hasn't come back yet.
        for (const ball of activeBallsRef.current.values()) {
            if (ball.phase === "pending") {
                ctx.fillStyle = "#FF6B6B";
                ctx.beginPath();
                ctx.arc(layout.launcherPosition.x, layout.launcherPosition.y, BALL_RADIUS, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        for (const ball of activeBallsRef.current.values()) {
            if (ball.phase === "falling") {
                const frames = ball.result.trajectory;
                const lastIndex = frames.length - 1;
                if (lastIndex < 0) {
                    continue; // empty trajectory - promoted to landed on the very next tick
                }
                const rawIndex = Math.max(0, (now - ball.startTime) / FRAME_MS);
                const index = Math.min(lastIndex, rawIndex);
                const i0 = Math.floor(index);
                const frac = index - i0;
                const s0 = frames[i0];
                const s1 = frames[Math.min(lastIndex, i0 + 1)];
                const x = s0.x + (s1.x - s0.x) * frac;
                const y = s0.y + (s1.y - s0.y) * frac;
                ctx.fillStyle = "#FF6B6B";
                ctx.beginPath();
                ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2);
                ctx.fill();
            } else if (ball.phase === "landed") {
                const frames = ball.result.trajectory;
                const final = frames[frames.length - 1] ?? layout.releasePoint;
                const t = Math.min(1, (now - ball.landedAt) / POOF_MS);

                // The ball itself shrinks and fades as it "settles"...
                const remainingRadius = BALL_RADIUS * (1 - t);
                if (remainingRadius > 0.3) {
                    ctx.fillStyle = `rgba(255,107,107,${1 - t})`;
                    ctx.beginPath();
                    ctx.arc(final.x, final.y, remainingRadius, 0, Math.PI * 2);
                    ctx.fill();
                }

                // ...while a burst of particles poofs outward from the same spot - every
                // landing gets one, gutter misses included.
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
    };

    // One persistent loop for the whole board's lifetime (once the real layout has arrived):
    // interpolates every falling ball's position, promotes a ball whose trajectory just
    // finished into its poof phase (firing the one-time callout/session-update side effects
    // exactly once via landedAt), and retires any ball whose poof has finished. Mirrors
    // PlinkoBoard's own persistent rAF loop.
    useEffect(() => {
        if (!layout) {
            return;
        }
        const tick = (now: number) => {
            const hotTulips = new Set<PachinkoTulipLayout["id"]>();
            const toRemove: number[] = [];
            for (const ball of activeBallsRef.current.values()) {
                if (ball.phase === "falling") {
                    const lastIndex = ball.result.trajectory.length - 1;
                    const elapsedFrames = (now - ball.startTime) / FRAME_MS;
                    if (elapsedFrames >= lastIndex) {
                        const { result, seq } = ball;
                        activeBallsRef.current.set(ball.id, { id: ball.id, phase: "landed", result, landedAt: now, particles: makeParticles() });

                        const calloutId = nextCalloutId++;
                        setCallouts((prev) => [...prev, { id: calloutId, outcome: result.outcome, payout: result.payout, won: result.payout > 0 }]);
                        setTimeout(() => setCallouts((prev) => prev.filter((c) => c.id !== calloutId)), CALLOUT_MS);

                        // Responses can arrive out of order under hold-to-fire (several
                        // concurrent launches in flight) - only apply this one's session
                        // state if it's actually the freshest launch to land so far, so a
                        // late response for an earlier ball can't regress totalPayout or
                        // stomp a more recent tulip toggle.
                        if (seq > latestAppliedSeqRef.current && sessionRef.current) {
                            latestAppliedSeqRef.current = seq;
                            onSessionUpdate({
                                ...sessionRef.current,
                                ballsRemaining: result.ballsRemaining,
                                totalPayout: result.totalPayout,
                                leftTulipOpen: result.leftTulipOpen,
                                rightTulipOpen: result.rightTulipOpen,
                            });
                        }
                    }
                } else if (ball.phase === "landed") {
                    if (now - ball.landedAt >= POOF_MS) {
                        toRemove.push(ball.id);
                    } else if (ball.result.outcome === "tulipLeft") {
                        hotTulips.add("left");
                    } else if (ball.result.outcome === "tulipRight") {
                        hotTulips.add("right");
                    } else if (ball.result.outcome === "tulipCenter") {
                        hotTulips.add("center");
                    }
                }
                // "pending" balls have nothing to advance here - they just render via draw()
                // until their launch response promotes them to "falling".
            }
            if (toRemove.length > 0) {
                for (const id of toRemove) {
                    activeBallsRef.current.delete(id);
                }
                setActiveCount(activeBallsRef.current.size);
            }

            draw(now, hotTulips);
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

    useEffect(
        () => () => {
            if (fireIntervalRef.current !== null) {
                clearInterval(fireIntervalRef.current);
            }
            if (plungerReleaseRef.current !== null) {
                window.removeEventListener("pointerup", plungerReleaseRef.current);
                window.removeEventListener("pointercancel", plungerReleaseRef.current);
            }
        },
        []
    );

    const ballsRemaining = session?.ballsRemaining ?? 0;
    const canLaunch = !isResuming && ballsRemaining > 0;

    const fireOnce = () => {
        if (ballsRemainingRef.current <= 0) {
            stopFiring();
            return;
        }
        if (activeBallsRef.current.size >= MAX_CONCURRENT_BALLS) {
            return; // cap reached - skip this tick only, interval keeps running for the next one
        }
        const id = nextBallId++;
        const seq = ++nextLaunchSeq;
        activeBallsRef.current.set(id, { id, phase: "pending" });
        setActiveCount((c) => c + 1);
        // Decremented at request time, not response time - otherwise the interval's own
        // self-throttle would lag a couple of round-trips behind the true depletion point,
        // firing a trailing burst of "no balls remaining" requests right as a batch ends.
        ballsRemainingRef.current -= 1;

        launch(launchPowerRef.current)
            .then((result) => {
                activeBallsRef.current.set(id, { id, phase: "falling", result, startTime: performance.now(), seq });
            })
            .catch(() => {
                // The launch mutation's own onError already surfaces a toast - this ball
                // never actually fired, so release the slot and balance it reserved, and
                // stop auto-firing rather than immediately retrying into the same error.
                activeBallsRef.current.delete(id);
                setActiveCount((c) => c - 1);
                ballsRemainingRef.current += 1;
                stopFiring();
            });
    };

    function startFiring() {
        if (!canLaunch || fireIntervalRef.current !== null) {
            return;
        }
        // Deferred one frame, not called synchronously: pointerdown fires before the browser's
        // own mousedown (which is what the Slider's onChange listens on), so at the instant
        // this runs, launchPower/launchPowerRef may still hold whatever it was before this
        // very press - a plain rAF is enough to let that onChange's setState commit first, so
        // the very first shot actually uses the power the player just pressed at.
        requestAnimationFrame(fireOnce);
        fireIntervalRef.current = setInterval(fireOnce, FIRE_INTERVAL_MS);
    }

    function stopFiring() {
        if (fireIntervalRef.current !== null) {
            clearInterval(fireIntervalRef.current);
            fireIntervalRef.current = null;
        }
    }

    // The launch power dial doubles as the fire control, like a spring-loaded plunger: press
    // and drag it to set power, hold it to keep firing at that power (adjustable mid-hold),
    // release anywhere to stop and let it spring back to 0. Listening on `window` for the
    // release (not just the slider's own onPointerUp/Leave) is what makes the spring-back
    // reliable even if the player drags off the slider before releasing.
    function handlePlungerDown() {
        if (!canLaunch) {
            return;
        }
        startFiring();
        const release = () => {
            stopFiring();
            setLaunchPower(launchPowerRange.min);
            window.removeEventListener("pointerup", release);
            window.removeEventListener("pointercancel", release);
            plungerReleaseRef.current = null;
        };
        plungerReleaseRef.current = release;
        window.addEventListener("pointerup", release);
        window.addEventListener("pointercancel", release);
    }

    const spent = (session?.ballsTotal ?? 0) * (session?.pricePerBall ?? pricePerBall);
    const totalPayout = session?.totalPayout ?? 0;
    const netResult = totalPayout - spent;

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
                        {ballsRemaining} balls · Pool {formatCheddar(jackpotPool)}
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
                                bgcolor: "rgba(13,13,13,0.55)",
                                border: "2px solid",
                                borderColor: callout.won ? "#FFD700" : "grey.700",
                                borderRadius: 1,
                                px: 2,
                                py: 0.75,
                                pointerEvents: "none",
                                animation: `pachinkoCalloutPop ${CALLOUT_MS}ms ease-out`,
                                "@keyframes pachinkoCalloutPop": {
                                    "0%": { opacity: 0, transform: "translate(-50%, -50%) scale(0.7)" },
                                    "15%": { opacity: 1, transform: "translate(-50%, -50%) scale(1.1)" },
                                    "30%": { transform: "translate(-50%, -50%) scale(1)" },
                                    "80%": { opacity: 1, transform: "translate(-50%, -50%) scale(1)" },
                                    "100%": { opacity: 0, transform: "translate(-50%, -50%) scale(0.9)" },
                                },
                            }}
                        >
                            <Typography variant="subtitle2" sx={{ fontWeight: 800, color: callout.won ? "success.light" : "grey.300" }}>
                                {OUTCOME_LABEL[callout.outcome]}
                            </Typography>
                            <Typography variant="body1" sx={{ fontWeight: 800, color: "warning.light" }}>
                                {callout.payout > 0 ? `+${formatCheddar(callout.payout)}` : "—"}
                            </Typography>
                        </Box>
                    ))}
                </Box>
            </Box>

            <Box sx={{ px: 2, mt: 2.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "center", mb: 0.5 }}>
                    {ballsRemaining <= 0
                        ? "No balls - reup below"
                        : activeCount >= MAX_CONCURRENT_BALLS
                          ? "Max balls in flight"
                          : `Hold & drag the plunger to launch (${ballsRemaining} left)`}
                </Typography>
                {/* The power dial doubles as the fire control (a spring-loaded plunger, not a
                    separate button + slider) - press and drag it to set power, hold to keep
                    firing at that power, release anywhere to stop and snap back to 0. See
                    handlePlungerDown. */}
                <Slider
                    value={launchPower}
                    onChange={(_, value) => typeof value === "number" && setLaunchPower(value)}
                    onPointerDown={handlePlungerDown}
                    min={launchPowerRange.min}
                    max={launchPowerRange.max}
                    color="warning"
                    valueLabelDisplay="auto"
                    disabled={!canLaunch}
                    aria-label="Launch power - hold and drag, release to fire"
                    sx={{ touchAction: "none" }}
                />
            </Box>

            <Box sx={{ display: "flex", justifyContent: "center", gap: 1.5, mt: 2 }}>
                {REUP_AMOUNTS.map((amount) => (
                    <Button
                        key={amount}
                        variant="outlined"
                        color="warning"
                        onClick={() => reup(amount)}
                        disabled={isReuping || isResuming}
                        sx={{ borderRadius: 999, px: 3, fontWeight: 700, textTransform: "none" }}
                    >
                        +{amount} ({formatCheddar(amount * pricePerBall)})
                    </Button>
                ))}
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
                        {spent > 0 ? (totalPayout / spent).toFixed(2) : "0.00"}x
                    </Typography>
                </Box>
            </Box>
        </Box>
    );
}
