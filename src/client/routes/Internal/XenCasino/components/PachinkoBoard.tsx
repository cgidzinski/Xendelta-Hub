import { useEffect, useRef, useState } from "react";
import { Box, Button, Slider, Typography } from "@mui/material";
import { formatCheddar } from "../utils/currency";
import { usePachinkoSimWorker } from "../workers/usePachinkoSimWorker";
import { applyShotOutcome, EconomyGateState } from "../../../../../shared/pachinko/economy";

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
    // The server's own ordering cursor for this round (see pachinko.ts's own field of the same
    // name) - lets a resumed/reloaded board continue its local seq counter without colliding with
    // seqs the server already processed before the page was closed/refreshed.
    lastProcessedSeq: number;
}

export type ReelMatchTier = "none" | "two" | "three";

export interface PachinkoReelSpin {
    symbols: [string, string, string];
    matchTier: ReelMatchTier;
    ballsAwarded: number;
    attackerBonusMs: number;
}

// One shot as fired locally, queued for batch reporting - just enough for the server to replay
// it (seed + launchPower) plus its firing order (seq). See pachinko.ts's own file header: the
// server never trusts anything else about a shot, only re-derives outcome and gate state itself.
export interface QueuedShot {
    seq: number;
    seed: number;
    launchPower: number;
}

// What POST /launch/batch hands back - the server's own authoritative replay of every shot in
// the batch that hadn't already been processed, plus the round's resulting state. `results` is
// keyed by seq so the client can correlate each entry back to the locally-fired ball(s) it
// covers and correct its own optimistic guess (see the economy mirror in
// src/shared/pachinko/economy.ts and reconcileBatch below) - never the other way around.
export interface PachinkoBatchResult {
    seq: number;
    outcome: PachinkoOutcome;
    ballsAwarded: number;
    reelSpin?: PachinkoReelSpin;
    attackerOpenUntil?: number; // only present on a chucker catch - see pachinko.ts's own comment on why this has to be per-shot, not the batch's final value
}

export interface PachinkoBatchResponse {
    results: PachinkoBatchResult[];
    leftTulipOpen: boolean;
    rightTulipOpen: boolean;
    attackerOpenUntil: number;
    jackpotOpenUntil: number;
    ballsRemaining: number;
    lastProcessedSeq: number;
}

