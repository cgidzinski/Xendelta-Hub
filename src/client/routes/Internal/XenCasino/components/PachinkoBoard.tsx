import { useEffect, useRef, useState } from "react";
import { Box, Button, Slider, Typography } from "@mui/material";
import { formatCheddar } from "../utils/currency";
import { usePachinkoSimWorker } from "../workers/usePachinkoSimWorker";

export type PachinkoOutcome = "gutter" | "tulipLeft" | "tulipRight" | "jackpot" | "bonusLeft" | "bonusRight" | "chucker" | "attacker";

export interface PachinkoTrajectorySample {
    x: number;
    y: number;
    r: number;
    spinnerAngles?: number[]; // per-windmill rotation angles, index matches layout.windmills
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
    jackpotOpenUntil: number; // epoch ms; jackpot pays while Date.now() < this
}

export type ReelMatchTier = "none" | "two" | "three";

export interface PachinkoReelSpin {
    symbols: [string, string, string];
    matchTier: ReelMatchTier;
    ballsAwarded: number;
    attackerBonusMs: number;
}

// What POST /launch now hands back - a cheap claim, not a decided outcome (see pachinko.ts's own
// file header for the whole ticket/confirm shape). The client replays this exact seed itself
// (see usePachinkoSimWorker) to get an instant local preview to animate; nothing here is an
// outcome yet.
export interface PachinkoTicket {
    seed: number;
    launchPower: number;
    chuckerActive: boolean;
    attackerActive: boolean;
    jackpotActive: boolean;
    ballsRemaining: number;
}

// What POST /launch/confirm hands back - the server's own authoritative replay of that same
// seed, which is what actually counts (never anything the client's own local preview claimed).
// `alreadySettled` is true when this seed was already confirmed by an earlier call (a retry
// racing its own prior success, or the server's own opportunistic stale-ticket sweep beating the
// client to it) - every other field is only present when it's not.
export interface PachinkoConfirmResult {
    alreadySettled: boolean;
    outcome?: PachinkoOutcome;
    ballsAwarded?: number;
    reelSpin?: PachinkoReelSpin;
    leftTulipOpen?: boolean;
    rightTulipOpen?: boolean;
    attackerOpenUntil?: number;
    jackpotOpenUntil?: number;
    ballsRemaining?: number;
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
    launchTicket: (launchPower: number) => Promise<PachinkoTicket>;
    confirmLaunch: (seed: number) => Promise<PachinkoConfirmResult>;
    reup: (balls: number) => Promise<unknown>;
    isReuping: boolean;
    onCashOut: () => void;
    isCashingOut: boolean;
    onSessionUpdate: (session: PachinkoSession) => void;
}

const BALL_RADIUS = 2.5; // matches pachinkoLayout.ts's BALL_RADIUS
const PIN_RADIUS = 1.1; // matches pachinkoLayout.ts's PIN_RADIUS
const POCKET_HEIGHT = 18; // matches pachinkoLayout.ts's POCKET_DEPTH - the physical cup every pocket collides against, not just a visual choice
const FRAME_MS = 1000 / 30; // matches the server's ~30fps trajectory sample rate
const POOF_MS = 450; // how long the ball+particle burst takes once a trajectory finishes
const CALLOUT_MS = 1000; // how long the center win/loss callout stays on screen
const FIRE_INTERVAL_MS = 400; // 100 balls/minute while the launch button is held
const MAX_CONCURRENT_BALLS = 20;
// Caps how many /launch ticket requests can be sent but not yet answered at once. /launch is
// cheap now (no physics at all, see pachinko.ts) so this rarely matters anymore, but it's kept
// as the same defense-in-depth against outrunning the server under real load that it always was
// - a no-op when responses return well within FIRE_INTERVAL_MS (the cap never binds), only
// slowing new ticket requests down to match the server's actual response rate if it's ever slow.
const MAX_PENDING_LAUNCHES = 3;
const PARTICLE_COUNT = 12;
const REUP_AMOUNTS = [1000];

