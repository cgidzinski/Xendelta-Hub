/**
 * The ONE implementation of Pachinko's round-state transition rules. Both the client (for its
 * instant local prediction, see PachinkoBoard.tsx) and the server (for its authoritative replay,
 * see pachinko.ts's processBatch) call this exact function, on the exact same inputs, in the exact
 * same order.
 *
 * This used to be a "mirror" - a client-side copy of rules the server implemented separately, with
 * a comment asking future readers to keep the two in lockstep. They did not stay in lockstep, and
 * could not: the server's copy read wall-clock time and server-only randomness that the client had
 * no way to reproduce, so the two derivations drifted apart and the player watched pockets fire
 * that the server never scored. There is now exactly one copy, and it is a pure function, so
 * "client and server agree" is not something anyone has to maintain - it's structural.
 *
 * Three properties make that possible, and all three must be preserved by anything added here:
 *
 *   1. **No clock is ever read.** Gate windows ARE measured in milliseconds - but the time comes in
 *      as an argument (`firedAtMs`, a duration since the round began, carried by the shot), never
 *      from `Date.now()` or `performance.now()` inside this file. That distinction is the whole
 *      ballgame: a fold that reads a clock gives two different answers on two machines, while a
 *      fold that compares numbers handed to it cannot. See pachinkoRules.ts's header for the three
 *      separate designs this has been and what each one got wrong.
 *   2. **No unshared randomness.** The reel is derived from the shot's own seed
 *      (pachinkoReels.ts), so both sides compute the identical spin. Nothing here draws randomness
 *      of its own.
 *   3. **Order is the only input that matters.** State is a pure fold over the shot sequence, so
 *      replaying the same shots in the same order always lands on the same state.
 *
 * The single unavoidable exception is a jackpot catch's ball value, which depends on the LIVE
 * shared jackpot pool - a genuinely global value the client cannot know exactly. The caller passes
 * its best-known pool figure; the server's own is authoritative and reconciles any difference.
 * That affects one number on a rare outcome and never any gate state, so it cannot cause the two
 * sides to disagree about where a ball went or which pockets are open.
 */
import { PachinkoOutcome } from "./pachinkoPhysics";
import { isJackpotPrimed } from "./pachinkoLayout";
import { ReelSpinResult } from "./pachinkoReels";
import { JACKPOT_OPEN_MS, REEL_LANDED_MS } from "./pachinkoRules";

export interface PachinkoGateState {
    ballsRemaining: number;
    leftTulipOpen: boolean;
    rightTulipOpen: boolean;
    // Round-relative milliseconds (the same scale as a shot's own firedAtMs) bounding each gate's
    // window as a true interval - a gate is open for a shot exactly when that shot's firedAtMs is
    // in [xOpenFromMs, xOpenUntilMs). 0/0 means closed and always has been. These are NOT epoch
    // timestamps and must never be compared against a clock - see pachinkoRules.ts's header.
    //
    // Both ends matter, not just the close time. The FOLD for a catch that opens a window happens
    // near-instantly once its physics sim resolves - well before that ball has visibly landed, let
    // alone before a chucker's reel has visibly revealed a match. A shot fired in that gap (a very
    // real one: hold-to-fire keeps going, and hundreds of ms can pass between a fold and its own
    // reel reveal) would see the gate as open if only the close time were tracked, since its
    // firedAtMs would already be below a boundary that was set - just not one it should be able to
    // see yet. The open bound is what stops that: nothing is active before it, no matter how early
    // a shot's firedAtMs falls under the close time.
    attackerOpenFromMs: number;
    attackerOpenUntilMs: number;
    jackpotOpenFromMs: number;
    jackpotOpenUntilMs: number;
}

export interface PachinkoPayoutConstants {
    bonusPocketBalls: number;
    sideTulipBalls: number;
    attackerBalls: number;
}

export interface PachinkoShotEffect {
    ballsAwarded: number;
    // What the shot actually SCORED as, which is not always what the simulation reported it hitting
    // - see applyShot's gate-enforcement note. Callers should display and record this, never the
    // outcome they passed in, or the board can show a catch the fold refused to pay for.
    outcome: PachinkoOutcome;
    nextState: PachinkoGateState;
}

// Any non-finite or negative window boundary reads as "closed" - see applyShot's own comment on why
// trusting these blindly is dangerous rather than merely untidy.
function finiteMs(value: number): number {
    return Number.isFinite(value) && value > 0 ? value : 0;
}

