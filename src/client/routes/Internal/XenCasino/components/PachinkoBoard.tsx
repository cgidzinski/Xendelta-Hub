import { useEffect, useRef, useState } from "react";
import { Box, Button, Slider, Typography } from "@mui/material";
import { formatCheddar } from "../utils/currency";

export type PachinkoOutcome = "gutter" | "tulipLeft" | "tulipRight" | "jackpot" | "bonusLeft" | "bonusRight" | "chucker" | "attacker";

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

export interface PachinkoFixedPocket {
    id: string;
    position: PachinkoPoint;
    halfWidth: number;
}

export interface PachinkoWindmillLayout {
    position: PachinkoPoint;
    radius: number;
}

export interface PachinkoRailCap {
    center: PachinkoPoint;
    radius: number;
    startAngle: number;
    endAngle: number;
}

export interface PachinkoLayoutData {
    canvasWidth: number;
    canvasHeight: number;
    boundaryRightArc: PachinkoBezierSegment[];
    boundaryLeftArc: PachinkoBezierSegment[];
    railOuterArc: PachinkoBezierSegment[];
    railInnerArc: PachinkoBezierSegment[];
    railCap: PachinkoRailCap;
    launcherPosition: PachinkoPoint;
    releasePoint: PachinkoPoint;
    gutterCutoutXStart: number;
    gutterCutoutXEnd: number;
    gutterPocket: PachinkoPoint[];
    nailField: PachinkoPoint[];
    tulips: PachinkoFixedPocket[];
    jackpot: PachinkoFixedPocket;
    attacker: PachinkoFixedPocket;
    bonusPockets: PachinkoFixedPocket[];
    chucker: PachinkoFixedPocket;
    windmills: PachinkoWindmillLayout[];
}

export interface PachinkoSession {
    roundId: string;
    ballsTotal: number;
    ballsRemaining: number;
    pricePerBall: number;
    leftTulipOpen: boolean;
    rightTulipOpen: boolean;
    attackerOpenUntil: number; // epoch ms; attacker pays while Date.now() < this
}

export type ReelMatchTier = "none" | "two" | "three";

export interface PachinkoReelSpin {
    symbols: [string, string, string];
    matchTier: ReelMatchTier;
    ballsAwarded: number;
    attackerBonusMs: number;
}

export interface PachinkoLaunchResult {
    outcome: PachinkoOutcome;
    ballsAwarded: number;
    trajectory: PachinkoTrajectorySample[];
    reelSpin?: PachinkoReelSpin; // only present on a chucker catch - see pachinkoReels.ts (server)
    leftTulipOpen: boolean;
    rightTulipOpen: boolean;
    attackerOpenUntil: number;
    ballsRemaining: number;
}

export interface PachinkoBoardProps {
    session: PachinkoSession | null;
    layout: PachinkoLayoutData | null;
    jackpotPool: number;
    cashOutRate: number;
    bonusPocketBalls: number;
    sideTulipBalls: number;
    attackerBalls: number;
    launchPowerRange: { min: number; max: number };
    pricePerBall: number; // needed even when session is null, so reup button costs can show before any batch exists
    isResuming: boolean; // the post-open "resume an existing batch?" check is in flight
    launch: (launchPower: number) => Promise<PachinkoLaunchResult>;
    reup: (balls: number) => Promise<unknown>;
    isReuping: boolean;
    onSessionUpdate: (session: PachinkoSession) => void;
}

const BALL_RADIUS = 3.5; // matches pachinkoLayout.ts's BALL_RADIUS
const PIN_RADIUS = 1.1; // matches pachinkoLayout.ts's PIN_RADIUS
const POCKET_HEIGHT = 18; // matches pachinkoLayout.ts's POCKET_DEPTH - the physical cup every pocket collides against, not just a visual choice
const FRAME_MS = 1000 / 30; // matches the server's ~30fps trajectory sample rate
const POOF_MS = 450; // how long the ball+particle burst takes once a trajectory finishes
const CALLOUT_MS = 1000; // how long the center win/loss callout stays on screen
const FIRE_INTERVAL_MS = 400; // 100 balls/minute while the launch button is held
const MAX_CONCURRENT_BALLS = 20;
const PARTICLE_COUNT = 12;
const REUP_AMOUNTS = [100, 1000];

