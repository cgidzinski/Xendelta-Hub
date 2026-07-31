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
 *   1. **No wall-clock.** Gate windows are counted in BALLS, not milliseconds - see
 *      pachinkoRules.ts's header for the full reasoning. Nothing in this file reads a clock.
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
import { JACKPOT_OPEN_SHOTS } from "./pachinkoRules";

export interface PachinkoGateState {
    ballsRemaining: number;
    leftTulipOpen: boolean;
    rightTulipOpen: boolean;
    // Balls (not milliseconds) this gate stays open for, counting down one per shot processed.
    // 0 means closed. See pachinkoRules.ts's header for why these aren't timestamps.
    attackerShotsRemaining: number;
    jackpotShotsRemaining: number;
}

export interface PachinkoPayoutConstants {
    bonusPocketBalls: number;
    sideTulipBalls: number;
    attackerBalls: number;
}

export interface PachinkoShotEffect {
    ballsAwarded: number;
    nextState: PachinkoGateState;
}

// Which of the three gated pockets are live for the NEXT shot to be fired against this state.
// The chucker and the attacker share one physical gate - the chucker scores only while the
// attacker it opens isn't already running. Both sides derive a shot's simulateShot() flags
// through this one function so they cannot pick different geometry for the same shot.
export function gateFlagsFor(state: PachinkoGateState): { chuckerActive: boolean; attackerActive: boolean; jackpotActive: boolean } {
    const attackerActive = state.attackerShotsRemaining > 0;
    return { chuckerActive: !attackerActive, attackerActive, jackpotActive: state.jackpotShotsRemaining > 0 };
}

/**
 * Folds one shot into the round's state. Pure - the input state is never mutated.
 *
 * `outcome` must have come from `simulateShot` run with `gateFlagsFor(state)`, and `reelSpin` must
 * be `spinReel(reelRngForSeed(shot.seed))` when the outcome is "chucker" (undefined otherwise) -
 * pass anything else and the two sides stop agreeing, which is the entire failure mode this file
 * exists to prevent.
 *
 * `jackpotPoolValue` / `pricePerBall` are only read on a jackpot catch (see the file header on why
 * that one figure is allowed to differ between caller and caller).
 */
export function applyShot(
    state: PachinkoGateState,
    outcome: PachinkoOutcome,
    reelSpin: ReelSpinResult | undefined,
    constants: PachinkoPayoutConstants,
    jackpotPoolValue: number,
    pricePerBall: number
): PachinkoShotEffect {
    let ballsAwarded = 0;
    let { leftTulipOpen, rightTulipOpen, attackerShotsRemaining, jackpotShotsRemaining } = state;

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

    // --- Window countdown -----------------------------------------------------------------
    // Every shot burns one ball off both windows, BEFORE this shot's own outcome can extend them
    // (below). That ordering is what makes a window opened by shot N cover exactly shots
    // N+1..N+len: this shot decrements to 0, then adds its full length, so the next shot sees the
    // whole window intact.
    const previousJackpotShots = jackpotShotsRemaining;
    attackerShotsRemaining = Math.max(0, attackerShotsRemaining - 1);
    jackpotShotsRemaining = Math.max(0, jackpotShotsRemaining - 1);

    // --- Gate transitions -----------------------------------------------------------------
    if (outcome === "tulipLeft" || outcome === "tulipRight") {
        // Tulips don't toggle while the jackpot window they primed is still running - otherwise a
        // catch during the window could re-prime it and extend the jackpot indefinitely.
        if (previousJackpotShots <= 0) {
            if (outcome === "tulipLeft") {
                leftTulipOpen = !leftTulipOpen;
            } else {
                rightTulipOpen = !rightTulipOpen;
            }
            if (isJackpotPrimed(leftTulipOpen, rightTulipOpen)) {
                jackpotShotsRemaining = JACKPOT_OPEN_SHOTS;
            }
        }
    } else if (outcome === "chucker" && reelSpin && reelSpin.attackerOpenShots > 0) {
        // Stacks on whatever is left rather than resetting it, so rapid chucker catches under
        // hold-to-fire accumulate instead of one clobbering another.
        attackerShotsRemaining += reelSpin.attackerOpenShots;
    } else if (outcome === "jackpot") {
        // Catching the jackpot closes its window immediately and resets both tulips.
        jackpotShotsRemaining = 0;
        leftTulipOpen = false;
        rightTulipOpen = false;
    }

    // A jackpot window that was running and has now run out takes both tulips shut with it - the
    // player got their window and didn't convert it, so the priming sequence starts over.
    if (previousJackpotShots > 0 && jackpotShotsRemaining <= 0) {
        leftTulipOpen = false;
        rightTulipOpen = false;
    }

    return {
        ballsAwarded,
        // The -1 is the cost of firing this ball at all, charged on every shot regardless of
        // outcome, exactly as a real machine consumes a ball whether or not it scores.
        nextState: { ballsRemaining: state.ballsRemaining - 1 + ballsAwarded, leftTulipOpen, rightTulipOpen, attackerShotsRemaining, jackpotShotsRemaining },
    };
}