// The board's central digital reel - a real modern machine's own "heso" (start chucker) -> LCD
// reel -> bonus round gimmick (see pachinko.ts's chucker branch and pachinkoReels.ts on the
// server for how the result is decided). Centered over the board's own "stage" (see
// pachinkoLayout.ts's STAGE_BOX), the genuinely nail-free ledge directly above the chucker - the
// server excludes this same box from its generated nail field, so it's a true bare gap the ball
// rolls through, not just a pin drawn over on the client. The server only ever deals in generic
// symbol keys (matching slots.ts's own ITEM_A/ITEM_B/.../JACKPOT_ITEM vocabulary); this board owns
// what each one looks like, same as every slots machine page owns its own symbol map.
const REEL_SYMBOLS: Record<string, string> = {
    ITEM_A: "🍒",
    ITEM_B: "🔔",
    ITEM_C: "⭐",
    ITEM_D: "💎",
    JACKPOT_ITEM: "7️⃣",
};
const REEL_FLICKER_POOL = Object.values(REEL_SYMBOLS);
const REEL_BOX = { x: 230, y: 195, width: 120, height: 26 };
const REEL_SPIN_MS = 900; // base spin duration before the first reel starts landing
const REEL_STOP_STAGGER_MS = [0, 220, 440]; // per-reel landing stagger, added to REEL_SPIN_MS
const REEL_FLICKER_INTERVAL_MS = 70;
const REEL_RESULT_GLOW_MS = 1600; // how long a match keeps its glow after the last reel lands
const MAX_QUEUED_SPINS = 6; // chucker goes inactive once this many spins are queued (queue + current)

interface ReelAnimState {
    symbols: [string, string, string];
    matchTier: ReelMatchTier;
    startTime: number;
    // Only set on a three-of-a-kind - applied to the session once THIS spin has visually
    // finished landing (see the tick loop below), not the instant the catch's response arrives.
    attackerOpenUntil?: number;
}

interface ReelQueueItem {
    symbols: [string, string, string];
    matchTier: ReelMatchTier;
    attackerOpenUntil?: number;
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

// One ball's whole client-side lifecycle, same shape as PlinkoBoard's ActiveBall: "pending" from
// the instant the launch ticket request goes out (rendered immediately at the launcher so
// there's no dead gap), "falling" once the LOCAL preview simulation (see usePachinkoSimWorker)
// finishes and starts interpolating - not once the server responds, that's the whole point of
// the ticket/confirm split - "landed" (poof + particle burst) before it's removed.
//
// This is purely the ball's own VISUAL lifecycle now, entirely decoupled from when its shot
// actually gets scored - see the tick loop and confirmFired below for that separate flow.
// `won` is a display-only guess (outcome !== "gutter") for the poof's particle color, since the
// real ballsAwarded isn't known locally; only affects a chucker whiff's particle color, never
// anything that's actually credited.
type ActiveBall =
    | { id: number; phase: "pending" }
    | { id: number; phase: "falling"; trajectory: PachinkoTrajectorySample[]; outcome: PachinkoOutcome; startTime: number }
    | { id: number; phase: "landed"; trajectory: PachinkoTrajectorySample[]; outcome: PachinkoOutcome; won: boolean; landedAt: number; particles: Particle[] };

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
    ctx.font = "bold 9px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, x, y - height / 2 - 4);
}