export interface PachinkoBoardProps {
    session: PachinkoSession | null;
    layout: PachinkoLayoutData | null;
    jackpotPool: number;
    cashOutRate: number;
    bonusPocketBalls: number;
    sideTulipBalls: number;
    attackerBalls: number;
    jackpotOpenMs: number;
    launchPowerRange: { min: number; max: number };
    pricePerBall: number; // needed even when session is null, so reup button costs can show before any batch exists
    isResuming: boolean; // the post-open "resume an existing batch?" check is in flight
    reportBatch: (shots: QueuedShot[]) => Promise<PachinkoBatchResponse>;
    reup: (balls: number) => Promise<unknown>;
    isReuping: boolean;
    // Called once any not-yet-reported shots have been flushed and acknowledged (see
    // flushAllPending below) - only then does the server's own ballsRemaining reflect every shot
    // the player actually fired, which is what Cash Out has to read, never the client's own guess.
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
const PARTICLE_COUNT = 12;
const REUP_AMOUNTS = [1000];

// Batched shot reporting - see the file header. A queued shot flushes to POST /launch/batch once
// either threshold is hit, whichever comes first: enough shots have piled up, or enough time has
// passed since the last flush (so a slow, deliberate player still reports promptly instead of
// waiting on a 5th shot that may never come). Neither threshold ever blocks firing itself - see
// flushBatch below.
const BATCH_SIZE_THRESHOLD = 5;
const BATCH_TIME_THRESHOLD_MS = 750;
// How many times Cash Out will retry flushing not-yet-reported shots before giving up and reading
// whatever ballsRemaining the server already has - see flushAllPending. Bounded, not infinite: a
// genuinely offline player shouldn't have Cash Out hang forever.
const CASHOUT_FLUSH_MAX_ATTEMPTS = 5;

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
    // True until a batch response fills in this catch's real reel result (see reconcileBatch) -
    // the reel result (spinReel's crypto.randomInt draw) is deliberately server-only, so a chucker
    // catch queues a placeholder the instant it's hit and only starts actually spinning-to-land
    // once real symbols exist; `symbols`/`matchTier` are dummy values while this is true, never
    // drawn (see the tick loop's queue-advance, which never promotes a pending item to "current").
    pending: boolean;
    // The shot that queued this placeholder - reconcileBatch matches its incoming results back to
    // a queue entry by this exact seq, never by array position/FIFO order. A batch report's round
    // trip is routinely faster than this ball's own multi-second flight, so the real result can
    // (and often does) arrive before this ball has even landed and pushed its own placeholder -
    // FIFO "first pending" matching would then fill in the WRONG entry (a different, later shot's
    // still-queued placeholder) once one eventually exists. See pendingReelResultsRef for the
    // other half of this - where a result that arrives before its own placeholder exists gets held.
    seq: number;
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
// the instant it's fired (rendered immediately at the launcher so there's no dead gap), "falling"
// once the sim worker resolves and its trajectory starts interpolating, "landed" (poof + particle
// burst) before it's removed.
//
// The shot's SCORING truth (localGateStateRef) is decided the instant the worker resolves,
// independent of this animation - it has to be, so the next shot's own local preview reads
// correct gate state (see applyLocalOutcome's own comment). But this ball's own player-facing
// REWARD (tray-count bump, callout popup, chucker reel spin) is deliberately carried here
// (`ballsAwarded`/`queueChuckerSpin`) rather than applied the instant it's known, and only
// released once this specific ball reaches "landed" (see releaseLandedReward, called from the
// tick loop) - so the player never sees a catch's payoff before the ball that earned it has
// visibly arrived. `won` is a display-only guess (outcome !== "gutter") for the poof's particle
// color, not itself used for scoring.
type ActiveBall =
    | { id: number; phase: "pending" }
    | { id: number; phase: "falling"; trajectory: PachinkoTrajectorySample[]; outcome: PachinkoOutcome; startTime: number; seq: number; ballsAwarded: number; queueChuckerSpin: boolean }
    | { id: number; phase: "landed"; trajectory: PachinkoTrajectorySample[]; outcome: PachinkoOutcome; won: boolean; landedAt: number; particles: Particle[] };

let nextBallId = 0;
let nextCalloutId = 0;

// A fresh 32-bit seed per shot, straight from the browser's CSPRNG - crypto.getRandomValues
// rather than Math.random() since this seed is what the server independently replays to decide
// the whole shot (see pachinko.ts's own file header); Math.random() is fine for cosmetic-only
// randomness elsewhere on this board (particles, etc.) but not for the one value that actually
// decides an outcome.
function randomSeed(): number {
    return crypto.getRandomValues(new Uint32Array(1))[0];
}

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
function drawReelDisplay(ctx: CanvasRenderingContext2D, now: number, anim: ReelAnimState | null, awaitingResult: boolean) {
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
        } else if (awaitingResult) {
            // A chucker was hit but the batch reporting it hasn't come back yet (see
            // ReelQueueItem's own comment) - keeps flickering indefinitely rather than "landing",
            // since there's nothing to land on yet.
            symbol = REEL_FLICKER_POOL[Math.floor(now / REEL_FLICKER_INTERVAL_MS) % REEL_FLICKER_POOL.length];
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
 * (see src/shared/pachinko/pachinkoPhysics.ts) and firing is fully client-first: every shot
 * generates its own seed and sequence number locally (randomSeed/nextSeqRef), reads gate state
 * from this component's own local economy mirror (localGateStateRef, see
 * src/shared/pachinko/economy.ts), runs the sim worker, and animates immediately - zero network
 * dependency between pressing fire and the ball moving. Fired shots are queued and reported to
 * POST /launch/batch in the background (see flushBatch) - the server is the sole authority on
 * what actually happened, replaying each shot's seed itself; this component's own local run is
 * only ever an optimistic preview, corrected once a batch response reconciles it (see
 * reconcileBatch). See pachinko.ts's own file header for the full protocol.
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
    jackpotOpenMs,
    launchPowerRange,
    pricePerBall,
    isResuming,
    reportBatch,
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
    // Session updates now come from two places that can both fire within milliseconds of each
    // other under hold-to-fire: this component's own optimistic per-shot update (fireOnce, below)
    // and a batch reconciliation (reconcileBatch). Calling onSessionUpdate (a setState in the
    // parent) once per shot would fire a separate uncoalesced React re-render for each one,
    // competing with the launch slider's own pointer-move handling for the main thread (this is
    // what made dragging feel unresponsive before). Every session-affecting update merges into
    // this ref instead, and the tick loop below flushes it to onSessionUpdate at most once per
    // animation frame.
    const pendingSessionPatchRef = useRef<Partial<PachinkoSession> | null>(null);
    const reelQueueRef = useRef<ReelQueueItem[]>([]);
    const currentReelAnimRef = useRef<ReelAnimState | null>(null);
    const latestSpinnerAnglesRef = useRef<number[] | undefined>(undefined);
    const latestBallPositionsRef = useRef<{ x: number; y: number }[]>([]);

