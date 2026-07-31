/**
 * The Pachinko HTTP wire contract, declared ONCE and referenced by both sides.
 *
 * ## Why this file exists
 *
 * These shapes used to be written down twice: as untyped object literals inside `res.json(...)` on
 * the server, and as hand-maintained `interface`s on the client. Nothing tied the two together, so
 * they could silently disagree - and eventually did. When the gate windows were renamed from
 * wall-clock timestamps (`attackerOpenUntil`) to ball counters (`attackerShotsRemaining`), one
 * `res.json` body was missed. The client's interface still promised `attackerShotsRemaining:
 * number`, the server sent `attackerOpenUntil`, and `tsc` had nothing to compare: a response body
 * passed to `res.json()` is just an `any`-shaped literal.
 *
 * Those same fields have since been renamed twice more (to `attackerOpenUntilMs` and friends), and
 * both times the compiler listed every site that needed changing in seconds. That is the whole
 * return on this file.
 *
 * The runtime result was disproportionate to the typo. The field read `undefined`, and
 * `undefined <= 0` is `false` in JavaScript (relational comparison coerces to NaN, and every
 * comparison against NaN is false), so the tulip-toggle rule in economy.ts was skipped on every
 * single shot - tulips never opened, the jackpot never primed. `Math.max(0, undefined - 1)` is
 * `NaN`, so both gate counters were NaN forever after, and the attacker could never open either.
 * An entire subsystem failed silently, and the board just drew grey pockets.
 *
 * So: every response body below is a real type, the server annotates its payloads with it, and the
 * client imports rather than redeclares. A rename that only half-lands is now a build failure.
 * If you add a field, add it here first.
 *
 * Note these describe the `data` envelope only - handlers wrap them as `{ status: true, data }`.
 */
import { PachinkoOutcome } from "./pachinkoPhysics";
import { ReelSpinResult } from "./pachinkoReels";

// Geometry the client needs to draw the board. Static per deploy, served with /odds.
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
    // Road polylines, drawn as guides. The client doesn't currently read these, but the server
    // sends them - declared so the contract stays honest about what's on the wire.
    roads: PachinkoPoint[][];
}

// The round's gate state, as it appears in every response that carries it. Kept as its own
// interface so the four responses below can't drift apart from each other either.
export interface PachinkoGateFields {
    leftTulipOpen: boolean;
    rightTulipOpen: boolean;
    // Round-relative milliseconds at which each window stops paying, on the same scale as a shot's
    // own firedAtMs and only ever compared against that. NOT epoch timestamps - see
    // pachinkoRules.ts's header for all three designs this has been and why only this one both
    // agrees across machines and gives the player a window they can react to. 0 means closed.
    // Both ends of each window, not just the close - see PachinkoGateState's own comment in
    // economy.ts for why the open bound exists: a shot fired in the gap between a catch's near-
    // instant fold and its own visible reveal must NOT see the gate as already open.
    attackerOpenFromMs: number;
    attackerOpenUntilMs: number;
    jackpotOpenFromMs: number;
    jackpotOpenUntilMs: number;
    // The highest firedAtMs the server has accepted for this round so far - see
    // pachinko.ts's validateShotTimings. Needed on every response that (re)establishes gate state
    // because the client's own firedAtMs clock is round-relative and resets to ~0 on every page
    // load; on resume it has to pick up counting from HERE, not from 0, or its very first shot after
    // a reload would claim a firedAtMs the server has already seen and reject the whole batch.
    lastFiredAtMs: number;
}

export interface PachinkoOddsResponse {
    pricePerBall: number;
    reupSizes: number[];
    launchPowerRange: { min: number; max: number };
    layout: PachinkoLayoutData;
    sideTulipBalls: number;
    bonusPocketBalls: number;
    attackerBalls: number;
    attackerOpenMs: number;
    jackpotOpenMs: number;
    cashOutRate: number;
    jackpotPool: number;
    maxPayout: number;
}

// A summary of an already-launched ball, for a client resuming an open round. Deliberately no
// trajectory - resuming shows a summary, not a replay.
export interface PachinkoResultSummary {
    outcome: PachinkoOutcome;
    ballsAwarded: number;
}

export interface PachinkoActiveResponse extends Partial<PachinkoGateFields> {
    active: boolean;
    roundId?: string;
    ballsTotal?: number;
    ballsRemaining?: number;
    pricePerBall?: number;
    lastProcessedSeq?: number;
    results?: PachinkoResultSummary[];
}

export interface PachinkoBuyResponse extends PachinkoGateFields {
    roundId: string;
    ballsTotal: number;
    ballsRemaining: number;
    pricePerBall: number;
    lastProcessedSeq: number;
    balance: string;
}

// One shot as the client reports it - just enough for the server to replay it (seed +
// launchPower) plus its firing order (seq). Nothing about outcome or gate state is ever sent; see
// pachinko.ts's header for why those are only ever re-derived server-side.
export interface QueuedShot {
    seq: number;
    seed: number;
    launchPower: number;
    // Round-relative milliseconds at which this shot was fired, off the client's own monotonic
    // clock. The one piece of timing the server takes from the client, and it is validated rather
    // than trusted (see pachinko.ts's validateShotTimings): the gate windows are durations now, so
    // an unchecked timing claim would let a client cram extra shots into a paying window.
    firedAtMs: number;
}

// The server's authoritative replay of one shot. Should always match what the client already
// derived locally - both sides run the same applyShot over the same shots in the same order - with
// the single exception of a jackpot's ballsAwarded, which depends on the live shared pool.
export interface PachinkoBatchResult {
    seq: number;
    outcome: PachinkoOutcome;
    ballsAwarded: number;
    reelSpin?: ReelSpinResult;
}

export interface PachinkoBatchResponse extends PachinkoGateFields {
    results: PachinkoBatchResult[];
    ballsRemaining: number;
    lastProcessedSeq: number;
}

export interface PachinkoCashOutResponse {
    ballsCashedOut: number;
    amount: number;
    balance: string;
}