// Which of the three gated pockets are live for a shot fired at `firedAtMs`. The chucker and the
// attacker share one physical gate - the chucker scores only while the attacker it opens isn't
// already running. Both sides decide a shot's scoring through this one function so they cannot
// disagree about which pockets counted for it - and, since it's a pure function of `state` and
// `firedAtMs`, it doubles as the live "is this open right now" check the board renders from by
// passing the current round-relative clock reading in place of a real shot's firedAtMs (see
// PachinkoBoard.tsx's draw()).
//
// Takes the shot's own time rather than reading a clock, so calling it twice for the same shot
// always gives the same answer no matter when or where it's called. That matters more than it
// sounds: the client used to evaluate this at fire time and fold the shot at worker-resolve time,
// which are different states, and a stale `jackpotActive` from that gap could pay out the shared
// pool twice. applyShot now re-derives the flags itself at fold time so the two cannot separate.
export function gateFlagsFor(state: PachinkoGateState, firedAtMs: number): { chuckerActive: boolean; attackerActive: boolean; jackpotActive: boolean } {
    const attackerActive = firedAtMs >= finiteMs(state.attackerOpenFromMs) && firedAtMs < finiteMs(state.attackerOpenUntilMs);
    const jackpotActive = firedAtMs >= finiteMs(state.jackpotOpenFromMs) && firedAtMs < finiteMs(state.jackpotOpenUntilMs);
    return { chuckerActive: !attackerActive, attackerActive, jackpotActive };
}

/**
 * Folds one shot into the round's state. Pure - the input state is never mutated.
 *
 * `reportedOutcome` must have come from `simulateShot` run with `gateFlagsFor(state, firedAtMs)`,
 * and `reelSpin` must be `spinReel(reelRngForSeed(shot.seed))` when that outcome is "chucker"
 * (undefined otherwise) - pass anything else and the two sides stop agreeing, which is the entire
 * failure mode this file exists to prevent. The returned `outcome` is what it actually scored as.
 *
 * `firedAtMs` is the shot's round-relative fire time and `flightMs` its trajectory's real duration
 * (`trajectory.length * TRAJECTORY_SAMPLE_MS`); together they place the moment the player SEES this
 * shot resolve, which is when any window it opens begins. Both are properties of the shot, so both
 * sides compute the same windows without either reading a clock.
 *
 * `jackpotPoolValue` / `pricePerBall` are only read on a jackpot catch (see the file header on why
 * that one figure is allowed to differ between caller and caller).
 */