    const sessionRef = useRef(session);
    sessionRef.current = session;
    const launchPowerRef = useRef(launchPower);
    launchPowerRef.current = launchPower;
    // flushBatch (below) is called from inside the tick RAF loop's own closure, which - like
    // every callback prop this board holds onto across renders - needs the CURRENT reportBatch,
    // not whatever identity it happened to have on the render the loop's effect last ran.
    const reportBatchRef = useRef(reportBatch);
    reportBatchRef.current = reportBatch;

    // This component's own local mirror of the round's economy (see
    // src/shared/pachinko/economy.ts) - what fireOnce actually reads and writes synchronously on
    // every shot, since waiting on the session prop to round-trip through React state (or worse,
    // through a batch response) would reintroduce exactly the kind of lag this whole redesign
    // exists to remove. Reset wholesale when the round itself changes (fresh buy / resumed
    // session) and nudged by exactly a reup's own delta when one lands - see the effect below.
    const localGateStateRef = useRef<EconomyGateState>({
        ballsRemaining: session?.ballsRemaining ?? 0,
        leftTulipOpen: session?.leftTulipOpen ?? false,
        rightTulipOpen: session?.rightTulipOpen ?? false,
        attackerOpenUntil: session?.attackerOpenUntil ?? 0,
        jackpotOpenUntil: session?.jackpotOpenUntil ?? 0,
    });
    // What's actually SHOWN to the player, as opposed to localGateStateRef's own ballsRemaining
    // (the internal truth, updated the instant a shot's cost/outcome is known so the NEXT shot's
    // own local preview reads correct gate state). These two necessarily diverge while any ball
    // is still in flight: a shot's -1 firing cost is real and shown immediately (see fireOnce -
    // a ball leaving the tray the moment it launches is intuitive), but its +ballsAwarded reward
    // is only released into THIS ref once that specific ball visibly lands (see
    // releaseLandedReward) - never before, which is the whole fix for the "chucker going off
    // before a ball hits it" bug. This is the only ref that ever feeds
    // pendingSessionPatchRef.current.ballsRemaining from here on.
    const visibleBallsRemainingRef = useRef(session?.ballsRemaining ?? 0);
    const lastSyncedRoundIdRef = useRef<string | null>(session?.roundId ?? null);
    const lastSyncedBallsTotalRef = useRef<number>(session?.ballsTotal ?? 0);
    // This board's own local firing-order cursor - assigned to each shot as it fires (see
    // fireOnce) and never reused, resumed from the server's own lastProcessedSeq on load/reopen
    // so it can't collide with seqs an earlier visit already got processed (see PachinkoSession's
    // own comment on the field).
    const nextSeqRef = useRef(session?.lastProcessedSeq ?? 0);
    // The highest seq this board has already folded a batch result for - guards reconcileBatch
    // against re-applying the same correction twice if responses ever arrive with overlapping
    // seqs (shouldn't normally happen given processBatch's own idempotency, but cheap to guard).
    const lastReconciledSeqRef = useRef(session?.lastProcessedSeq ?? 0);
    // What THIS shot's own optimistic applyShotOutcome call assumed its ballsAwarded was (0 for
    // chucker/gutter, exact for bonus/tulip/attacker, a pool-based estimate for jackpot) - kept
    // per-seq so reconcileBatch can correct localGateStateRef.ballsRemaining by exactly the
    // difference between that guess and the server's own authoritative figure, never more.
    // Entries are deleted once reconciled so this can't grow unbounded across a long session.
    const shotAssumptionsRef = useRef<Map<number, number>>(new Map());
    // Holds a chucker catch's real, server-confirmed reel result (see ReelQueueItem's own
    // comment) for shots whose ball hasn't visually landed yet when reconcileBatch processes
    // their result - the common case, since a batch round trip is normally faster than a ball's
    // multi-second flight. Consumed and deleted by releaseLandedReward once that ball actually
    // lands; also cleared on round reset alongside shotAssumptionsRef, so a catch dropped for
    // being over MAX_QUEUED_SPINS capacity (whose entry here would otherwise never be consumed)
    // can't accumulate indefinitely across a session.
    const pendingReelResultsRef = useRef<Map<number, { symbols: [string, string, string]; matchTier: ReelMatchTier; attackerOpenUntil?: number }>>(new Map());
    // Shots fired locally but not yet included in a request to /launch/batch - see flushBatch.
    const pendingShotsRef = useRef<QueuedShot[]>([]);
    const lastFlushAtRef = useRef(0);
    const flushInFlightRef = useRef(false);
    // The currently in-flight flush's own promise, if any - lets flushAllPending (Cash Out) await
    // whatever's already in flight instead of racing a second overlapping request against it.
    const flushPromiseRef = useRef<Promise<void> | null>(null);