// The board's central digital reel - a real modern machine's own "heso" (start chucker) -> LCD
// reel -> bonus round gimmick (see pachinko.ts's chucker branch and pachinkoReels.ts on the
// server for how the result is decided). Sits in the one stretch of the upper-mid field that's
// naturally clear of the release deflector, the windmills, and the chucker's own mouth - no
// board changes needed to make room for it. The server only ever deals in generic symbol keys
// (matching slots.ts's own ITEM_A/ITEM_B/.../JACKPOT_ITEM vocabulary); this board owns what each
// one looks like, same as every slots machine page owns its own symbol map.
const REEL_SYMBOLS: Record<string, string> = {
    ITEM_A: "🍒",
    ITEM_B: "🔔",
    ITEM_C: "⭐",
    ITEM_D: "💎",
    JACKPOT_ITEM: "7️⃣",
};
const REEL_FLICKER_POOL = Object.values(REEL_SYMBOLS);
const REEL_BOX = { x: 230, y: 158, width: 120, height: 26 };
const REEL_SPIN_MS = 900; // base spin duration before the first reel starts landing
const REEL_STOP_STAGGER_MS = [0, 220, 440]; // per-reel landing stagger, added to REEL_SPIN_MS
const REEL_FLICKER_INTERVAL_MS = 70;
const REEL_RESULT_GLOW_MS = 1600; // how long a match keeps its glow after the last reel lands

interface ReelAnimState {
    symbols: [string, string, string];
    matchTier: ReelMatchTier;
    startTime: number;
}

const OUTCOME_LABEL: Record<PachinkoOutcome, string> = {
    gutter: "Miss",
    bonusLeft: "Bonus!",
    bonusRight: "Bonus!",
    tulipLeft: "Side Tulip!",
    tulipRight: "Side Tulip!",
    chucker: "Gate Open!",
    attacker: "Attacker!",
    jackpot: "JACKPOT!",
};

interface Particle {
    angle: number;
    speed: number; // px/sec
    radius: number;
}

interface Callout {
    id: number;
    outcome: PachinkoOutcome;
    ballsAwarded: number;
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

// Same curve-drawing as drawArc, but WITHOUT the leading moveTo - for appending an arc onto a
// path that's already mid-subpath (e.g. the rail's outer curve -> cap -> inner curve, which
// needs to stay one continuous subpath so closePath() connects back to the true start instead
// of silently starting a second, wrongly-closed subpath - drawArc's own unconditional moveTo
// would break that).
function appendArc(ctx: CanvasRenderingContext2D, arc: PachinkoBezierSegment[]) {
    for (const seg of arc) {
        ctx.bezierCurveTo(seg.c1.x, seg.c1.y, seg.c2.x, seg.c2.y, seg.p1.x, seg.p1.y);
    }
}

// A shared open-top, rounded-bottom pocket shape - every scoring target on this board (bonus,
// tulip, jackpot, chucker, attacker) uses this same construction (mirrors Plinko's own landing
// cups), just at different sizes/colors, so difficulty reads as pocket width, not as an
// inconsistent mix of dots and ellipses.
function drawPocket(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    halfWidth: number,
    height: number,
    fill: string,
    stroke: string,
    options?: { glow?: string; dashed?: boolean }
) {
    const w = halfWidth * 2;
    const r = Math.min(halfWidth, height / 2);
    if (options?.glow) {
        ctx.save();
        ctx.shadowColor = options.glow;
        ctx.shadowBlur = 7;
    }
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - height / 2, w, height, [0, 0, r, r]);
    ctx.fillStyle = fill;
    ctx.fill();
    if (options?.glow) {
        ctx.restore();
    }
    ctx.save();
    if (options?.dashed) {
        ctx.setLineDash([3, 2]);
    }
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - height / 2, w, height, [0, 0, r, r]);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.restore();
}

