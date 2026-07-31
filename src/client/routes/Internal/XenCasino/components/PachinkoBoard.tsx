import { useEffect, useRef, useState } from "react";
import { Box, Button, Slider, Typography } from "@mui/material";
import { formatCheddar } from "../utils/currency";
import { usePachinkoSimWorker } from "../workers/usePachinkoSimWorker";
import { applyShot, gateFlagsFor, PachinkoGateState } from "../../../../../shared/pachinko/economy";
import { TrajectorySample as PachinkoTrajectorySample } from "../../../../../shared/pachinko/pachinkoPhysics";
import { spinReel, reelRngForSeed, ReelSpinResult, ReelMatchTier } from "../../../../../shared/pachinko/pachinkoReels";
// The board's geometry and the /launch/batch wire shapes are declared once in the shared contract
// (see pachinkoApi.ts's header) rather than redeclared here to match whatever the server happens
// to send - a half-landed rename between the two is what silently killed the tulips.
import { PachinkoLayoutData, PachinkoBezierSegment, QueuedShot, PachinkoBatchResponse } from "../../../../../shared/pachinko/pachinkoApi";

export type PachinkoOutcome = "gutter" | "tulipLeft" | "tulipRight" | "jackpot" | "bonusLeft" | "bonusRight" | "chucker" | "attacker";