    const plungerReleaseRef = useRef<(() => void) | null>(null);

    // Keeps the local economy mirror in step with session changes that DIDN'T originate from this
    // component's own firing/reconciliation - a fresh buy or a resumed round (roundId changes, a
    // full reset from the server's own snapshot) and a reup on the current round (ballsTotal
    // grows - see Pachinko.tsx's applyBuyResponse - by exactly the number of balls just bought,
    // applied as a delta on top of whatever the local mirror already has rather than overwritten
    // wholesale, so a reup landing mid-hold-to-fire can't stomp balls a shot already credited
    // locally but hasn't made it back into the session prop yet).
    useEffect(() => {
        if (!session) {
            return;
        }
        if (session.roundId !== lastSyncedRoundIdRef.current) {
            lastSyncedRoundIdRef.current = session.roundId;
            lastSyncedBallsTotalRef.current = session.ballsTotal;
            nextSeqRef.current = session.lastProcessedSeq;
            lastReconciledSeqRef.current = session.lastProcessedSeq;
            shotAssumptionsRef.current.clear();
            pendingReelResultsRef.current.clear();
            pendingShotsRef.current = [];
            localGateStateRef.current = {
                ballsRemaining: session.ballsRemaining,
                leftTulipOpen: session.leftTulipOpen,
                rightTulipOpen: session.rightTulipOpen,
                attackerOpenUntil: session.attackerOpenUntil,
                jackpotOpenUntil: session.jackpotOpenUntil,
            };
            visibleBallsRemainingRef.current = session.ballsRemaining;
        } else if (session.ballsTotal !== lastSyncedBallsTotalRef.current) {
            const delta = session.ballsTotal - lastSyncedBallsTotalRef.current;
            lastSyncedBallsTotalRef.current = session.ballsTotal;
            localGateStateRef.current = { ...localGateStateRef.current, ballsRemaining: localGateStateRef.current.ballsRemaining + delta };
            visibleBallsRemainingRef.current += delta;
        }
    }, [session]);

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
        drawReelDisplay(ctx, now, currentReelAnimRef.current, !currentReelAnimRef.current && (reelQueueRef.current[0]?.pending ?? false));

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
                        // This shot's scoring TRUTH (localGateStateRef) was already applied back
                        // in fireOnce/applyLocalOutcome, the instant the sim worker resolved -
                        // that has to stay immediate so the next fired shot's own local preview
                        // reads correct gate state (see applyLocalOutcome's own comment). What
                        // happens HERE is different: this is the ball's own visual arrival, and
                        // it's the one true moment this specific shot's player-facing reward
                        // (tray-count bump, callout popup, chucker reel spin) is released - see
                        // releaseLandedReward - so nothing the player sees ever claims a catch
                        // before the ball that earned it has actually arrived.
                        const { trajectory, outcome } = ball;
                        releaseLandedReward(ball);
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
            // glow elapsed) and there's a queued spin waiting WITH real data (never promote a
            // still-pending placeholder - see ReelQueueItem's own comment), start the next one.
            if (currentReelAnimRef.current) {
                const lastStopAt = REEL_SPIN_MS + (REEL_STOP_STAGGER_MS[REEL_STOP_STAGGER_MS.length - 1] ?? 0);
                const finishedAt = currentReelAnimRef.current.startTime + lastStopAt + REEL_RESULT_GLOW_MS;
                if (now >= finishedAt) {
                    // This is purely a DISPLAY update - the attacker pocket only visibly reads
                    // "open" once its own spin has visually landed on the three-of-a-kind that
                    // earned it, not the instant the batch response reporting it arrived. The gate
                    // TRUTH (localGateStateRef) already updated back in reconcileBatch, the moment
                    // that response was processed - it has to, so shots fired locally in the
                    // meantime read correct gate state (see reconcileBatch's own comment on this).
                    // Merged into the pending patch (see pendingSessionPatchRef) rather than
                    // applied directly, so it can't land as a second separate re-render in the
                    // same frame as any other update that happens to land right now.
                    if (currentReelAnimRef.current.attackerOpenUntil !== undefined) {
                        pendingSessionPatchRef.current = { ...pendingSessionPatchRef.current, attackerOpenUntil: currentReelAnimRef.current.attackerOpenUntil };
                    }
                    if (reelQueueRef.current.length > 0 && !reelQueueRef.current[0].pending) {
                        const next = reelQueueRef.current.shift()!;
                        currentReelAnimRef.current = { symbols: next.symbols, matchTier: next.matchTier, startTime: now, attackerOpenUntil: next.attackerOpenUntil };
                    } else {
                        currentReelAnimRef.current = null;
                    }
                }
            } else if (reelQueueRef.current.length > 0 && !reelQueueRef.current[0].pending) {
                const next = reelQueueRef.current.shift()!;
                currentReelAnimRef.current = { symbols: next.symbols, matchTier: next.matchTier, startTime: now, attackerOpenUntil: next.attackerOpenUntil };
            }