export function applyShot(
    state: PachinkoGateState,
    reportedOutcome: PachinkoOutcome,
    reelSpin: ReelSpinResult | undefined,
    constants: PachinkoPayoutConstants,
    jackpotPoolValue: number,
    pricePerBall: number,
    firedAtMs: number,
    flightMs: number
): PachinkoShotEffect {
    let ballsAwarded = 0;
    let { leftTulipOpen, rightTulipOpen } = state;
    // Coerced rather than trusted. A boundary that arrives non-finite doesn't just misbehave, it
    // silently disables rules: every comparison against NaN is false, so a NaN window would read as
    // permanently shut and any arithmetic on it would poison the counter for the rest of the round.
    // That is exactly what a single mistyped field name on one API response did once - see
    // pachinkoApi.ts's header. The contract is typed now, but a pure scoring function shouldn't be
    // one bad input away from quietly voiding the rulebook.
    let attackerOpenFromMs = finiteMs(state.attackerOpenFromMs);
    let attackerOpenUntilMs = finiteMs(state.attackerOpenUntilMs);
    let jackpotOpenFromMs = finiteMs(state.jackpotOpenFromMs);
    let jackpotOpenUntilMs = finiteMs(state.jackpotOpenUntilMs);

    // --- Gate enforcement -------------------------------------------------------------------
    // The caller is supposed to have simulated with exactly these flags. Re-deriving them here
    // rather than trusting that turns a documented contract into an enforced one, and it closes a
    // real hole: the client computes flags synchronously when a ball is FIRED but folds the shot
    // when its physics worker RESOLVES, and those are different states if anything landed in the
    // gap. Since the payout below keys purely off the outcome, one stale `jackpotActive` was enough
    // to pay out the whole shared pool a second time.
    //
    // Downgrading to "gutter" is not a guess in the case that actually matters. Only the jackpot's
    // gate can close in the harmful direction - the attacker's UNTIL bound is only ever pushed
    // further out (its FROM bound can move earlier via stacking, see the chucker branch below, but
    // never later), and the chucker's is derived from the attacker's - and the jackpot is the LAST
    // pocket checkPocketHit considers, with nothing but the drain beneath it. So a ball that reaches
    // a shut jackpot really does fall through to the gutter, and that is exactly what this scores.
    // (The client will have drawn that one ball stopping in the jackpot cup, since its trajectory
    // was truncated there. A cosmetic artifact on a rare edge, in exchange for the pool never paying
    // twice.) Enforcement is checked against THIS shot's own firedAtMs either way, not against
    // whatever the clock happens to read when the fold runs, so a window that only ever moves
    // forward in shot-relative time can never retroactively invalidate an earlier, already-honoured
    // catch - only the jackpot's genuine closing transitions can.
    const flags = gateFlagsFor(state, firedAtMs);
    const gateShut =
        (reportedOutcome === "jackpot" && !flags.jackpotActive) ||
        (reportedOutcome === "attacker" && !flags.attackerActive) ||
        (reportedOutcome === "chucker" && !flags.chuckerActive);
    const outcome: PachinkoOutcome = gateShut ? "gutter" : reportedOutcome;

    // --- What this shot paid --------------------------------------------------------------
    if (outcome === "bonusLeft" || outcome === "bonusRight") {
        ballsAwarded = constants.bonusPocketBalls;
    } else if (outcome === "tulipLeft" || outcome === "tulipRight") {
        ballsAwarded = constants.sideTulipBalls;
    } else if (outcome === "attacker") {
        ballsAwarded = constants.attackerBalls;
    } else if (outcome === "chucker") {
        // The chucker pays nothing itself - its whole value is the reel spin it fires.
        ballsAwarded = reelSpin?.ballsAwarded ?? 0;
    } else if (outcome === "jackpot") {
        // Rounded the same way pachinkoPayouts.ts's jackpotBalls does, so the client's estimate
        // and the server's authoritative figure agree whenever the pool value does.
        ballsAwarded = pricePerBall > 0 ? Math.max(0, Math.round(jackpotPoolValue / pricePerBall)) : 0;
    }

    // When this shot's result becomes visible: the ball has to finish falling first. A window that
    // opened any earlier than this would be spending itself while the player was still watching the
    // ball that won it - which is precisely how the ball-counted version failed.
    const landsAtMs = firedAtMs + Math.max(0, flightMs);
    // Whether a jackpot reservation currently exists at all - broader than gateFlagsFor's
    // jackpotActive, which additionally requires firedAtMs to have reached jackpotOpenFromMs. A
    // reservation blocks re-priming for its WHOLE life, including the brief gap before it's
    // actually reachable, not just while it's paying.
    const jackpotReserved = jackpotOpenUntilMs > 0;

    // --- Gate transitions -----------------------------------------------------------------
    if (outcome === "tulipLeft" || outcome === "tulipRight") {
        // Tulips don't toggle while the jackpot window they primed is still reserved - otherwise a
        // catch during the window could re-prime it and extend the jackpot indefinitely.
        if (!jackpotReserved) {
            if (outcome === "tulipLeft") {
                leftTulipOpen = !leftTulipOpen;
            } else {
                rightTulipOpen = !rightTulipOpen;
            }
            if (isJackpotPrimed(leftTulipOpen, rightTulipOpen)) {
                // Primed by a tulip catch, so it opens as that ball lands - there's no reel to wait
                // on, unlike the attacker below. No stacking to consider here either: the guard just
                // above means a fresh priming can only ever happen once nothing is reserved, so this
                // is always establishing a brand new window, never extending one.
                jackpotOpenFromMs = landsAtMs;
                jackpotOpenUntilMs = landsAtMs + JACKPOT_OPEN_MS;
            }
        }
    } else if (outcome === "chucker" && reelSpin && reelSpin.attackerOpenMs > 0) {
        // The attacker is opened by the REEL, not by the catch, so it starts when the third reel
        // stops - the moment the player is actually told they won it.
        const revealAtMs = landsAtMs + REEL_LANDED_MS;
        // Continuous with whatever's already reserved (this reveal falls at or before the existing
        // close) extends it; anything past the existing close is a wholly separate window and starts
        // fresh instead. Only the "extend" branch can move the open bound EARLIER - two catches whose
        // own reveals land out of order (a short flight fired after a long one can reveal first) both
        // still belong to the one span the player experiences as "the attacker is open", so the
        // window's start is the earliest of them, not whichever happened to fold first.
        const continuous = attackerOpenUntilMs > 0 && revealAtMs <= attackerOpenUntilMs;
        attackerOpenFromMs = continuous ? Math.min(attackerOpenFromMs, revealAtMs) : revealAtMs;
        attackerOpenUntilMs = Math.max(attackerOpenUntilMs, revealAtMs) + reelSpin.attackerOpenMs;
    } else if (outcome === "jackpot") {
        // Catching the jackpot closes its window immediately and resets both tulips.
        jackpotOpenFromMs = 0;
        jackpotOpenUntilMs = 0;
        leftTulipOpen = false;
        rightTulipOpen = false;
    }

    // A jackpot window that has lapsed takes both tulips shut with it - the player got their window
    // and didn't convert it, so the priming sequence starts over.
    //
    // With a ball count there was always a specific shot that took the counter to zero and could do
    // this. A duration just quietly elapses, and this fold has no clock to notice that with, so the
    // job falls to the first shot fired after the boundary: it closes the tulips and clears the
    // reservation so this only ever runs once. The window itself is still honoured to the
    // millisecond - gateFlagsFor compares against the boundaries directly - this is only about the
    // tulips it drags shut behind it.
    if (jackpotOpenUntilMs > 0 && firedAtMs >= jackpotOpenUntilMs) {
        jackpotOpenFromMs = 0;
        jackpotOpenUntilMs = 0;
        leftTulipOpen = false;
        rightTulipOpen = false;
    }

    return {
        ballsAwarded,
        outcome,
        // The -1 is the cost of firing this ball at all, charged on every shot regardless of
        // outcome, exactly as a real machine consumes a ball whether or not it scores.
        nextState: {
            ballsRemaining: state.ballsRemaining - 1 + ballsAwarded,
            leftTulipOpen,
            rightTulipOpen,
            attackerOpenFromMs,
            attackerOpenUntilMs,
            jackpotOpenFromMs,
            jackpotOpenUntilMs,
        },
    };
}