// A short name label above a pocket, so its type is identifiable at a glance rather than only
// by color/size - every scoring target gets one, not just the ones that happen to have room for
// a payout number inside them.
function drawPocketLabel(ctx: CanvasRenderingContext2D, x: number, y: number, height: number, text: string, color: string) {
    ctx.fillStyle = color;
    ctx.font = "bold 7px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, x, y - height / 2 - 3);
}

// The ball award, INSIDE the pocket itself (not just implied by color/label) - used for the
// pockets whose payout is a single fixed number worth spelling out at a glance (bonus, attacker).
function drawPocketAmount(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
    ctx.fillStyle = color;
    ctx.font = "bold 8px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, x, y + 3);
}

// The central digital reel display - a real modern machine's own "heso -> LCD reel" gimmick
// (see REEL_BOX's own comment above for why this exact spot). `anim` is null until the first
// chucker catch of the session; each reel flickers through REEL_FLICKER_POOL until its own
// staggered landing time, then shows its true (server-decided) symbol - same spin-then-land
// shape SlotMachine.tsx's reels use, ported into plain canvas draws since this board is one
// continuous canvas (a ball needs to visibly fly in front of this, which only works if it's
// painted in the same pass as everything else, not a separate DOM layer).
function drawReelDisplay(ctx: CanvasRenderingContext2D, now: number, anim: ReelAnimState | null) {
    const { x, y, width, height } = REEL_BOX;
    ctx.save();
    ctx.fillStyle = "rgba(8,8,14,0.92)";
    ctx.strokeStyle = "rgba(255,215,0,0.5)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x - width / 2, y - height / 2, width, height, 4);
    ctx.fill();
    ctx.stroke();

    const reelWidth = width / 3;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "16px sans-serif";
    for (let i = 0; i < 3; i++) {
        const cx = x - width / 2 + reelWidth * i + reelWidth / 2;
        let symbol = "❔";
        if (anim) {
            const elapsed = now - anim.startTime;
            const stopAt = REEL_SPIN_MS + (REEL_STOP_STAGGER_MS[i] ?? 0);
            symbol = elapsed < stopAt ? REEL_FLICKER_POOL[Math.floor(elapsed / REEL_FLICKER_INTERVAL_MS) % REEL_FLICKER_POOL.length] : REEL_SYMBOLS[anim.symbols[i]] ?? "❔";
        }
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.fillText(symbol, cx, y + 1);
        if (i > 0) {
            ctx.strokeStyle = "rgba(255,255,255,0.15)";
            ctx.beginPath();
            ctx.moveTo(x - width / 2 + reelWidth * i, y - height / 2);
            ctx.lineTo(x - width / 2 + reelWidth * i, y + height / 2);
            ctx.stroke();
        }
    }

    // A glow once every reel has landed on a real match, fading away after REEL_RESULT_GLOW_MS -
    // the reel keeps showing the landed symbols after that, it just stops glowing.
    if (anim && anim.matchTier !== "none") {
        const lastStopAt = REEL_SPIN_MS + (REEL_STOP_STAGGER_MS[REEL_STOP_STAGGER_MS.length - 1] ?? 0);
        const sinceLanded = now - anim.startTime - lastStopAt;
        if (sinceLanded >= 0 && sinceLanded < REEL_RESULT_GLOW_MS) {
            ctx.strokeStyle = anim.matchTier === "three" ? "#FFD700" : "#7CFFB2";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.roundRect(x - width / 2 - 2, y - height / 2 - 2, width + 4, height + 4, 5);
            ctx.stroke();
        }
    }
    ctx.restore();
}