            // Cheap due-check every frame - see flushBatch's own comment. Actually posts only
            // when a threshold (queue size or time since last flush) is met; a no-op otherwise.
            flushBatch();

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

    // Sends whatever's queued in pendingShotsRef to POST /launch/batch - see the file header and
    // BATCH_SIZE_THRESHOLD/BATCH_TIME_THRESHOLD_MS's own comment for when. Never something firing
    // waits on: called opportunistically (after every shot, and once per tick-loop frame so a
    // short burst that never hits the count threshold still flushes on the time one) and a no-op
    // whenever neither threshold is actually due, or a flush is already in flight - the next due
    // check picks up whatever's accumulated since. `force` skips both threshold checks (but still
    // respects "already in flight" - see flushAllPending for how Cash Out waits that out instead
    // of racing it).
    const flushBatch = (force = false): Promise<void> => {
        if (flushInFlightRef.current) {
            return flushPromiseRef.current ?? Promise.resolve();
        }
        if (pendingShotsRef.current.length === 0) {
            return Promise.resolve();
        }
        const due = force || pendingShotsRef.current.length >= BATCH_SIZE_THRESHOLD || Date.now() - lastFlushAtRef.current >= BATCH_TIME_THRESHOLD_MS;
        if (!due) {
            return Promise.resolve();
        }

        const shots = pendingShotsRef.current;
        pendingShotsRef.current = [];
        lastFlushAtRef.current = Date.now();
        flushInFlightRef.current = true;

        const promise = reportBatchRef
            .current(shots)
            .then((response) => reconcileBatch(response))
            .catch(() => {
                // Never blocks firing (see the file header) - put the shots back so the next due
                // flush retries them; nothing about a failed report undoes what already fired
                // locally, it just means the server doesn't know about it yet.
                pendingShotsRef.current = [...shots, ...pendingShotsRef.current];
            })
            .finally(() => {
                flushInFlightRef.current = false;
                flushPromiseRef.current = null;
            });
        flushPromiseRef.current = promise;
        return promise;
    };

