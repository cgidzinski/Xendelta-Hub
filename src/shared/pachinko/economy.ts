/**
 * The client-side mirror of the exact gate-state/payout rules `processBatch` in
 * `src/server/routes/casinoGames/pachinko.ts` uses to score a shot. This is what lets
 * PachinkoBoard.tsx apply a shot's effects the instant it fires - instantly, with zero network
 * dependency - rather than waiting for a batch round trip.
 *
 * This is a MIRROR, not the source of truth - the server's own copy of these same rules
 * (deliberately not factored out into one literally-shared function, since the server's version
 * also touches the DB and the shared jackpot pool, which this one can't and shouldn't) is what
 * actually decides the economy. Two outcomes can't be predicted locally at all:
 *   - "chucker": the reel spin (pachinkoReels.ts) uses Node's `crypto.randomInt`, deliberately
 *     not seed-derivable client-side - see pachinko.ts's own header on why reel results stay
 *     server-only. Applied optimistically here with ballsAwarded 0 and no attacker-window
 *     change; both get filled in once the server's batch response actually reports the reel
 *     result.
 *   - "jackpot": ballsAwarded depends on the LIVE shared jackpot pool value, which can move from
 *     other players' shots between when this one fires and when the server processes it. Applied
 *     optimistically using the caller's own best-known pool estimate (see PachinkoBoard's
 *     `jackpotPool` prop) - the server's own eventual figure is authoritative and reconciles it.
 * Every other outcome (bonus/tulip/attacker/gutter) is fully deterministic from constants both
 * sides already know, so the optimistic and authoritative results should always exactly agree.
 */
import { PachinkoOutcome } from "./pachinkoPhysics";
import { isJackpotPrimed, shouldCloseLapsedTulips } from "./pachinkoLayout";

export interface EconomyGateState {
    ballsRemaining: number;
    leftTulipOpen: boolean;
    rightTulipOpen: boolean;
    attackerOpenUntil: number;
    jackpotOpenUntil: number;
}

export interface EconomyConstants {
    bonusPocketBalls: number;
    sideTulipBalls: number;
    attackerBalls: number;
    jackpotOpenMs: number;
}

export interface EconomyShotEffect {
    ballsAwarded: number; // an estimate for chucker (always 0) and jackpot (best-known pool) - see this file's own header
    nextState: EconomyGateState;
}

// Applies one shot's outcome to a gate-state snapshot, returning the resulting state - pure, no
// mutation of the input. `now` should be the caller's own clock (client Date.now() when applied
// optimistically, or the server's own `now` when this same logic runs there).
export function applyShotOutcome(state: EconomyGateState, outcome: PachinkoOutcome, constants: EconomyConstants, jackpotPoolEstimate: number, pricePerBall: number, now: number): EconomyShotEffect {
    let ballsAwarded = 0;
    let { leftTulipOpen, rightTulipOpen, attackerOpenUntil, jackpotOpenUntil } = state;

    if (outcome === "bonusLeft" || outcome === "bonusRight") {
        ballsAwarded = constants.bonusPocketBalls;
    } else if (outcome === "tulipLeft" || outcome === "tulipRight") {
        ballsAwarded = constants.sideTulipBalls;
    } else if (outcome === "attacker") {
        ballsAwarded = constants.attackerBalls;
    } else if (outcome === "jackpot") {
        // Best local estimate only - see this file's own header. Rounds the same way
        // pachinkoPayouts.ts's jackpotBalls does (Math.round(pool / pricePerBall)) so the
        // optimistic figure lines up with the server's own formula as closely as it can without
        // the live pool value.
        ballsAwarded = pricePerBall > 0 ? Math.max(0, Math.round(jackpotPoolEstimate / pricePerBall)) : 0;
    }
    // "chucker" and "gutter" both award 0 balls here - a chucker's real reel-driven award only
    // ever comes from the server's batch response, never predicted locally.

    const previousJackpotOpenUntil = jackpotOpenUntil;
    const jackpotWindowActive = jackpotOpenUntil > now;
    if (outcome === "tulipLeft" || outcome === "tulipRight") {
        if (!jackpotWindowActive) {
            if (outcome === "tulipLeft") {
                leftTulipOpen = !leftTulipOpen;
            } else {
                rightTulipOpen = !rightTulipOpen;
            }
            if (isJackpotPrimed(leftTulipOpen, rightTulipOpen)) {
                jackpotOpenUntil = now + constants.jackpotOpenMs;
            }
        }
    } else if (outcome === "jackpot") {
        jackpotOpenUntil = 0;
        leftTulipOpen = false;
        rightTulipOpen = false;
    }
    // Deliberately NOT handling "chucker" attacker-window changes here (unlike the server's own
    // copy of this logic) - the attacker only opens on a reel three-of-a-kind, which this module
    // can't predict at all (see this file's own header), so attackerOpenUntil is left untouched
    // on every chucker shot and only ever updated once the server's batch response reports one.

    if (shouldCloseLapsedTulips(previousJackpotOpenUntil, jackpotOpenUntil, now)) {
        leftTulipOpen = false;
        rightTulipOpen = false;
        jackpotOpenUntil = 0;
    }

    return {
        ballsAwarded,
        nextState: { ballsRemaining: state.ballsRemaining + ballsAwarded, leftTulipOpen, rightTulipOpen, attackerOpenUntil, jackpotOpenUntil },
    };
}