export interface PachinkoSession {
    roundId: string;
    ballsTotal: number;
    ballsRemaining: number;
    pricePerBall: number;
    leftTulipOpen: boolean;
    rightTulipOpen: boolean;
    // BALLS remaining on each gate window, not timestamps - see shared/pachinko/pachinkoRules.ts
    // for why wall-clock windows had to go. 0 means closed.
    attackerShotsRemaining: number;
    jackpotShotsRemaining: number;
    // The server's own ordering cursor for this round (see pachinko.ts's own field of the same
    // name) - lets a resumed/reloaded board continue its local seq counter without colliding with
    // seqs the server already processed before the page was closed/refreshed.
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
    launchPowerRange: { min: number; max: number };
    pricePerBall: number; // needed even when session is null, so reup button costs can show before any batch exists
    reupSizes: number[]; // straight from /odds, which is the server's own REUP_SIZES - see the note where REUP_AMOUNTS used to be
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
// No REUP_AMOUNTS constant here. The purchase sizes come in as a prop, sourced from /odds's own
// reupSizes (see PachinkoOddsResponse) - which is the server's REUP_SIZES, the same array /buy
// validates against. This used to be a hardcoded [1000] alongside the server's own [1000]: two
// constants in two files that had to agree, with nothing making them. A client offering a size the
// server rejects is a buy button that just fails, and silent client/server constant drift is
// exactly what broke the tulips once already (see shared/pachinko/pachinkoApi.ts's header).

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
// Chucker greys out ("CHUCKER - FULL") once this many spins are queued (queue + current).
//
// This is now effectively unreachable, and left in place knowingly rather than by oversight. Since
// a chucker's ledger entry waits for its own spin to land before it is applied (see reelHasLanded),
// and the entry after it can't be applied before that either, a second spin can't be requested
// until the first has already been handed over - so the queue never exceeds a depth of 2. The
// greyed-out state is display-only and harmless, and the cap is what the deadlock fallback in
// reelHasLanded guards against, so nothing here is dead in the sense of being unsafe. If stacked
// chucker catches ever feel sluggish, the lever is not this number: it's that the scheduler waits
// out the full REEL_RESULT_GLOW_MS before starting the next spin, on top of REEL_LANDED_MS.
const MAX_QUEUED_SPINS = 6;

interface ReelAnimState {
    symbols: [string, string, string];
    matchTier: ReelMatchTier;
    startTime: number;
    // Which shot fired this spin. The ledger entry for that shot is held until THIS spin has
    // visibly landed (see drainLedger), so the animation has to be identifiable, not just present.
    seq: number;
}

// When all three reels have stopped, relative to a spin's startTime. This is the moment the reel
// has told the player what it rolled - the glow that follows is celebration, not information, so
// it's deliberately not part of this.
const REEL_LANDED_MS = REEL_SPIN_MS + Math.max(...REEL_STOP_STAGGER_MS);

// Longest a ledger entry may sit waiting on its reel before it gives up and applies anyway. Sized
// well clear of any legitimate wait - a spin queued behind another still starts within
// REEL_LANDED_MS + REEL_RESULT_GLOW_MS (~2.9s) - so it can only ever fire on a genuine fault. See
// reelHasLanded.
const REEL_HOLD_TIMEOUT_MS = 6000;

// A chucker catch's reel result is known the instant the shot resolves now - it's derived from
// the shot's own seed (see shared/pachinko/pachinkoReels.ts), not fetched from the server - so a
// queued spin always carries real symbols. The old `pending` placeholder, the seq-matching that
// filled it in from a batch response, and the map that held early-arriving results all existed
// only to paper over a round trip that no longer happens, and are gone with it.
interface ReelQueueItem {
    symbols: [string, string, string];
    matchTier: ReelMatchTier;
    seq: number; // carried into ReelAnimState.seq when this spin starts - see there
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

// Which pocket a landing ball lights up, or null for a miss. Keyed the same way draw() looks the
// pockets up, so the mapping lives in exactly one place - the tick loop marks a pocket hot on the
// frame a ball transitions to "landed" AND on every frame it stays landed, and those two callers
// drifting apart is what produced a one-frame gap where the pocket was neither hot nor repainted.
const HOT_POCKET_ID: Record<PachinkoOutcome, string | null> = {
    gutter: null,
    bonusLeft: "bonus-left",
    bonusRight: "bonus-right",
    tulipLeft: "tulip-left",
    tulipRight: "tulip-right",
    chucker: "chucker",
    attacker: "attacker",
    jackpot: "jackpot",
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

// One ball's whole client-side lifecycle: "pending" from the instant it's fired (rendered
// immediately at the launcher so there's no dead gap), "falling" once the sim worker resolves and
// its trajectory starts interpolating, "landed" (poof + particle burst) before it's removed.
//
// A falling ball carries only its `seq`. Everything about what that shot DID lives in the shot
// ledger (see shotLedgerRef) - the ball just needs to know which ledger entry becomes visible when
// it lands. `won` is a display-only flag for the poof's particle colour.
type ActiveBall =
    | { id: number; phase: "pending" }
    | { id: number; phase: "falling"; trajectory: PachinkoTrajectorySample[]; outcome: PachinkoOutcome; startTime: number; seq: number }
    | { id: number; phase: "landed"; trajectory: PachinkoTrajectorySample[]; outcome: PachinkoOutcome; won: boolean; landedAt: number; particles: Particle[] };

// The single place a session is turned into gate state, used by both the initial ref and the
// round-sync effect below. Those two used to build it separately and only one of them defaulted
// its counters, so a session that arrived with an undefined counter (which one mistyped API field
// was enough to cause - see shared/pachinko/pachinkoApi.ts) poisoned the whole round through the
// path that didn't. Mirrors readConditions on the server, which does the same job there.
function gateStateFromSession(session: PachinkoSession | null): PachinkoGateState {
    return {
        ballsRemaining: session?.ballsRemaining ?? 0,
        leftTulipOpen: session?.leftTulipOpen ?? false,
        rightTulipOpen: session?.rightTulipOpen ?? false,
        attackerShotsRemaining: session?.attackerShotsRemaining ?? 0,
        jackpotShotsRemaining: session?.jackpotShotsRemaining ?? 0,
    };
}

// One fired shot, fully scored locally, waiting for its own ball to visibly land before anything
// it did is shown to the player. See the ledger's own comment on shotLedgerRef.
interface ShotLedgerEntry {
    seq: number;
    outcome: PachinkoOutcome;
    ballsAwarded: number;
    reelSpin?: ReelSpinResult;
    stateAfter: PachinkoGateState;
    landed: boolean;
    // Set when drainLedger stepped over this entry while its ball was still in the air, because
    // showing it could not have changed anything on screen (see canStepOver). Its state effects
    // were folded in by a later entry's stateAfter; it stays in the ledger only so the ledger
    // still knows a ball is outstanding, and is dropped when that ball finally lands.
    skipped?: boolean;
    // Chucker entries only: its reel spin has been handed to the animation queue, and the entry is
    // now waiting for that spin to visibly land before it may be applied. See drainLedger.
    reelQueuedAt?: number;
}

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
    launchPowerRange,
    pricePerBall,
    reupSizes,
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
    // Read inside the sim worker's own callback, which can resolve on a later render than the one
    // that fired the shot - refs so a shot always scores against current values.
    const jackpotPoolRef = useRef(jackpotPool);
    jackpotPoolRef.current = jackpotPool;
    const pricePerBallRef = useRef(pricePerBall);
    pricePerBallRef.current = pricePerBall;
    // The payout sizes handed to the shared applyShot on every shot - the same shape the server
    // passes (see pachinko.ts's own PAYOUT_CONSTANTS), so both sides fold identical numbers.
    const payoutConstantsRef = useRef({ bonusPocketBalls, sideTulipBalls, attackerBalls });
    payoutConstantsRef.current = { bonusPocketBalls, sideTulipBalls, attackerBalls };

    // This component's own local mirror of the round's economy (see
    // src/shared/pachinko/economy.ts) - what fireOnce actually reads and writes synchronously on
    // every shot, since waiting on the session prop to round-trip through React state (or worse,
    // through a batch response) would reintroduce exactly the kind of lag this whole redesign
    // exists to remove. Reset wholesale when the round itself changes (fresh buy / resumed
    // session) and nudged by exactly a reup's own delta when one lands - see the effect below.
    // Gate state after the last shot this board has FIRED - the input every new shot's own
    // simulateShot flags come from (via the shared gateFlagsFor). Advances the instant a shot's
    // outcome is known, because the next shot fires ~400ms later and must be simulated against a
    // board that already includes this one, exactly as the server's own seq-ordered replay does.
    const localGateStateRef = useRef<PachinkoGateState>(gateStateFromSession(session));

    // Gate state as the PLAYER currently sees it - the state after the last shot whose ball has
    // visibly landed. This is what draw() renders and what the session patch carries.
    //
    // The gap between this and localGateStateRef is the whole point, and it is exactly one ball's
    // flight long. Shot N is simulated against stateAfter(N-1); ball N lands ~1-3s later, and at
    // that instant this ref still holds stateAfter(N-1) - so the board the player watches a ball
    // fall onto is precisely the board that ball was simulated against. Applying N's effect right
    // then advances it to stateAfter(N), ready for ball N+1. Gate changes therefore appear exactly
    // as the ball that caused them arrives, never before.
    const displayedGateStateRef = useRef<PachinkoGateState>({ ...localGateStateRef.current });

    // Every fired shot, scored immediately but held here until its own ball lands, keyed by seq.
    //
    // This single ordered ledger replaced six separate ad-hoc deferral mechanisms that each had
    // their own rule for when an effect became visible (a separate visible-ball counter, a
    // release-on-landing helper, a pending reel placeholder, a map of early reel results, a
    // deferred attacker patch, and an immediate tulip patch that contradicted all of them). They
    // disagreed with each other, which is why fixing one kept surfacing another. There is now one
    // rule: an entry becomes visible when its ball lands, and only in seq order.
    const shotLedgerRef = useRef<Map<number, ShotLedgerEntry>>(new Map());
    // Highest seq whose effects the player has actually been shown. displayedGateStateRef always
    // equals that entry's own stateAfter, so what's on screen is always a state that really
    // existed - never a blend of two, and never moving backwards.
    const displayedSeqRef = useRef(session?.lastProcessedSeq ?? 0);
    // Shots fired but not yet displayed. Their -1 firing cost is deducted from the tray count
    // immediately (a ball leaving the tray the moment you launch it is intuitive) while their
    // rewards wait for landing, so the visible count is displayedGateState.ballsRemaining minus
    // this. See drainLedger.
    const firedNotDisplayedRef = useRef(0);

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
    // Shots fired locally but not yet included in a request to /launch/batch - see flushBatch.
    const pendingShotsRef = useRef<QueuedShot[]>([]);
    const lastFlushAtRef = useRef(0);
    const flushInFlightRef = useRef(false);
    // The currently in-flight flush's own promise, if any - lets flushAllPending (Cash Out) await
    // whatever's already in flight instead of racing a second overlapping request against it.
    const flushPromiseRef = useRef<Promise<void> | null>(null);

    const plungerReleaseRef = useRef<(() => void) | null>(null);

    // Keeps local state in step with session changes that DIDN'T originate from this component's
    // own firing - a fresh buy or a resumed round (roundId changes, a full reset from the server's
    // own snapshot) and a reup on the current round (ballsTotal grows - see Pachinko.tsx's
    // applyBuyResponse - by exactly the number of balls just bought, applied as a delta rather
    // than overwritten wholesale, so a reup landing mid-hold-to-fire can't stomp balls a shot
    // already credited locally but hasn't made it back into the session prop yet).
    useEffect(() => {
        if (!session) {
            return;
        }
        if (session.roundId !== lastSyncedRoundIdRef.current) {
            lastSyncedRoundIdRef.current = session.roundId;
            lastSyncedBallsTotalRef.current = session.ballsTotal;
            nextSeqRef.current = session.lastProcessedSeq;
            lastReconciledSeqRef.current = session.lastProcessedSeq;
            displayedSeqRef.current = session.lastProcessedSeq;
            shotLedgerRef.current.clear();
            firedNotDisplayedRef.current = 0;
            pendingShotsRef.current = [];
            const fresh = gateStateFromSession(session);
            localGateStateRef.current = fresh;
            displayedGateStateRef.current = { ...fresh };
        } else if (session.ballsTotal !== lastSyncedBallsTotalRef.current) {
            const delta = session.ballsTotal - lastSyncedBallsTotalRef.current;
            lastSyncedBallsTotalRef.current = session.ballsTotal;
            localGateStateRef.current = { ...localGateStateRef.current, ballsRemaining: localGateStateRef.current.ballsRemaining + delta };
            displayedGateStateRef.current = { ...displayedGateStateRef.current, ballsRemaining: displayedGateStateRef.current.ballsRemaining + delta };
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
        // Every gate below reads the DISPLAYED state - the board as it was when the currently
        // falling balls were simulated against it - never localGateStateRef, which has already
        // run ahead by however many balls are still in the air. See displayedGateStateRef.
        const displayed = displayedGateStateRef.current;
        const attackerShotsLeft = displayed.attackerShotsRemaining;
        const attackerOpen = attackerShotsLeft > 0;

        for (const bonus of layout.bonusPockets) {
            const isHot = hotPockets.has(`bonus-${bonus.id}`);
            const stroke = isHot ? "#FFD700" : "rgba(189,245,240,0.9)";
            drawPocket(ctx, bonus.position.x, bonus.position.y, bonus.halfWidth, POCKET_HEIGHT, isHot ? "rgba(255,215,0,0.35)" : "rgba(79,209,197,0.22)", stroke);
            drawPocketLabel(ctx, bonus.position.x, bonus.position.y, POCKET_HEIGHT, "BONUS", stroke);
            drawPocketAmount(ctx, bonus.position.x, bonus.position.y, `${bonusPocketBalls}`, stroke);
        }

        const jackpotShotsLeft = displayed.jackpotShotsRemaining;
        // No lapsed-window fixup needed here any more. A window measured in balls can't quietly
        // expire behind the UI's back the way a wall-clock one could - it only ever changes when a
        // shot is applied, and applyShot already closes both tulips in the same step that takes
        // the counter to zero. What's drawn is simply the state, with no clock to reconcile.
        const leftOpen = displayed.leftTulipOpen;
        const rightOpen = displayed.rightTulipOpen;
        for (const tulip of layout.tulips) {
            const isOpen = tulip.id === "left" ? leftOpen : rightOpen;
            const isHot = hotPockets.has(`tulip-${tulip.id}`);
            // Both states are green - a tulip being closed isn't "inactive" the way the
            // chucker/attacker are, it's just not toggled yet, so it shouldn't read as grey/off.
            // Open needs to be unmistakably brighter though: a vivid, near-solid glowing green
            // vs. a light, translucent green when closed.
            //
            // The catch flash is ADDITIVE here, unlike every other pocket on the board, and that
            // matters more than it sounds. It used to replace the stroke and fill outright and
            // suppress the open glow, which meant the tulip that had just caught a ball was
            // painted solid gold for the whole POOF_MS window - exactly the moment the player is
            // watching to see whether it toggled. The state change was instant all along; it was
            // simply invisible for 450ms, which read as lag. Only the label text gave it away,
            // because that was never gated on isHot. So: keep the open/closed colours authoritative
            // at all times, and layer the flash on as a gold ring around the outside instead.
            const stroke = isOpen ? "#7CFFB2" : "#BFF0D2";
            drawPocket(
                ctx,
                tulip.position.x,
                tulip.position.y,
                tulip.halfWidth,
                POCKET_HEIGHT,
                isOpen ? "rgba(99,214,138,0.75)" : "rgba(99,214,138,0.22)",
                stroke,
                { glow: isHot ? "rgba(255,215,0,0.95)" : isOpen ? "rgba(124,255,178,0.9)" : undefined }
            );
            if (isHot) {
                ctx.save();
                ctx.strokeStyle = "#FFD700";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.roundRect(tulip.position.x - tulip.halfWidth - 2.5, tulip.position.y - POCKET_HEIGHT / 2 - 2.5, tulip.halfWidth * 2 + 5, POCKET_HEIGHT + 5, [0, 0, 4, 4]);
                ctx.stroke();
                ctx.restore();
            }
            // No text label. drawPocketLabel centres above the pocket, and the tulips sit only 34px
            // either side of the chucker - "TULIP - OPEN" is ~75px wide at this font and simply ran
            // through "CHUCKER", which is drawn 2px higher. The payout number below is inside the
            // cup and collides with nothing, so it stays.
            //
            // This is only safe because the fill, stroke and glow above are authoritative from the
            // frame the ball lands. They didn't used to be - the catch flash painted over them for
            // 450ms, and the label was the one thing that changed immediately, which is exactly why
            // it was here. Anything that reintroduces a flash covering the open/closed colours has
            // to bring a replacement signal with it, because this text is no longer the fallback.
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
        // UNDERNEATH (not overlapping the amount), read off the displayed gate state's own ball
        // counter - see the countdown just below.
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
        //
        // The 13 is close to the maximum this block can be dropped by, so treat it as bounded
        // rather than arbitrary: JACKPOT_GUIDES converges inward from y=300, reaching x~170 and
        // x~290 by y~332. The widest string here is "ATTACKER - OPEN" (~80px, centred on x=230, so
        // spanning 190-270), and the third line of the block lands at exactly that y. It clears the
        // guide nails by ~20px; a few more pixels down and the label starts sitting on them.
        ctx.fillStyle = attackerStroke;
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        const attackerLabelY = layout.attacker.position.y + POCKET_HEIGHT / 2 + 13;
        ctx.fillText(attackerOpen ? "ATTACKER - OPEN" : "ATTACKER", layout.attacker.position.x, attackerLabelY);
        ctx.font = "bold 11px sans-serif";
        ctx.fillText(`${attackerBalls}`, layout.attacker.position.x, attackerLabelY + 14);
        if (attackerOpen) {
            // Counts down in BALLS, not seconds - the window is literally measured in shots now
            // (see shared/pachinko/pachinkoRules.ts), so this is exact rather than an estimate,
            // and it's a number the player controls directly by choosing when to fire.
            ctx.fillStyle = "rgba(189,245,207,0.95)";
            ctx.font = "bold 9px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(`${attackerShotsLeft} balls`, layout.attacker.position.x, attackerLabelY + 28);
        }

        // Jackpot - the tightest pocket on the board, fixed width even when primed. Driven by its
        // own ball-counted window, not the tulip booleans (which are reset by the same shot that
        // closes the window).
        const jackpotOpen = jackpotShotsLeft > 0;
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
            ctx.fillStyle = "rgba(255,77,125,0.95)";
            ctx.font = "bold 9px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(`${jackpotShotsLeft} balls`, layout.jackpot.position.x, layout.jackpot.position.y + jackpotHeight / 2 + 12);
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
                        // The ball has visibly arrived. Mark its ledger entry landed and drain -
                        // this is the ONLY thing in the component that makes a shot's effects
                        // visible, and it does so in strict seq order (see drainLedger).
                        const { trajectory, outcome } = ball;
                        markLanded(ball.seq, now);
                        activeBallsRef.current.set(ball.id, { id: ball.id, phase: "landed", trajectory, outcome, won: outcome !== "gutter", landedAt: now, particles: makeParticles() });
                        // Light the pocket on this very frame, not the next one. The ball only
                        // becomes "landed" here, so without this the frame that first paints the
                        // pocket's new open/closed state is also the one frame it isn't hot - the
                        // player sees the new colour, one frame of gold, then the new colour again.
                        const pocketId = HOT_POCKET_ID[outcome];
                        if (pocketId) hotPockets.add(pocketId);
                    }
                } else if (ball.phase === "landed") {
                    if (now - ball.landedAt >= POOF_MS) {
                        toRemove.push(ball.id);
                    } else {
                        const pocketId = HOT_POCKET_ID[ball.outcome];
                        if (pocketId) hotPockets.add(pocketId);
                    }
                }
            }
            for (const id of toRemove) {
                activeBallsRef.current.delete(id);
            }

            // Drain every frame, not only when a ball lands. A chucker entry's release condition is
            // a deadline - its reel finishing - and no event fires at that moment, so a purely
            // landing-driven drain would leave it (and everything behind it) sitting until the next
            // ball happened to land, which under slow or stopped firing could be a long time or
            // never. Cheap: it returns immediately unless the head entry is actually ready.
            //
            // Before the reel scheduler below, so a spin this call hands over starts on this very
            // frame instead of idling a frame first.
            drainLedger(now);

            // Reel spin queue: once the current animation has fully finished (all reels landed +
            // glow elapsed), start the next queued spin. Every queued spin now carries real
            // symbols from the moment it's queued (derived from its shot's seed), so there's
            // nothing to wait on and no placeholder state to skip over.
            if (currentReelAnimRef.current) {
                const finishedAt = currentReelAnimRef.current.startTime + REEL_LANDED_MS + REEL_RESULT_GLOW_MS;
                if (now >= finishedAt) {
                    const next = reelQueueRef.current.shift();
                    currentReelAnimRef.current = next ? { symbols: next.symbols, matchTier: next.matchTier, startTime: now, seq: next.seq } : null;
                }
            } else if (reelQueueRef.current.length > 0) {
                const next = reelQueueRef.current.shift()!;
                currentReelAnimRef.current = { symbols: next.symbols, matchTier: next.matchTier, startTime: now, seq: next.seq };
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

    // The server's own replay of a batch, folded back in. With the trajectory decoupled from gate
    // state, the reel derived from the shot seed, and the windows counted in balls, both sides run
    // the same shared applyShot over the same shots in the same order - so every field here should
    // already match what this component derived locally, and in practice this loop finds nothing to
    // do. It is kept as a safety net, not as the thing that drives the UI.
    //
    // The one legitimate difference is a jackpot catch's ballsAwarded, which depends on the live
    // shared pool that only the server can know exactly (see economy.ts's header). That correction
    // is applied immediately rather than being gated on a ball landing: a batch round trip is
    // normally slower than a ball's own flight, so the ball in question has typically landed
    // already, and delaying a pure number correction behind an unrelated ball would only confuse
    // things further.
    const reconcileBatch = (response: PachinkoBatchResponse) => {
        for (const result of response.results) {
            if (result.seq <= lastReconciledSeqRef.current) {
                continue; // shouldn't normally happen (processBatch is idempotent by seq), but cheap to guard
            }
            lastReconciledSeqRef.current = result.seq;

            const entry = shotLedgerRef.current.get(result.seq);
            const correction = result.ballsAwarded - (entry?.ballsAwarded ?? result.ballsAwarded);
            if (correction !== 0) {
                localGateStateRef.current = { ...localGateStateRef.current, ballsRemaining: localGateStateRef.current.ballsRemaining + correction };
                displayedGateStateRef.current = { ...displayedGateStateRef.current, ballsRemaining: displayedGateStateRef.current.ballsRemaining + correction };
                if (entry) {
                    // Keep the ledger entry honest too, so if this shot hasn't been displayed yet
                    // its eventual stateAfter isn't re-applying the stale figure.
                    entry.ballsAwarded = result.ballsAwarded;
                    entry.stateAfter = { ...entry.stateAfter, ballsRemaining: entry.stateAfter.ballsRemaining + correction };
                }
                patchVisibleSession();
            }
        }

        // Safety net: when nothing has been fired locally since this batch was sent (the local
        // firing cursor has caught up to what the server confirms it has processed) and no ball is
        // still mid-flight, both sides are describing the very same moment - so any difference at
        // all is drift that shouldn't exist, and the server's figure is adopted wholesale. Guarded
        // on an empty ledger as well as the seq match: adopting mid-flight would show the rewards
        // of balls the player is still watching fall, which is the exact bug all of this exists to
        // prevent.
        if (nextSeqRef.current === response.lastProcessedSeq && shotLedgerRef.current.size === 0) {
            const authoritative: PachinkoGateState = {
                ballsRemaining: response.ballsRemaining,
                leftTulipOpen: response.leftTulipOpen,
                rightTulipOpen: response.rightTulipOpen,
                attackerShotsRemaining: response.attackerShotsRemaining,
                jackpotShotsRemaining: response.jackpotShotsRemaining,
            };
            localGateStateRef.current = authoritative;
            displayedGateStateRef.current = { ...authoritative };
            displayedSeqRef.current = response.lastProcessedSeq;
            firedNotDisplayedRef.current = 0;
            patchVisibleSession();
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

    // The single place the visible session is updated. Merged into pendingSessionPatchRef rather
    // than pushed straight to the parent, so any number of updates in one frame coalesce into one
    // re-render (the tick loop flushes it once per frame) - under hold-to-fire an uncoalesced
    // setState per shot competed with the launch slider's own pointer handling and made dragging
    // feel unresponsive.
    const patchVisibleSession = () => {
        const displayed = displayedGateStateRef.current;
        pendingSessionPatchRef.current = {
            ...pendingSessionPatchRef.current,
            // Balls already spent on shots still in the air are deducted right away; their
            // rewards arrive as each ball lands. See firedNotDisplayedRef.
            ballsRemaining: displayed.ballsRemaining - firedNotDisplayedRef.current,
            leftTulipOpen: displayed.leftTulipOpen,
            rightTulipOpen: displayed.rightTulipOpen,
            attackerShotsRemaining: displayed.attackerShotsRemaining,
            jackpotShotsRemaining: displayed.jackpotShotsRemaining,
        };
    };

    // Whether showing this entry would change literally nothing the player can see, given the
    // currently displayed state - the only condition under which drainLedger may step over a ball
    // that hasn't landed yet.
    //
    // It holds for a miss fired while neither timed gate is running, which is the overwhelmingly
    // common shot (roughly seven in ten). Read applyShot alongside this: a "gutter" outcome awards
    // no balls, fires no reel, and toggles no tulip; its only two effects are the -1 ball cost and
    // decrementing both windows. The cost is already shown the instant the shot is fired, via
    // firedNotDisplayedRef, so it isn't waiting on this. The decrements are what the window checks
    // are for - at 0 they're clamped no-ops, but at 1 or more they'd tick a counter the player is
    // watching down a ball early, before the ball it belongs to has visibly landed, which is the
    // whole class of bug the ledger exists to prevent. Both the displayed state and the entry's own
    // stateAfter are checked, so this stays true no matter which one drifts.
    const canStepOver = (entry: ShotLedgerEntry, displayed: PachinkoGateState): boolean =>
        entry.outcome === "gutter" &&
        displayed.attackerShotsRemaining === 0 &&
        displayed.jackpotShotsRemaining === 0 &&
        entry.stateAfter.attackerShotsRemaining === 0 &&
        entry.stateAfter.jackpotShotsRemaining === 0;

    // The run of not-yet-landed entries sitting in front of the next LANDED one, if every entry in
    // that run can be stepped over. Null - meaning "wait, as before" - if any of them can't, or if
    // there's no landed entry behind them to unblock, since stepping over on its own accomplishes
    // nothing and would leave the visible ball count transiently short (see drainLedger).
    const collectStepOver = (now: number): ShotLedgerEntry[] | null => {
        const displayed = displayedGateStateRef.current;
        const run: ShotLedgerEntry[] = [];
        for (let seq = displayedSeqRef.current + 1; run.length < MAX_CONCURRENT_BALLS; seq++) {
            const entry = shotLedgerRef.current.get(seq);
            if (!entry) {
                return null; // nothing behind the gap yet - the wait is real
            }
            if (entry.landed) {
                // "Landed" is necessary but not sufficient: a chucker still waiting on its reel
                // won't be applied this pass either, and stepping over a run that then isn't
                // followed by an application is exactly what breaks the accounting below - the
                // stepped balls' cost leaves firedNotDisplayedRef without arriving in the displayed
                // state, so the visible ball count reads wrong until the hold clears. Wait instead;
                // the same step-over happens for free on a later frame once the reel has landed.
                if (reelStillHolding(entry, now)) {
                    return null;
                }
                return run.length > 0 ? run : null;
            }
            if (!canStepOver(entry, displayed)) {
                return null;
            }
            run.push(entry);
        }
        return null;
    };

    // A chucker's ball landing is only half its story. The chucker pays nothing itself - its entire
    // value is the reel spin it fires, and it's the reel, not the catch, that decides whether the
    // attacker opens. Applying the entry the moment the ball lands therefore showed the effect
    // before the cause: the attacker lit up and "Gate Open!" popped a full REEL_LANDED_MS (1.34s)
    // before the reels revealed the three-of-a-kind that had opened it.
    //
    // So a landed chucker entry additionally waits for its OWN spin to finish landing. Its own,
    // specifically - hence the seq tag on ReelAnimState. Waiting on "some spin is animating" would
    // release the entry against whichever spin happened to be on screen.
    //
    // Note this waits for the reels to STOP, not for REEL_RESULT_GLOW_MS to elapse. The glow is
    // celebration; the information the gate depends on is complete the moment the third reel lands.
    //
    // Deliberately PURE - it is used both to gate the head of the ledger and as a lookahead by
    // collectStepOver, and a lookahead that queued a spin as a side effect would start reels for
    // shots whose turn hasn't come. Queueing lives in startReelFor, called only for the head entry.
    const reelStillHolding = (entry: ShotLedgerEntry, now: number): boolean => {
        if (entry.outcome !== "chucker" || !entry.reelSpin) {
            return false;
        }
        if (entry.reelQueuedAt === undefined) {
            return true; // its spin hasn't even been handed over yet
        }
        // Belt and braces against a permanent stall. startReelFor's queue push is conditional, and
        // an entry waiting on a spin that was never enqueued would wedge the ledger forever - every
        // later shot's effects frozen behind it, with no event that could ever free them. It cannot
        // happen as things stand (serialising chuckers this way holds the queue at a depth of at
        // most 2 against a MAX_QUEUED_SPINS of 6), but "currently unreachable" is a poor guarantee
        // to hang a permanent freeze on, and the cost of being wrong is the whole board stopping.
        if (now - entry.reelQueuedAt > REEL_HOLD_TIMEOUT_MS) {
            return false;
        }
        const anim = currentReelAnimRef.current;
        return !(anim?.seq === entry.seq && now - anim.startTime >= REEL_LANDED_MS);
    };

    // Hands this entry's spin to the animation queue, once. Only ever called for the entry at the
    // head of the ledger, so reels play in fire order and a spin never starts ahead of an earlier
    // ball that hasn't resolved yet.
    const startReelFor = (entry: ShotLedgerEntry, now: number) => {
        if (entry.reelQueuedAt !== undefined) {
            return;
        }
        const totalQueued = (currentReelAnimRef.current ? 1 : 0) + reelQueueRef.current.length;
        if (totalQueued < MAX_QUEUED_SPINS) {
            reelQueueRef.current.push({ symbols: entry.reelSpin!.symbols, matchTier: entry.reelSpin!.matchTier, seq: entry.seq });
        }
        entry.reelQueuedAt = now;
    };

    // Makes a landed shot's effects visible, and then any already-landed shots queued behind it,
    // strictly in seq order. Balls don't necessarily land in the order they were fired (a gentler
    // shot fired later can have a shorter flight), so a ball that arrives early simply waits its
    // turn here - which is what guarantees the displayed state is always a state that genuinely
    // existed, and never jumps around.
    //
    // Called on every landing AND once per frame, because one of its release conditions is a
    // deadline rather than an event (see the chucker branch below).
    const drainLedger = (now: number) => {
        for (;;) {
            const entry = shotLedgerRef.current.get(displayedSeqRef.current + 1);
            if (!entry) {
                return;
            }
            if (entry.landed && reelStillHolding(entry, now)) {
                // A chucker's ball landing is only half its story. The chucker pays nothing itself -
                // its entire value is the reel spin it fires, and it's the reel, not the catch, that
                // decides whether the attacker opens. Applying on landing therefore showed the
                // effect before its cause: the attacker lit up and "Gate Open!" popped a full
                // REEL_LANDED_MS (1.34s) before the reels revealed the three-of-a-kind behind it.
                //
                // So the whole entry waits for its own reel, rather than the gate alone being
                // delayed - a half-applied entry would put the displayed board into a configuration
                // that never existed in the fold, which is the one invariant this ledger has.
                startReelFor(entry, now);
                return;
            }
            if (!entry.landed) {
                // Head-of-line blocking, and it is not rare: flight time is driven by pin scatter
                // rather than launch power, and a caught ball's flight is systematically SHORTER
                // than a miss's (the cup stops it mid-board where a miss falls all the way
                // through), so the catches - the only shots with anything to show - are precisely
                // the ones most likely to overtake an earlier ball and be made to wait for it.
                //
                // Applying entries in landing order instead is NOT a fix; it's a different bug.
                // The fold doesn't commute: tulipLeft then tulipRight primes a 12-ball jackpot
                // window where the reverse order primes nothing, because of applyShot's guard
                // against tulips re-toggling during an open window, and stacked attacker windows
                // don't commute against its Math.max(0, x-1) clamp either. Fire order is also what
                // the server replays, so any other order gets snapped back by reconcileBatch.
                //
                // What IS safe is stepping over an entry that could not have changed anything on
                // screen, keeping the fire-order fold exactly as it is. See canStepOver.
                const steppable = collectStepOver(now);
                if (!steppable) {
                    return;
                }
                for (const skipped of steppable) {
                    skipped.skipped = true;
                    displayedSeqRef.current = skipped.seq;
                    firedNotDisplayedRef.current = Math.max(0, firedNotDisplayedRef.current - 1);
                }
                // Deliberately no patchVisibleSession here: on its own a step-over leaves the
                // visible ball count momentarily short by the stepped balls' cost, because their
                // cost moves out of firedNotDisplayedRef and only lands back in displayed state
                // when the following entry's (cumulative) stateAfter is applied. collectStepOver
                // only ever returns a run that IS followed by a landed entry, so the next turn of
                // this loop applies it in the same synchronous pass and nothing renders in between.
                continue;
            }
            shotLedgerRef.current.delete(entry.seq);
            displayedSeqRef.current = entry.seq;
            displayedGateStateRef.current = entry.stateAfter;
            firedNotDisplayedRef.current = Math.max(0, firedNotDisplayedRef.current - 1);

            // Misses don't get a popup - they're the most common outcome by far, so surfacing them
            // would mostly just be clutter; only an actual catch is worth calling out.
            if (entry.outcome !== "gutter") {
                const calloutId = nextCalloutId++;
                const ballsAwarded = entry.ballsAwarded;
                setCallouts((prev) => [...prev, { id: calloutId, outcome: entry.outcome, ballsAwarded, won: ballsAwarded > 0 }]);
                setTimeout(() => setCallouts((prev) => prev.filter((c) => c.id !== calloutId)), CALLOUT_MS);
            }

            // No reel queueing here any more - reelHasLanded already did it, back when this entry
            // first reached the head of the ledger. By the time execution gets here the spin has
            // been running for REEL_LANDED_MS and has just finished revealing what it rolled, which
            // is precisely what makes the gate state applied above land at the same moment as its
            // own explanation.

            patchVisibleSession();
        }
    };

    const markLanded = (seq: number, now: number) => {
        const entry = shotLedgerRef.current.get(seq);
        if (entry?.skipped) {
            // Already accounted for while it was still in the air - drainLedger will never look at
            // it again, since displayedSeqRef has long since passed it. Dropping it here is what
            // keeps the ledger's "is any ball still outstanding" reading honest, which
            // reconcileBatch's adopt-wholesale safety net depends on being exactly right.
            shotLedgerRef.current.delete(seq);
            return;
        }
        if (entry) {
            entry.landed = true;
        }
        drainLedger(now);
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
        // Derived through the same shared helper the server uses, from the same ball-counted
        // state - so the two sides cannot pick different geometry for this shot. (And since the
        // trajectory no longer depends on these flags at all, even a disagreement could only
        // change whether a landing scores, never where the ball goes.)
        const flags = gateFlagsFor(gateState);

        activeBallsRef.current.set(id, { id, phase: "pending" });
        pendingShotsRef.current.push({ seq, seed, launchPower });
        // The ball is spent the moment it's launched - reflected in the tray immediately, while
        // whatever it wins waits for it to land.
        firedNotDisplayedRef.current += 1;
        patchVisibleSession();

        // Runs off the main thread and resolves in tens of ms, not a network round trip. The
        // worker processes messages in the order they arrive, so outcomes resolve in fire order
        // and the ledger below is built in seq order without any explicit sorting.
        simulate({ seed, launchPower, ...flags }).then(({ trajectory, outcome }) => {
            // Everything about scoring is derived locally and immediately - including the reel,
            // which used to require a round trip and left the client blind to its own attacker
            // window in the meantime.
            const reelSpin = outcome === "chucker" ? spinReel(reelRngForSeed(seed)) : undefined;
            const { ballsAwarded, nextState } = applyShot(localGateStateRef.current, outcome, reelSpin, payoutConstantsRef.current, jackpotPoolRef.current, pricePerBallRef.current);
            localGateStateRef.current = nextState;
            shotLedgerRef.current.set(seq, { seq, outcome, ballsAwarded, reelSpin, stateAfter: nextState, landed: false });

            if (activeBallsRef.current.has(id)) {
                activeBallsRef.current.set(id, { id, phase: "falling", trajectory, outcome, startTime: performance.now(), seq });
            } else {
                // The ball was removed mid-flight (the player cashed out or closed the board), so
                // it will never land to release its own entry. Release it now instead - the shot
                // really happened and the server has already scored it; leaving it queued would
                // strand this shot and every shot behind it.
                markLanded(seq, performance.now());
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
                {reupSizes.map((amount) => (
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