    // Folds a batch response's per-shot results into the local economy mirror and reel queue -
    // the correction point for the two things this board can't predict exactly on its own (see
    // economy.ts's own header): a chucker's real reel award, and a jackpot's real pool-derived
    // one. Every other outcome is fully deterministic from constants both sides already know, so
    // this correction should normally be 0.
    const reconcileBatch = (response: PachinkoBatchResponse) => {
        for (const result of response.results) {
            if (result.seq <= lastReconciledSeqRef.current) {
                continue; // shouldn't normally happen (processBatch is idempotent by seq), but cheap to guard
            }
            lastReconciledSeqRef.current = result.seq;

            const assumed = shotAssumptionsRef.current.get(result.seq) ?? 0;
            shotAssumptionsRef.current.delete(result.seq);
            const correction = result.ballsAwarded - assumed;
            if (correction !== 0) {
                // Kept immediate, not gated on this shot's own ball landing - a batch round trip
                // is normally slower than one ball's ~1-3s flight, so by the time a correction
                // arrives the ball in question has typically already landed and released its
                // (slightly wrong) assumed reward; gating this on landing would either be a no-op
                // or confusingly re-delay a correction that has nothing to do with any ball still
                // in flight. Routed through visibleBallsRemainingRef (not localGateStateRef
                // directly) since that's the only ref allowed to feed the visible tray count -
                // see its own comment.
                localGateStateRef.current = { ...localGateStateRef.current, ballsRemaining: localGateStateRef.current.ballsRemaining + correction };
                visibleBallsRemainingRef.current += correction;
                pendingSessionPatchRef.current = { ...pendingSessionPatchRef.current, ballsRemaining: visibleBallsRemainingRef.current };
            }

            if (result.outcome === "chucker" && result.reelSpin) {
                const isThreeMatch = result.reelSpin.matchTier === "three";
                const attackerOpenUntil = isThreeMatch ? result.attackerOpenUntil : undefined;

                // The GATE TRUTH updates right here, the instant this batch response is
                // processed - it has to, same reason as everything else in localGateStateRef:
                // the very next locally-fired shot reads this for its own chuckerActive/
                // attackerActive params, and the server applied this exact change the instant it
                // processed this shot in seq order, with no concept of animation time at all. An
                // earlier version of this fix mistakenly folded this into the tick loop's own
                // reel-landing block instead (see below) - up to several seconds later, during
                // which every shot fired locally used a stale attacker window for its own
                // physics, close enough to the tulips (chucker/attacker sit right above them) to
                // produce genuinely wrong local-preview outcomes near them. Processed in strict
                // seq order (existing lastReconciledSeqRef guard above), so this stays correctly
                // cumulative across multiple three-matches, same as the server's own
                // Math.max(now, attackerOpenUntil) + reelSpin.attackerOpenMs stacking.
                if (isThreeMatch) {
                    // Always present on any chucker result (see pachinko.ts's own
                    // "outcome === chucker ? attackerOpenUntil : undefined") - only optional in
                    // the type because non-chucker results never carry it at all.
                    localGateStateRef.current = { ...localGateStateRef.current, attackerOpenUntil: result.attackerOpenUntil! };
                }

                // Matched by THIS shot's exact seq (see ReelQueueItem's own comment for why FIFO
                // "oldest pending" matching was wrong) - the ball may already have landed and
                // queued its own placeholder, in which case fill it in directly.
                const idx = reelQueueRef.current.findIndex((item) => item.seq === result.seq);
                if (idx !== -1) {
                    reelQueueRef.current[idx] = { symbols: result.reelSpin.symbols, matchTier: result.reelSpin.matchTier, attackerOpenUntil, pending: false, seq: result.seq };
                } else {
                    // The ball hasn't landed yet - routine, since a batch round trip is normally
                    // faster than this ball's own multi-second flight. Hold onto the real result
                    // here instead of dropping it; releaseLandedReward checks this the instant the
                    // ball lands and uses it immediately, skipping the placeholder/flicker
                    // entirely (nothing left to wait on - the result's already known). If this
                    // shot's own reel slot was dropped for being over MAX_QUEUED_SPINS capacity
                    // when it fired, this entry just sits unused until the next round reset clears
                    // it - a small, bounded cost, not a leak.
                    pendingReelResultsRef.current.set(result.seq, { symbols: result.reelSpin.symbols, matchTier: result.reelSpin.matchTier, attackerOpenUntil });
                }
            }
        }

        // Defense-in-depth: per-shot corrections above only ever catch drift in the two things
        // that are genuinely unpredictable locally (chucker/jackpot awards - see economy.ts's own
        // header). Anything else that ever slips between the local mirror and the server's own
        // rules (a bug, not by design) would otherwise compound silently forever. When no shot
        // has fired locally since this exact batch was sent (nextSeqRef caught up to what the
        // server just confirmed it's processed through), it's safe to adopt the server's own gate
        // state wholesale as the new truth - closing any such drift in one step.
        //
        // Deliberately touches ONLY localGateStateRef (the internal/gating truth), never
        // visibleBallsRemainingRef. response.ballsRemaining reflects every shot in this batch
        // fully settled - cost AND reward - including ones whose balls may still be mid-flight and
        // haven't visually landed yet; adopting it into the DISPLAYED count here would show those
        // balls' rewards before they arrive, reintroducing the exact bug this whole release-on-
        // landing design exists to fix. The visible count stays owned entirely by fireOnce's -1,
        // releaseLandedReward's per-ball +ballsAwarded, and the correction just above.
        if (nextSeqRef.current === response.lastProcessedSeq) {
            localGateStateRef.current = {
                ballsRemaining: response.ballsRemaining,
                leftTulipOpen: response.leftTulipOpen,
                rightTulipOpen: response.rightTulipOpen,
                attackerOpenUntil: response.attackerOpenUntil,
                jackpotOpenUntil: response.jackpotOpenUntil,
            };
        }
    };

    // Cash Out needs the server's own authoritative ballsRemaining, which only reflects shots
    // it's actually seen - flush whatever's still queued (retrying a few times if a flush fails
    // outright) before letting the caller proceed. Waits out any flush already in flight rather
    // than racing a second overlapping request against it.
    const flushAllPending = async () => {
        for (let attempt = 0; attempt < CASHOUT_FLUSH_MAX_ATTEMPTS; attempt++) {
            if (flushPromiseRef.current) {
                await flushPromiseRef.current;
            }
            if (pendingShotsRef.current.length === 0) {
                return;
            }
            await flushBatch(true);
        }
    };