// The ball award, INSIDE the pocket itself (not just implied by color/label) - used for the
// pockets whose payout is a single fixed number worth spelling out at a glance (bonus, attacker).
function drawPocketAmount(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, color: string) {
    ctx.fillStyle = color;
    ctx.font = "bold 11px sans-serif";
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
 * The reusable Pachinko board - canvas analog of PlinkoBoard, but physics is isomorphic now
 * (see src/shared/pachinko/pachinkoPhysics.ts), not server-only: launchTicket claims a ball and
 * hands back a random seed near-instantly (no physics compute at all), this component replays
 * that exact seed itself off the main thread (see usePachinkoSimWorker) for an instant local
 * preview it animates immediately, and confirmLaunch fires in the background to get the
 * server's own authoritative replay of the same seed - the one that actually decides what a
 * shot paid, never anything this component's own local run claims. See pachinko.ts's own file
 * header for the full protocol and confirmFired below for how the two get reconciled.
 *
 * The economy is ball-only: every catch adds balls to the session's own ballsRemaining, never
 * cheddar directly (see pachinko.ts). The board shows the tray's current cash value; the Cash
 * Out button below converts it back to real cheddar - a deliberate action, not automatic on
 * close (an unattended cash-out on navigate-away can race an in-flight launch still resolving
 * server-side, see Pachinko.tsx's own handleCashOut comment).
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
    launchTicket,
    confirmLaunch,
    reup,
    isReuping,
    onCashOut,
    isCashingOut,
    onSessionUpdate,
}: PachinkoBoardProps) {
    const [callouts, setCallouts] = useState<Callout[]>([]);
    const [launchPower, setLaunchPower] = useState(() => launchPowerRange.min);
    const { simulate } = usePachinkoSimWorker();

    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const rafRef = useRef<number | null>(null);
    const fireIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const activeBallsRef = useRef<Map<number, ActiveBall>>(new Map());
    const pendingLaunchesRef = useRef(0);
    const latestAppliedSeqRef = useRef(0);
    // Confirms now resolve over the network, independently of the RAF loop - under hold-to-fire
    // a burst of them can land within milliseconds of each other, and calling onSessionUpdate
    // (a setState in the parent) once per confirm would fire a separate uncoalesced React
    // re-render for each one, competing with the launch slider's own pointer-move handling for
    // the main thread (this is what made dragging feel unresponsive - confirms used to be
    // implicitly rate-limited by each ball's multi-second flight animation finishing in the tick
    // loop; now they aren't). Every session-affecting confirm merges into this ref instead, and
    // the tick loop below flushes it to onSessionUpdate at most once per animation frame.
    const pendingSessionPatchRef = useRef<Partial<PachinkoSession> | null>(null);
    const reelQueueRef = useRef<ReelQueueItem[]>([]);
    const currentReelAnimRef = useRef<ReelAnimState | null>(null);
    const latestSpinnerAnglesRef = useRef<number[] | undefined>(undefined);
    const latestBallPositionsRef = useRef<{ x: number; y: number }[]>([]);

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

        // Collect current ball positions (used by spinners for hit-reaction detection)
        const positions: { x: number; y: number }[] = [];
        for (const ball of activeBallsRef.current.values()) {
            if (ball.phase === "pending") {
                positions.push({ x: layout.launcherPosition.x, y: layout.launcherPosition.y });
            } else if (ball.phase === "falling") {
                const frames = ball.trajectory;
                const lastIndex = frames.length - 1;
                if (lastIndex >= 0) {
                    const rawIndex = Math.max(0, (now - ball.startTime) / FRAME_MS);
                    const index = Math.min(lastIndex, rawIndex);
                    const i0 = Math.floor(index);
                    const frac = index - i0;
                    const s0 = frames[i0];
                    const s1 = frames[Math.min(lastIndex, i0 + 1)];
                    positions.push({ x: s0.x + (s1.x - s0.x) * frac, y: s0.y + (s1.y - s0.y) * frac });
                }
            } else if (ball.phase === "landed") {
                const frames = ball.trajectory;
                const final = frames[frames.length - 1];
                if (final) positions.push({ x: final.x, y: final.y });
            }
        }
        latestBallPositionsRef.current = positions;

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
        drawReelDisplay(ctx, now, currentReelAnimRef.current);

        // Stars under the reel: one ⭐ per queued spin (excluding the currently-animating one).
        // Gold stars, centered under the reel box, so rapid chucker catches visibly stack.
        if (reelQueueRef.current.length > 0) {
            ctx.save();
            const queueCount = reelQueueRef.current.length;
            const starSpacing = 13;
            const totalWidth = queueCount * starSpacing;
            const startX = REEL_BOX.x - totalWidth / 2 + starSpacing / 2;
            ctx.font = "10px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            for (let i = 0; i < queueCount; i++) {
                ctx.fillText("⭐", startX + i * starSpacing, REEL_BOX.y + REEL_BOX.height / 2 + 3);
            }
            ctx.restore();
        }

        // Spinners - paddle wheels that actually spin and react to ball contact.
        // Rotation angle comes from the server's physics sim via trajectory spinnerAngles.
        // When a ball is near a spinner, it glows brighter (visual "hit" reaction).
        const spinnerAngles = latestSpinnerAnglesRef.current;
        const ballPositions = latestBallPositionsRef.current;
        for (let si = 0; si < layout.windmills.length; si++) {
            const wm = layout.windmills[si];
            const angle = spinnerAngles?.[si] ?? 0;
            // Check if any ball is close to this spinner
            const nearBall = ballPositions.some((bp) => Math.hypot(bp.x - wm.position.x, bp.y - wm.position.y) < wm.radius + BALL_RADIUS + 4);
            const strokeColor = nearBall ? "rgba(255,220,100,0.95)" : "rgba(200,180,140,0.65)";
            const lineW = nearBall ? 2 : 1.4;

            // Outer ring
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = lineW;
            ctx.beginPath();
            ctx.arc(wm.position.x, wm.position.y, wm.radius, 0, Math.PI * 2);
            ctx.stroke();
            // Center hub
            ctx.fillStyle = strokeColor;
            ctx.beginPath();
            ctx.arc(wm.position.x, wm.position.y, 3, 0, Math.PI * 2);
            ctx.fill();
            // Paddle arms - 4 curved blades like a real pachinko spinner
            for (let arm = 0; arm < 4; arm++) {
                const a = angle + (arm * Math.PI) / 2;
                const tipX = wm.position.x + Math.cos(a) * wm.radius;
                const tipY = wm.position.y + Math.sin(a) * wm.radius;
                const midX = wm.position.x + Math.cos(a) * wm.radius * 0.55;
                const midY = wm.position.y + Math.sin(a) * wm.radius * 0.55;
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth = lineW + 1;
                ctx.beginPath();
                ctx.moveTo(wm.position.x, wm.position.y);
                ctx.quadraticCurveTo(midX + Math.cos(a + 0.5) * 4, midY + Math.sin(a + 0.5) * 4, tipX, tipY);
                ctx.stroke();
                // Small paddle tip
                ctx.fillStyle = strokeColor;
                ctx.beginPath();
                ctx.arc(tipX, tipY, 2.5, 0, Math.PI * 2);
                ctx.fill();
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
            drawPocketAmount(ctx, bonus.position.x, bonus.position.y, `${bonusPocketBalls}`, stroke);
        }

        const jackpotOpenUntil = sessionRef.current?.jackpotOpenUntil ?? 0;
        // A primed window (jackpotOpenUntil > 0) that has since lapsed means both tulips are
        // only still reading "open" because the server closes them lazily on the next launch
        // (see shouldCloseLapsedTulips in pachinko.ts) - mirror that same close here against the
        // live clock so the tulips visually snap shut in sync with the jackpot pocket below,
        // instead of staying lit until whatever the next shot happens to be.
        const jackpotWindowLapsed = jackpotOpenUntil > 0 && jackpotOpenUntil <= Date.now();
        const leftOpen = (sessionRef.current?.leftTulipOpen ?? false) && !jackpotWindowLapsed;
        const rightOpen = (sessionRef.current?.rightTulipOpen ?? false) && !jackpotWindowLapsed;
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
            drawPocketAmount(ctx, tulip.position.x, tulip.position.y, `${sideTulipBalls}`, isOpen ? "#08321a" : stroke);
        }

        // Chucker - always active and catchable unless the reel spin queue is full (6 spins
        // queued). When full it greys out so it's visually obvious there's nothing to gain
        // from hitting it again until some spins clear.
        const totalQueuedSpins = (currentReelAnimRef.current ? 1 : 0) + reelQueueRef.current.length;
        const chuckerFull = totalQueuedSpins >= MAX_QUEUED_SPINS;
        const chuckerHot = hotPockets.has("chucker");
        const chuckerStroke = chuckerHot ? "#FFD700" : chuckerFull ? "rgba(170,170,170,0.7)" : "rgba(255,230,150,0.9)";
        drawPocket(
            ctx,
            layout.chucker.position.x,
            layout.chucker.position.y,
            layout.chucker.halfWidth,
            POCKET_HEIGHT,
            chuckerHot ? "rgba(255,215,0,0.4)" : chuckerFull ? "rgba(140,140,140,0.18)" : "rgba(255,215,0,0.2)",
            chuckerStroke,
            { dashed: chuckerFull && !chuckerHot }
        );
        drawPocketLabel(ctx, layout.chucker.position.x, layout.chucker.position.y, POCKET_HEIGHT, chuckerFull ? "CHUCKER - FULL" : "CHUCKER", chuckerStroke);

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
        // Attacker text drawn below the pocket, not above/inside - keeps the wide pocket clean.
        ctx.fillStyle = attackerStroke;
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        const attackerLabelY = layout.attacker.position.y + POCKET_HEIGHT / 2 + 5;
        ctx.fillText(attackerOpen ? "ATTACKER - OPEN" : "ATTACKER", layout.attacker.position.x, attackerLabelY);
        ctx.font = "bold 11px sans-serif";
        ctx.fillText(`${attackerBalls}`, layout.attacker.position.x, attackerLabelY + 14);
        if (attackerOpen) {
            // 2 decimals, not a whole-second countdown - ticking visibly every frame is what
            // actually reads as "fast" and urgent, a whole number only appears to update once a
            // second.
            const secondsLeft = Math.max(0, (attackerOpenUntil - Date.now()) / 1000);
            ctx.fillStyle = "rgba(189,245,207,0.95)";
            ctx.font = "bold 9px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(`${secondsLeft.toFixed(2)}s`, layout.attacker.position.x, attackerLabelY + 28);
        }

        // Jackpot - the tightest pocket on the board, fixed width even when primed. Driven
        // purely by the timed window (jackpotOpenUntil computed above, alongside the same check
        // that keeps the tulips in sync), not the tulip booleans - those only close lazily on
        // the server (the next launch's shouldCloseLapsedTulips check), so falling back to them
        // here would keep showing "OPEN" long after the window actually lapsed.
        const jackpotOpen = jackpotOpenUntil > Date.now();
        const jackpotHot = hotPockets.has("jackpot");
        const jackpotHeight = layout.jackpot.halfWidth * 2.4;
        const jackpotStroke = jackpotHot ? "#FFD700" : jackpotOpen ? "#ffd0dd" : "rgba(170,170,170,0.7)";
        drawPocket(
            ctx,
            layout.jackpot.position.x,
            layout.jackpot.position.y,
            layout.jackpot.halfWidth,
            jackpotHeight,
            jackpotHot ? "rgba(255,215,0,0.4)" : jackpotOpen ? "rgba(255,77,125,0.4)" : "rgba(140,140,140,0.18)",
            jackpotStroke,
            { glow: jackpotHot || !jackpotOpen ? undefined : "rgba(255,77,125,0.9)", dashed: !jackpotOpen && !jackpotHot }
        );
        drawPocketLabel(ctx, layout.jackpot.position.x, layout.jackpot.position.y, jackpotHeight, jackpotOpen ? "JACKPOT - OPEN" : "JACKPOT", jackpotStroke);
        if (jackpotOpen) {
            const secondsLeft = jackpotOpenUntil > Date.now() ? Math.max(0, (jackpotOpenUntil - Date.now()) / 1000) : 0;
            ctx.fillStyle = "rgba(255,77,125,0.95)";
            ctx.font = "bold 9px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(`${secondsLeft.toFixed(2)}s`, layout.jackpot.position.x, layout.jackpot.position.y + jackpotHeight / 2 + 12);
        }

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
                const frames = ball.trajectory;
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
                // Capture spinner angles from the current trajectory frame for rendering
                if (s0.spinnerAngles) latestSpinnerAnglesRef.current = s0.spinnerAngles;
                ctx.fillStyle = "#FF6B6B";
                ctx.beginPath();
                ctx.arc(x, y, BALL_RADIUS, 0, Math.PI * 2);
                ctx.fill();
            } else if (ball.phase === "landed") {
                const frames = ball.trajectory;
                const final = frames[frames.length - 1] ?? layout.releasePoint;
                const t = Math.min(1, (now - ball.landedAt) / POOF_MS);

                const remainingRadius = BALL_RADIUS * (1 - t);
                if (remainingRadius > 0.3) {
                    ctx.fillStyle = `rgba(255,107,107,${1 - t})`;
                    ctx.beginPath();
                    ctx.arc(final.x, final.y, remainingRadius, 0, Math.PI * 2);
                    ctx.fill();
                }

                const won = ball.won;
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
                    const lastIndex = ball.trajectory.length - 1;
                    const elapsedFrames = (now - ball.startTime) / FRAME_MS;
                    if (elapsedFrames >= lastIndex) {
                        // Purely visual - the confirmed outcome (callout, reel queue, session
                        // update) is driven separately, by confirmFired below, whenever the
                        // server's own reply actually arrives (see fireOnce). That's usually
                        // close to this same moment - confirm is a cheap background call, not a
                        // multi-second physics round trip anymore - but never gated on it, so a
                        // slow confirm can't leave a ball hanging mid-air.
                        const { trajectory, outcome } = ball;
                        activeBallsRef.current.set(ball.id, { id: ball.id, phase: "landed", trajectory, outcome, won: outcome !== "gutter", landedAt: now, particles: makeParticles() });
                    }
                } else if (ball.phase === "landed") {
                    if (now - ball.landedAt >= POOF_MS) {
                        toRemove.push(ball.id);
                    } else if (ball.outcome === "bonusLeft") {
                        hotPockets.add("bonus-left");
                    } else if (ball.outcome === "bonusRight") {
                        hotPockets.add("bonus-right");
                    } else if (ball.outcome === "tulipLeft") {
                        hotPockets.add("tulip-left");
                    } else if (ball.outcome === "tulipRight") {
                        hotPockets.add("tulip-right");
                    } else if (ball.outcome === "chucker") {
                        hotPockets.add("chucker");
                    } else if (ball.outcome === "attacker") {
                        hotPockets.add("attacker");
                    } else if (ball.outcome === "jackpot") {
                        hotPockets.add("jackpot");
                    }
                }
            }
            for (const id of toRemove) {
                activeBallsRef.current.delete(id);
            }

            // Reel spin queue: if the current animation has fully finished (all reels landed +
            // glow elapsed) and there's a queued spin waiting, start the next one.
            if (currentReelAnimRef.current) {
                const lastStopAt = REEL_SPIN_MS + (REEL_STOP_STAGGER_MS[REEL_STOP_STAGGER_MS.length - 1] ?? 0);
                const finishedAt = currentReelAnimRef.current.startTime + lastStopAt + REEL_RESULT_GLOW_MS;
                if (now >= finishedAt) {
                    // The attacker only actually opens once ITS OWN spin has visually landed on
                    // the three-of-a-kind that earned it - apply the deferred update right as
                    // that spin's animation concludes, not the instant the catch's response
                    // arrived (see where this is queued, above). Also merged into the pending
                    // patch (see pendingSessionPatchRef) rather than applied directly, so it
                    // can't land as a second separate re-render in the same frame as any other
                    // confirm that happens to resolve right now.
                    if (currentReelAnimRef.current.attackerOpenUntil !== undefined && sessionRef.current) {
                        pendingSessionPatchRef.current = { ...pendingSessionPatchRef.current, attackerOpenUntil: currentReelAnimRef.current.attackerOpenUntil };
                    }
                    if (reelQueueRef.current.length > 0) {
                        const next = reelQueueRef.current.shift()!;
                        currentReelAnimRef.current = { symbols: next.symbols, matchTier: next.matchTier, startTime: now, attackerOpenUntil: next.attackerOpenUntil };
                    } else {
                        currentReelAnimRef.current = null;
                    }
                }
            } else if (reelQueueRef.current.length > 0) {
                const next = reelQueueRef.current.shift()!;
                currentReelAnimRef.current = { symbols: next.symbols, matchTier: next.matchTier, startTime: now, attackerOpenUntil: next.attackerOpenUntil };
            }

            // Flush at most once per frame - see pendingSessionPatchRef's own comment. Any
            // number of confirms can have merged into it since the last flush; this is the one
            // place that ever actually calls onSessionUpdate now.
            if (pendingSessionPatchRef.current && sessionRef.current) {
                onSessionUpdate({ ...sessionRef.current, ...pendingSessionPatchRef.current });
                pendingSessionPatchRef.current = null;
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

    // What actually scores a shot - called the instant a ticket comes back (in parallel with the
    // local preview simulation below, not after it), and again on retry if it fails. Never
    // anything the firing loop waits on: a slow or repeatedly-failing confirm only means this one
    // ball's credit is delayed, not that hold-to-fire itself should stop (that blanket "any single
    // failure kills the whole session" behavior was the actual bug behind Pachinko becoming
    // unplayable under load - see the investigation this whole ticket/confirm redesign answers).
    // The server has its own safety net regardless (a stale ticket gets opportunistically settled
    // on the player's next launch, or by the stale-round sweep if they stop playing entirely), so
    // giving up after a few local retries is safe, not a real loss.
    const CONFIRM_MAX_ATTEMPTS = 4;
    const CONFIRM_RETRY_DELAY_MS = 1000;
    const confirmFired = (seed: number, seq: number, attempt = 0) => {
        confirmLaunch(seed)
            .then((confirmed) => {
                if (confirmed.alreadySettled) {
                    return;
                }
                const outcome = confirmed.outcome!;
                const ballsAwarded = confirmed.ballsAwarded!;

                // Misses don't get a popup - they're the most common outcome by far, so
                // surfacing them would mostly just be clutter; only an actual catch (even a
                // 0-ball one like a non-matching chucker spin) is worth calling out.
                if (outcome !== "gutter") {
                    const calloutId = nextCalloutId++;
                    setCallouts((prev) => [...prev, { id: calloutId, outcome, ballsAwarded, won: ballsAwarded > 0 }]);
                    setTimeout(() => setCallouts((prev) => prev.filter((c) => c.id !== calloutId)), CALLOUT_MS);
                }

                // The chucker's reel spin only exists once confirmed (see pachinko.ts - it's
                // decided fresh at confirm time, not predictable from the client's own seed).
                // Each catch queues a spin; they animate one at a time so rapid chucker hits
                // stack visually instead of clobbering each other. Capped at MAX_QUEUED_SPINS
                // total (current + queued) - once full, further catches are silently dropped.
                let deferAttackerUpdate = false;
                if (outcome === "chucker" && confirmed.reelSpin) {
                    const totalQueued = (currentReelAnimRef.current ? 1 : 0) + reelQueueRef.current.length;
                    if (totalQueued < MAX_QUEUED_SPINS) {
                        const isThreeMatch = confirmed.reelSpin.matchTier === "three";
                        reelQueueRef.current.push({
                            symbols: confirmed.reelSpin.symbols,
                            matchTier: confirmed.reelSpin.matchTier,
                            // The attacker only actually opens once this spin has visually landed
                            // on the three-of-a-kind that earned it (applied by the tick loop
                            // below) - not the instant it's queued here.
                            attackerOpenUntil: isThreeMatch ? confirmed.attackerOpenUntil : undefined,
                        });
                        deferAttackerUpdate = isThreeMatch;
                    }
                }

                // Confirms can resolve out of order under hold-to-fire - only apply this one's
                // session state if it's actually the freshest shot to confirm so far, so a late
                // confirm for an earlier ball can never regress ballsRemaining or stomp a more
                // recent tulip/attacker state change. Merges into the pending patch rather than
                // calling onSessionUpdate directly - see pendingSessionPatchRef's own comment for
                // why. attackerOpenUntil is deliberately left out of the patch when deferred, not
                // set to the current value, so it doesn't clobber whatever an earlier still-
                // pending patch (or the eventual reel-landing update below) is holding there.
                if (seq > latestAppliedSeqRef.current && sessionRef.current) {
                    latestAppliedSeqRef.current = seq;
                    pendingSessionPatchRef.current = {
                        ...pendingSessionPatchRef.current,
                        ballsRemaining: confirmed.ballsRemaining!,
                        leftTulipOpen: confirmed.leftTulipOpen!,
                        rightTulipOpen: confirmed.rightTulipOpen!,
                        jackpotOpenUntil: confirmed.jackpotOpenUntil!,
                        ...(deferAttackerUpdate ? {} : { attackerOpenUntil: confirmed.attackerOpenUntil! }),
                    };
                }
            })
            .catch(() => {
                if (attempt < CONFIRM_MAX_ATTEMPTS) {
                    setTimeout(() => confirmFired(seed, seq, attempt + 1), CONFIRM_RETRY_DELAY_MS);
                }
                // Attempts exhausted - give up quietly rather than surfacing a scary error toast
                // for something that's already self-healing server-side (see this function's own
                // header).
            });
    };

    const fireOnce = () => {
        if (ballsRemainingRef.current <= 0) {
            stopFiring();
            return;
        }
        if (activeBallsRef.current.size >= MAX_CONCURRENT_BALLS) {
            return;
        }
        if (pendingLaunchesRef.current >= MAX_PENDING_LAUNCHES) {
            return;
        }
        const id = nextBallId++;
        const seq = ++nextLaunchSeq;
        activeBallsRef.current.set(id, { id, phase: "pending" });
        ballsRemainingRef.current -= 1;
        pendingLaunchesRef.current += 1;

        launchTicket(launchPowerRef.current)
            .then((ticket) => {
                pendingLaunchesRef.current -= 1;

                // Confirm runs in the background immediately, in parallel with the local preview
                // below - it doesn't need to wait on the (purely visual) simulation to finish,
                // and never blocks the next shot from firing.
                confirmFired(ticket.seed, seq);

                // Instant local preview - the whole point of the ticket/confirm split. Never
                // trusted for scoring (see confirmFired above), just what the player sees fly.
                simulate({
                    seed: ticket.seed,
                    launchPower: ticket.launchPower,
                    chuckerActive: ticket.chuckerActive,
                    attackerActive: ticket.attackerActive,
                    jackpotActive: ticket.jackpotActive,
                }).then(({ trajectory, outcome }) => {
                    // The ball may have already been removed (e.g. the player closed the game)
                    // by the time the worker responds - don't resurrect it.
                    if (activeBallsRef.current.has(id)) {
                        activeBallsRef.current.set(id, { id, phase: "falling", trajectory, outcome, startTime: performance.now() });
                    }
                });
            })
            .catch(() => {
                pendingLaunchesRef.current -= 1;
                activeBallsRef.current.delete(id);
                ballsRemainingRef.current += 1;
                // Deliberately NOT calling stopFiring() here - a single failed ticket request
                // (a network hiccup, a transient 409) shouldn't end the whole hold-to-fire
                // session. The ballsRemainingRef <= 0 check at the top of this function is the
                // only thing that should ever stop firing on its own.
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
                {/* Same Jackpot/readout header style as SlotMachine.tsx - overline label + bold
                    tabular-nums value, jackpot on the left, this board's own per-round number
                    (balls remaining) on the right in place of Slots' "Per Spin". */}
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, mb: 2 }}>
                    <Box sx={{ minWidth: 64, textAlign: "left" }}>
                        <Typography variant="overline" sx={{ letterSpacing: 1.5, color: "warning.main", fontWeight: 700, display: "block", lineHeight: 1.2, fontSize: "0.65rem" }}>
                            Jackpot
                        </Typography>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, color: "warning.light", fontVariantNumeric: "tabular-nums" }}>
                            🧀{formatCheddar(jackpotPool)}
                        </Typography>
                    </Box>

                    <Box sx={{ minWidth: 64, textAlign: "right" }}>
                        <Typography variant="overline" sx={{ letterSpacing: 1.5, color: "text.secondary", fontWeight: 700, display: "block", lineHeight: 1.2, fontSize: "0.65rem" }}>
                            Balls
                        </Typography>
                        <Typography variant="subtitle2" sx={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                            🔴{ballsRemaining}
                        </Typography>
                    </Box>
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

            <Box sx={{ px: 4, mt: 2.5 }}>
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
                        +{amount}🔴 (🧀{formatCheddar(amount * pricePerBall)})
                    </Button>
                ))}
                {/* The only way a tray ever converts back to real cheddar - deliberate, not
                    automatic on close (see Pachinko.tsx's own handleCashOut comment for why an
                    unattended cash-out on navigate-away used to race in-flight launches). */}
                <Button
                    variant="contained"
                    color="warning"
                    onClick={onCashOut}
                    disabled={isCashingOut || isResuming || ballsRemaining <= 0}
                    sx={{ borderRadius: 999, px: 3, fontWeight: 700, textTransform: "none" }}
                >
                    Cash Out
                </Button>
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
                            {callout.ballsAwarded > 0 ? `${callout.ballsAwarded} balls` : "—"}
                        </Typography>
                    </Box>
                ))}
            </Box>
        </Box>
    );
}