/**
 * The reusable Pachinko board - canvas analog of PlinkoBoard, replaying physics trajectories
 * captured server-side. The server decides the whole outcome (a real matter-js simulation
 * driven by the player's own launch power) before any of this runs; this component's only
 * job is to play trajectories back and reflect the session state it's handed.
 *
 * The economy is ball-only: every catch adds balls to the session's own ballsRemaining, never
 * cheddar directly (see pachinko.ts). The board shows the tray's current cash value; cashing
 * out happens automatically when the game modal closes (see Pachinko.tsx), not via a button
 * here.
 *
 * Multiple balls can be in flight at once, same as Plinko: holding the launch button fires one
 * shot immediately and then one every FIRE_INTERVAL_MS while held, and every active ball
 * animates concurrently off a single shared rAF loop (activeBallsRef).
 */
export default function PachinkoBoard({
    session,
    layout,
    jackpotPool,
    cashOutRate,
    bonusPocketBalls,
    sideTulipBalls,
    attackerBalls,
    launchPowerRange,
    pricePerBall,
    isResuming,
    launch,
    reup,
    isReuping,
    onSessionUpdate,
}: PachinkoBoardProps) {
    const [callouts, setCallouts] = useState<Callout[]>([]);
    const [launchPower, setLaunchPower] = useState(() => launchPowerRange.min);

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const rafRef = useRef<number | null>(null);
    const fireIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const activeBallsRef = useRef<Map<number, ActiveBall>>(new Map());
    const latestAppliedSeqRef = useRef(0);
    const reelStateRef = useRef<ReelAnimState | null>(null);

    const sessionRef = useRef(session);
    sessionRef.current = session;
    const launchPowerRef = useRef(launchPower);
    launchPowerRef.current = launchPower;

    const ballsRemainingRef = useRef(session?.ballsRemaining ?? 0);
    useEffect(() => {
        ballsRemainingRef.current = session?.ballsRemaining ?? 0;
    }, [session?.ballsRemaining]);

    const plungerReleaseRef = useRef<(() => void) | null>(null);

    const draw = (now: number, hotPockets: Set<string>) => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !ctx || !layout) {
            return;
        }
        ctx.clearRect(0, 0, layout.canvasWidth, layout.canvasHeight);

        // The one true playfield boundary - fully continuous (no gap anywhere near the rail,
        // see pachinkoLayout.ts's own header comment for why), drawn as two arcs matching the
        // gutter cutout at the bottom.
        ctx.fillStyle = "rgba(255,255,255,0.035)";
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

        // Rail - a channel flush against the inside of the glass, outer wall shared with the
        // boundary itself, inner wall offset in, capped with a half circle at the launcher end
        // (railCap) rather than a flat line.
        const railGrad = ctx.createLinearGradient(layout.railInnerArc[0]?.p0.x ?? 0, 0, layout.railOuterArc[0]?.p0.x ?? 0, 0);
        railGrad.addColorStop(0, "#4a3a1a");
        railGrad.addColorStop(1, "#2a2110");
        ctx.beginPath();
        drawArc(ctx, layout.railOuterArc); // starts the one subpath (moveTo + curves)
        ctx.arc(layout.railCap.center.x, layout.railCap.center.y, layout.railCap.radius, layout.railCap.startAngle, layout.railCap.endAngle, false);
        const reversedInner = [...layout.railInnerArc].reverse().map((seg) => ({ p0: seg.p1, c1: seg.c2, c2: seg.c1, p1: seg.p0 }));
        appendArc(ctx, reversedInner); // continues the SAME subpath - no moveTo, or closePath() below would close the wrong shape
        ctx.closePath();
        ctx.fillStyle = railGrad;
        ctx.fill();
        ctx.strokeStyle = "rgba(255,215,0,0.55)";
        ctx.lineWidth = 1;
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

        // Central digital reel - drawn here (after the nail field, before the ball) so a ball
        // still visibly flies in front of it, matching a real screen module's own depth.
        drawReelDisplay(ctx, now, reelStateRef.current);

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

        // Every scoring target is a pocket (see drawPocket) - bonus, tulip, jackpot, chucker,
        // attacker, all the same open-top-cup construction, sized by difficulty rather than
        // drawn as a mix of dots and ellipses.
        // Every pocket on this board is a fixed size now - open/closed/primed state only ever
        // changes color (and, for the attacker, whether it currently pays) never the hitbox -
        // matching pachinkoLayout.ts, which backs every one of these with a real physical cup
        // rather than a shrinking/growing detection zone.
        const attackerOpenUntil = sessionRef.current?.attackerOpenUntil ?? 0;
        const attackerOpen = attackerOpenUntil > Date.now();

        for (const bonus of layout.bonusPockets) {
            const isHot = hotPockets.has(`bonus-${bonus.id}`);
            const stroke = isHot ? "#FFD700" : "rgba(189,245,240,0.9)";
            drawPocket(ctx, bonus.position.x, bonus.position.y, bonus.halfWidth, POCKET_HEIGHT, isHot ? "rgba(255,215,0,0.35)" : "rgba(79,209,197,0.22)", stroke);
            drawPocketLabel(ctx, bonus.position.x, bonus.position.y, POCKET_HEIGHT, "BONUS", stroke);
            drawPocketAmount(ctx, bonus.position.x, bonus.position.y, `+${bonusPocketBalls}`, stroke);
        }

        const leftOpen = sessionRef.current?.leftTulipOpen ?? false;
        const rightOpen = sessionRef.current?.rightTulipOpen ?? false;
        for (const tulip of layout.tulips) {
            const isOpen = tulip.id === "left" ? leftOpen : rightOpen;
            const isHot = hotPockets.has(`tulip-${tulip.id}`);
            // Both states are green - a tulip being closed isn't "inactive" the way the
            // chucker/attacker are, it's just not toggled yet, so it shouldn't read as grey/off.
            // Open needs to be unmistakably brighter though: a vivid, near-solid glowing green
            // vs. a light, translucent green when closed.
            const stroke = isHot ? "#FFD700" : isOpen ? "#7CFFB2" : "#BFF0D2";
            drawPocket(
                ctx,
                tulip.position.x,
                tulip.position.y,
                tulip.halfWidth,
                POCKET_HEIGHT,
                isHot ? "rgba(255,215,0,0.35)" : isOpen ? "rgba(99,214,138,0.75)" : "rgba(99,214,138,0.22)",
                stroke,
                { glow: isHot ? undefined : isOpen ? "rgba(124,255,178,0.9)" : undefined }
            );
            drawPocketLabel(ctx, tulip.position.x, tulip.position.y, POCKET_HEIGHT, isOpen ? "TULIP - OPEN" : "TULIP", stroke);
            drawPocketAmount(ctx, tulip.position.x, tulip.position.y, `+${sideTulipBalls}`, isOpen ? "#08321a" : stroke);
        }

        // Chucker - fixed width, never highlighted for its own sake beyond a catch; also reads
        // as grey/dashed (matching the attacker's own closed look) while the attacker it just
        // opened is still counting down, so it's visually obvious there's nothing to gain from
        // hitting it again right now.
        const chuckerHot = hotPockets.has("chucker");
        const chuckerStroke = chuckerHot ? "#FFD700" : attackerOpen ? "rgba(170,170,170,0.7)" : "rgba(255,230,150,0.9)";
        drawPocket(
            ctx,
            layout.chucker.position.x,
            layout.chucker.position.y,
            layout.chucker.halfWidth,
            POCKET_HEIGHT,
            chuckerHot ? "rgba(255,215,0,0.4)" : attackerOpen ? "rgba(140,140,140,0.18)" : "rgba(255,215,0,0.2)",
            chuckerStroke,
            { dashed: attackerOpen && !chuckerHot }
        );
        drawPocketLabel(ctx, layout.chucker.position.x, layout.chucker.position.y, POCKET_HEIGHT, "CHUCKER", chuckerStroke);

        // Attacker - fixed width always (see pachinkoLayout.ts). Grey and dashed while closed,
        // solid and colored while open, with the ball award shown inside and a live countdown
        // UNDERNEATH (not overlapping the amount), read straight off session.attackerOpenUntil
        // against the real clock every frame, not a locally-tracked timer.
        const attackerHot = hotPockets.has("attacker");
        const attackerStroke = attackerHot ? "#FFD700" : attackerOpen ? "rgba(189,245,207,0.95)" : "rgba(170,170,170,0.7)";
        drawPocket(
            ctx,
            layout.attacker.position.x,
            layout.attacker.position.y,
            layout.attacker.halfWidth,
            POCKET_HEIGHT,
            attackerHot ? "rgba(255,215,0,0.4)" : attackerOpen ? "rgba(99,214,138,0.35)" : "rgba(140,140,140,0.18)",
            attackerStroke,
            { dashed: !attackerOpen && !attackerHot }
        );
        drawPocketLabel(ctx, layout.attacker.position.x, layout.attacker.position.y, POCKET_HEIGHT, attackerOpen ? "ATTACKER - OPEN" : "ATTACKER", attackerStroke);
        drawPocketAmount(ctx, layout.attacker.position.x, layout.attacker.position.y, `+${attackerBalls}`, attackerStroke);
        if (attackerOpen) {
            // 2 decimals, not a whole-second countdown - ticking visibly every frame is what
            // actually reads as "fast" and urgent, a whole number only appears to update once a
            // second.
            const secondsLeft = Math.max(0, (attackerOpenUntil - Date.now()) / 1000);
            ctx.fillStyle = "rgba(189,245,207,0.95)";
            ctx.font = "bold 9px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(`${secondsLeft.toFixed(2)}s`, layout.attacker.position.x, layout.attacker.position.y + POCKET_HEIGHT / 2 + 12);
        }

        // Jackpot - the tightest pocket on the board, fixed width even when primed. Grey/inert
        // until both tulips are open, then lights up (colored + glow) - only reachable-and-
        // paying state changes, never the target size.
        const primed = leftOpen && rightOpen;
        const jackpotHot = hotPockets.has("jackpot");
        const jackpotHeight = layout.jackpot.halfWidth * 2.4;
        const jackpotStroke = jackpotHot ? "#FFD700" : primed ? "#ffd0dd" : "rgba(170,170,170,0.7)";
        drawPocket(
            ctx,
            layout.jackpot.position.x,
            layout.jackpot.position.y,
            layout.jackpot.halfWidth,
            jackpotHeight,
            jackpotHot ? "rgba(255,215,0,0.4)" : primed ? "rgba(255,77,125,0.4)" : "rgba(140,140,140,0.18)",
            jackpotStroke,
            { glow: jackpotHot || !primed ? undefined : "rgba(255,77,125,0.9)", dashed: !primed && !jackpotHot }
        );
        drawPocketLabel(ctx, layout.jackpot.position.x, layout.jackpot.position.y, jackpotHeight, "JACKPOT", jackpotStroke);

        // Pending balls - appear instantly at the launcher the moment a shot is fired.
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
                    continue;
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

                const remainingRadius = BALL_RADIUS * (1 - t);
                if (remainingRadius > 0.3) {
                    ctx.fillStyle = `rgba(255,107,107,${1 - t})`;
                    ctx.beginPath();
                    ctx.arc(final.x, final.y, remainingRadius, 0, Math.PI * 2);
                    ctx.fill();
                }

                const won = ball.result.ballsAwarded > 0;
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

    useEffect(() => {
        if (!layout) {
            return;
        }
        const tick = (now: number) => {
            const hotPockets = new Set<string>();
            const toRemove: number[] = [];
            for (const ball of activeBallsRef.current.values()) {
                if (ball.phase === "falling") {
                    const lastIndex = ball.result.trajectory.length - 1;
                    const elapsedFrames = (now - ball.startTime) / FRAME_MS;
                    if (elapsedFrames >= lastIndex) {
                        const { result, seq } = ball;
                        activeBallsRef.current.set(ball.id, { id: ball.id, phase: "landed", result, landedAt: now, particles: makeParticles() });

                        // Misses don't get a popup - they're the most common outcome by far, so
                        // surfacing them would mostly just be clutter; only an actual catch
                        // (even a 0-ball one like the chucker, which still opened the attacker)
                        // is worth calling out.
                        if (result.outcome !== "gutter") {
                            const calloutId = nextCalloutId++;
                            setCallouts((prev) => [...prev, { id: calloutId, outcome: result.outcome, ballsAwarded: result.ballsAwarded, won: result.ballsAwarded > 0 }]);
                            setTimeout(() => setCallouts((prev) => prev.filter((c) => c.id !== calloutId)), CALLOUT_MS);
                        }

                        // The chucker fires the central reel the instant the ball actually lands
                        // there (not the instant the response arrives) - same "catch has to be
                        // visible before its consequence shows up" causality the callouts above
                        // already follow.
                        if (result.outcome === "chucker" && result.reelSpin) {
                            reelStateRef.current = { symbols: result.reelSpin.symbols, matchTier: result.reelSpin.matchTier, startTime: now };
                        }

                        // Responses can arrive out of order under hold-to-fire - only apply this
                        // one's session state if it's actually the freshest launch to land so
                        // far, so a late response for an earlier ball can't regress ballsRemaining
                        // or stomp a more recent tulip/attacker state change.
                        if (seq > latestAppliedSeqRef.current && sessionRef.current) {
                            latestAppliedSeqRef.current = seq;
                            onSessionUpdate({
                                ...sessionRef.current,
                                ballsRemaining: result.ballsRemaining,
                                leftTulipOpen: result.leftTulipOpen,
                                rightTulipOpen: result.rightTulipOpen,
                                attackerOpenUntil: result.attackerOpenUntil,
                            });
                        }
                    }
                } else if (ball.phase === "landed") {
                    if (now - ball.landedAt >= POOF_MS) {
                        toRemove.push(ball.id);
                    } else if (ball.result.outcome === "bonusLeft") {
                        hotPockets.add("bonus-left");
                    } else if (ball.result.outcome === "bonusRight") {
                        hotPockets.add("bonus-right");
                    } else if (ball.result.outcome === "tulipLeft") {
                        hotPockets.add("tulip-left");
                    } else if (ball.result.outcome === "tulipRight") {
                        hotPockets.add("tulip-right");
                    } else if (ball.result.outcome === "chucker") {
                        hotPockets.add("chucker");
                    } else if (ball.result.outcome === "attacker") {
                        hotPockets.add("attacker");
                    } else if (ball.result.outcome === "jackpot") {
                        hotPockets.add("jackpot");
                    }
                }
            }
            for (const id of toRemove) {
                activeBallsRef.current.delete(id);
            }

            draw(now, hotPockets);
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
            return;
        }
        const id = nextBallId++;
        const seq = ++nextLaunchSeq;
        activeBallsRef.current.set(id, { id, phase: "pending" });
        ballsRemainingRef.current -= 1;

        launch(launchPowerRef.current)
            .then((result) => {
                activeBallsRef.current.set(id, { id, phase: "falling", result, startTime: performance.now(), seq });
            })
            .catch(() => {
                activeBallsRef.current.delete(id);
                ballsRemainingRef.current += 1;
                stopFiring();
            });
    };

    function startFiring() {
        if (!canLaunch || fireIntervalRef.current !== null) {
            return;
        }
        requestAnimationFrame(fireOnce);
        fireIntervalRef.current = setInterval(fireOnce, FIRE_INTERVAL_MS);
    }

    function stopFiring() {
        if (fireIntervalRef.current !== null) {
            clearInterval(fireIntervalRef.current);
            fireIntervalRef.current = null;
        }
    }

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
    const cashValue = ballsRemaining * (session?.pricePerBall ?? pricePerBall) * cashOutRate;
    const net = cashValue - spent;

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
                </Box>
            </Box>

            <Box sx={{ px: 2, mt: 2.5 }}>
                <Slider
                    value={launchPower}
                    onChange={(_, value) => typeof value === "number" && setLaunchPower(value)}
                    onPointerDown={handlePlungerDown}
                    min={launchPowerRange.min}
                    max={launchPowerRange.max}
                    color="warning"
                    valueLabelDisplay="off"
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

            {/* Tray: every catch adds balls here, never cheddar directly - Cash Out is the only
                thing that ever converts the tray back to real money (see pachinko.ts). */}
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
                        Cash Value
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: "warning.main" }}>
                        {formatCheddar(cashValue)}
                    </Typography>
                </Box>
                <Box sx={{ textAlign: "center" }}>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.3 }}>
                        Net if Cashed
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: net >= 0 ? "success.main" : "error.main" }}>
                        {net >= 0 ? "+" : "-"}
                        {formatCheddar(Math.abs(net))}
                    </Typography>
                </Box>
            </Box>

            {/* Catch popups - live below the Spent/Cash Value/Net box rather than floating over
                the board, so they never obscure the play field. Misses are filtered out before
                they ever reach `callouts` (see the tick loop) - this row only ever shows actual
                catches. Two things pin this box's height to a true constant, not just a
                minimum: it's ALWAYS rendered (never conditionally mounted on callouts.length -
                toggling the whole row in and out of the DOM was the first cause of the desktop
                modal resizing), and it's noWrap + horizontally scrollable rather than wrapping
                - a burst of simultaneous catches under hold-to-fire (several balls landing
                close together) used to wrap onto a second line and grow the row, which was the
                second cause. Rare enough to need more than a couple of these that scrolling to
                see the rest is an acceptable tradeoff for a height that truly never changes. */}
            <Box sx={{ display: "flex", justifyContent: "center", flexWrap: "nowrap", overflowX: "auto", gap: 1, mt: 1.5, height: 44 }}>
                {callouts.map((callout) => (
                    <Box
                        key={callout.id}
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            bgcolor: "rgba(13,13,13,0.55)",
                            border: "2px solid",
                            borderColor: callout.won ? "#FFD700" : "grey.700",
                            borderRadius: 999,
                            px: 2,
                            py: 0.5,
                            animation: `pachinkoCalloutPop ${CALLOUT_MS}ms ease-out`,
                            "@keyframes pachinkoCalloutPop": {
                                "0%": { opacity: 0, transform: "scale(0.7)" },
                                "15%": { opacity: 1, transform: "scale(1.08)" },
                                "30%": { transform: "scale(1)" },
                                "80%": { opacity: 1, transform: "scale(1)" },
                                "100%": { opacity: 0, transform: "scale(0.92)" },
                            },
                        }}
                    >
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, color: callout.won ? "success.light" : "grey.300" }}>
                            {OUTCOME_LABEL[callout.outcome]}
                        </Typography>
                        <Typography variant="body1" sx={{ fontWeight: 800, color: "warning.light" }}>
                            {callout.ballsAwarded > 0 ? `+${callout.ballsAwarded} balls` : "—"}
                        </Typography>
                    </Box>
                ))}
            </Box>
        </Box>
    );
}