    // Applies one shot's now-known outcome to the local economy TRUTH (localGateStateRef) the
    // instant the sim worker resolves it (see fireOnce) - purely local, no network dependency,
    // and deliberately immediate/synchronous: the very next fired shot reads this same ref for
    // its own chuckerActive/attackerActive/jackpotActive gate params, and the server applies
    // every shot's full effect immediately in strict seq order with no concept of "animation
    // time" - so this has to stay in fire order, or a later shot's local preview could show an
    // outright different outcome than what the server will independently derive, not just a late
    // one. Records what THIS shot assumed its ballsAwarded was (see shotAssumptionsRef) so
    // reconcileBatch can correct it later if the server's own replay disagrees (only ever
    // possible for chucker/jackpot - see economy.ts's own header).
    //
    // Deliberately does NOT touch anything player-visible (tray count, callout, reel spin) - that
    // was this function's own bug: pushing those immediately made a catch's reward appear before
    // the ball had visibly reached its pocket. The returned ballsAwarded/queueChuckerSpin are
    // carried on the ball's own ActiveBall entry instead, and released once THAT ball's own
    // flight animation finishes landing - see releaseLandedReward, called from the tick loop.
    const applyLocalOutcome = (seq: number, outcome: PachinkoOutcome): { ballsAwarded: number; queueChuckerSpin: boolean } => {
        const now = Date.now();
        const { ballsAwarded, nextState } = applyShotOutcome(localGateStateRef.current, outcome, { bonusPocketBalls, sideTulipBalls, attackerBalls, jackpotOpenMs }, jackpotPool, pricePerBall, now);
        localGateStateRef.current = nextState;
        shotAssumptionsRef.current.set(seq, ballsAwarded);

        // leftTulipOpen/rightTulipOpen/jackpotOpenUntil are board state, not "this ball's own
        // reward" - unlike the tray count/callout/reel, there's no single ball whose landing they
        // wait on, so these stay immediate here rather than deferred through the ActiveBall/
        // releaseLandedReward path. attackerOpenUntil is deliberately omitted - economy.ts never
        // changes it locally (only a chucker's real reel spin can, and that's only known once
        // reconcileBatch gets it back - see the tick loop's own reel-landing comment for where it
        // actually applies).
        pendingSessionPatchRef.current = {
            ...pendingSessionPatchRef.current,
            leftTulipOpen: nextState.leftTulipOpen,
            rightTulipOpen: nextState.rightTulipOpen,
            jackpotOpenUntil: nextState.jackpotOpenUntil,
        };

        let queueChuckerSpin = false;
        if (outcome === "chucker") {
            const totalQueued = (currentReelAnimRef.current ? 1 : 0) + reelQueueRef.current.length;
            queueChuckerSpin = totalQueued < MAX_QUEUED_SPINS;
        }

        flushBatch();
        return { ballsAwarded, queueChuckerSpin };
    };

    // The one true release point for a shot's player-facing reward - called from the tick loop
    // exactly when THIS ball's own flight animation finishes landing, never before. Splits into
    // three parts, matching what applyLocalOutcome used to push immediately (see its own
    // comment for why that was wrong): the tray-count reward, the catch callout, and the chucker
    // reel-spin placeholder. hotPockets glow (set by the caller, tick loop) already fires at this
    // same moment - this just brings the other three signals into line with it.
    const releaseLandedReward = (ball: { seq: number; outcome: PachinkoOutcome; ballsAwarded: number; queueChuckerSpin: boolean }) => {
        visibleBallsRemainingRef.current += ball.ballsAwarded;
        pendingSessionPatchRef.current = { ...pendingSessionPatchRef.current, ballsRemaining: visibleBallsRemainingRef.current };

        // Misses don't get a popup - they're the most common outcome by far, so surfacing them
        // would mostly just be clutter; only an actual catch (even a 0-ball one like a chucker
        // hit, or a jackpot before its estimate can possibly be known - see economy.ts) is worth
        // calling out.
        if (ball.outcome !== "gutter") {
            const calloutId = nextCalloutId++;
            setCallouts((prev) => [...prev, { id: calloutId, outcome: ball.outcome, ballsAwarded: ball.ballsAwarded, won: ball.ballsAwarded > 0 }]);
            setTimeout(() => setCallouts((prev) => prev.filter((c) => c.id !== calloutId)), CALLOUT_MS);
        }

        if (ball.outcome === "chucker" && ball.queueChuckerSpin) {
            // The real reel result is decided server-only (see pachinkoReels.ts's own comment on
            // why) - but reconcileBatch may already have it waiting (a batch round trip is
            // normally faster than this ball's own flight - see pendingReelResultsRef's own
            // comment), in which case there's no need for a placeholder/flicker at all: push the
            // real, resolved result straight in.
            const resolved = pendingReelResultsRef.current.get(ball.seq);
            if (resolved) {
                pendingReelResultsRef.current.delete(ball.seq);
                reelQueueRef.current.push({ symbols: resolved.symbols, matchTier: resolved.matchTier, attackerOpenUntil: resolved.attackerOpenUntil, pending: false, seq: ball.seq });
            } else {
                // Not known yet - queue a pending placeholder so the reel visibly starts spinning
                // the instant the ball lands, filled in by reconcileBatch (matched by this exact
                // seq) once the real symbols arrive.
                reelQueueRef.current.push({ symbols: ["ITEM_A", "ITEM_A", "ITEM_A"], matchTier: "none", pending: true, seq: ball.seq });
            }
        }
    };

    const fireOnce = () => {
        const gateState = localGateStateRef.current;
        if (gateState.ballsRemaining <= 0) {
            stopFiring();
            return;
        }
        if (activeBallsRef.current.size >= MAX_CONCURRENT_BALLS) {
            return;
        }

        const id = nextBallId++;
        const seq = ++nextSeqRef.current;
        const seed = randomSeed();
        const launchPower = launchPowerRef.current;
        const now = Date.now();
        // Mirrors pachinko.ts's own processBatch exactly: the chucker is active unless the
        // attacker currently is (same physical gate, different behavior while open).
        const attackerOpen = gateState.attackerOpenUntil > now;
        const jackpotOpen = gateState.jackpotOpenUntil > now;

        // The cost of firing THIS ball, charged immediately - mirrors pachinko.ts's own
        // processBatch, which decrements 1 ball for every shot it processes, miss or catch,
        // before it even knows the outcome. Applied to both the internal gate truth (so the very
        // next fireOnce call's own ballsRemaining <= 0 check above sees it) and the visible tray
        // count (a ball leaving the tray the instant it launches is intuitive and needs no
        // deferral, unlike a catch's reward below - see visibleBallsRemainingRef's own comment).
        localGateStateRef.current = { ...gateState, ballsRemaining: gateState.ballsRemaining - 1 };
        visibleBallsRemainingRef.current -= 1;
        pendingSessionPatchRef.current = { ...pendingSessionPatchRef.current, ballsRemaining: visibleBallsRemainingRef.current };

        activeBallsRef.current.set(id, { id, phase: "pending" });
        pendingShotsRef.current.push({ seq, seed, launchPower });

        // Runs off the main thread; resolves in tens of ms, not a network round trip - this is
        // what both animates the ball AND (via applyLocalOutcome) updates the economy mirror,
        // with zero network dependency between pressing fire and either of those happening.
        simulate({ seed, launchPower, chuckerActive: !attackerOpen, attackerActive: attackerOpen, jackpotActive: jackpotOpen }).then(({ trajectory, outcome }) => {
            // The gate-state TRUTH update must happen unconditionally, even if this ball has
            // already been removed (e.g. the player cashed out/closed the game mid-flight) - the
            // server already scored this shot the moment its batch was processed, regardless of
            // what this component's own animation state looks like, and the next fired shot's
            // local preview needs correct gate state regardless of what happened to this ball.
            const { ballsAwarded, queueChuckerSpin } = applyLocalOutcome(seq, outcome);

            if (activeBallsRef.current.has(id)) {
                // The normal path - this ball's own reward/callout/reel-spin are carried on it
                // and released once it visibly lands (see the tick loop and releaseLandedReward).
                activeBallsRef.current.set(id, { id, phase: "falling", trajectory, outcome, startTime: performance.now(), seq, ballsAwarded, queueChuckerSpin });
            } else {
                // This ball will never reach "landed" now, so its reward would otherwise never be
                // released, permanently leaking the -1 charged above with nothing crediting it
                // back. Nothing left to animate to, so apply just the balls-remaining credit here
                // - skip the callout/reel-spin, there's no board left to show them on.
                visibleBallsRemainingRef.current += ballsAwarded;
                pendingSessionPatchRef.current = { ...pendingSessionPatchRef.current, ballsRemaining: visibleBallsRemainingRef.current };
            }
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
                    unattended cash-out on navigate-away used to race in-flight launches). Flushes
                    any not-yet-reported shots first (see flushAllPending) so the server's own
                    ballsRemaining is what actually gets cashed out, never this board's own guess. */}
                <Button
                    variant="contained"
                    color="warning"
                    onClick={() => {
                        stopFiring();
                        flushAllPending().finally(onCashOut);
                    }}
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
