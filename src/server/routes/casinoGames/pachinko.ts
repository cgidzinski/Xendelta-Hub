/**
 * Pachinko — a batch-of-balls board game, unlike every other XenCasino game so far.
 * Slots/Scratch/Plinko are all single-request (bet, get an outcome, done); Pachinko is "buy a
 * batch of balls, then launch them one at a time" - a multi-step session built on
 * XenCasinoRound, not a one-shot durable record.
 *
 * Fully client-fired, server-verified-after-the-fact - not a request/response per shot at all.
 * Two earlier designs both still put a network call in the critical path of firing (first a
 * synchronous inline physics simulation, then a "cheap ticket" call before the client could even
 * start its own local preview) and both still felt laggy under any real-world network latency,
 * because *some* server round trip always had to complete before a ball could move. This design
 * has none: the client generates its own seed and sequence number, reads gate state from its own
 * locally-tracked mirror of the round's economy (see PachinkoBoard.tsx), and fires immediately -
 * zero network dependency between pressing fire and the ball moving.
 *
 * What the client fires is only ever a preview. It queues {seq, seed, launchPower} for every shot
 * and reports them to POST /launch/batch in the background, batched and never blocking further
 * firing. The server is the sole authority on what actually happened: it processes a batch's
 * shots in strict seq order, re-deriving gate state and outcomes itself via
 * pachinkoPhysics.simulateShot() (the same isomorphic, seeded function the client's own local
 * preview uses - see src/shared/pachinko/pachinkoPhysics.ts) against its OWN accumulating gate
 * state, never anything the client reports about outcome or gate state - only the seed and the
 * firing order are taken from the client, everything else is independently re-derived. A shot
 * whose seq was already processed (a retried/resubmitted batch) is skipped, making batch
 * submission safely idempotent; a client that claims to have fired more balls than it had simply
 * has the extra shots silently dropped once ballsRemaining would go negative.
 *
 * ## Why the two sides can no longer disagree
 *
 * "Server re-derives everything" is only worth anything if its derivation actually MATCHES what
 * the player was shown. For a long time it didn't, and players saw pockets score at random. Three
 * structural changes fixed that, and all three have to hold:
 *
 *   - **The trajectory doesn't depend on gate state at all** (pachinkoPhysics.ts). Gates used to
 *     add/remove real collision walls, so a single disagreed-upon boolean could put the ball in a
 *     completely different pocket. Now every shot simulates the identical board and the gates only
 *     decide whether a landing SCORES.
 *   - **Gate windows are counted in balls, not milliseconds** (shared/pachinko/pachinkoRules.ts).
 *     They used to be epoch-ms timestamps minted on one machine's clock and compared against
 *     another's, which drifted with clock skew and with when each side happened to apply them.
 *   - **The reel is derived from the shot's own seed** (shared/pachinko/pachinkoReels.ts), so the
 *     client knows a chucker's result - and therefore whether the attacker just opened - the
 *     instant the shot resolves, instead of being blind to it until a batch response came back.
 *
 * With those in place, both sides run the SAME transition function (shared/pachinko/economy.ts's
 * applyShot) over the same shots in the same order, with no clock and no unshared randomness
 * anywhere in the path - so identical results aren't a thing anyone has to maintain, they're
 * forced. See economy.ts's own header for the one deliberate exception (a jackpot's ball value,
 * which depends on the live shared pool).
 *
 * The economy is ball-only, not instant cash: every pocket (bonus, tulip, chucker, attacker,
 * jackpot) awards more balls, credited once a batch containing that shot is processed - there's
 * no per-ball money transfer or deferred settlement step the way earlier drafts of this game had,
 * because no real money moves on a launch at all. Real cheddar only moves on /buy, /cashout, and
 * the stale-round recovery sweep's refund of never-fired balls - see /cashout's own comment for
 * how it stays crash-recoverable the same way /buy already is.
 *
 * Tulip open/closed state and the attacker's/jackpot's own remaining-ball counters live on the
 * player's own round (conditions.*), not shared across players - each player works through their
 * own priming sequence within their own batch. Both the attacker and the jackpot are real windows
 * measured in balls, not standing "primed" flags: a chucker catch spins the board's central reel
 * (see shared/pachinko/pachinkoReels.ts), and only a three-of-a-kind opens the attacker, for
 * ATTACKER_OPEN_SHOTS balls - queued matches (multiple chucker catches landing close together
 * under hold-to-fire) each ADD that many balls on top of whatever's currently left rather than
 * resetting it. Hitting both tulips simultaneously opens the jackpot for JACKPOT_OPEN_SHOTS balls
 * and immediately resets both tulips - there's no standing "primed" state to sit open
 * indefinitely, just that one window. The jackpot pool *is* shared
 * (same pattern Slots' own pool already uses): every non-jackpot ball feeds it by
 * CONTRIBUTION_RATE * pricePerBall, and a jackpot catch converts the live pool value to balls,
 * resets it, and closes the window immediately.
 */
import express = require("express");
import { authenticateToken } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/AuthenticatedRequest";
const { User } = require("../../models/user");
const { XenCasino, XenCasinoRound } = require("../../models/xenCasino");
const mongoose = require("mongoose");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../../utils/weeabetsClient";
import { recordCasinoRoundPlayed } from "../../utils/dailyQuest";
import { requireGameEnabled } from "../../utils/casinoStatus";
import { scheduleStaleRoundSweep } from "./staleRoundRecovery";
import {
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    BOUNDARY_RIGHT_ARC,
    BOUNDARY_LEFT_ARC,
    RAIL_OUTER_ARC,
    RAIL_INNER_ARC,
    RAIL_CAP,
    LAUNCHER_POSITION,
    RELEASE_POINT,
    GUTTER_CUTOUT_X_START,
    GUTTER_CUTOUT_X_END,
    GUTTER_POCKET,
    TULIPS,
    JACKPOT,
    ATTACKER,
    BONUS_POCKETS,
    CHUCKER,
    WINDMILLS,
    ROADS,
    generateNailField,
    MIN_LAUNCH_POWER,
    MAX_LAUNCH_POWER,
} from "../../../shared/pachinko/pachinkoLayout";
import { BONUS_POCKET_BALLS, SIDE_TULIP_BALLS, ATTACKER_OPEN_SHOTS, ATTACKER_BALLS, JACKPOT_OPEN_SHOTS, CONTRIBUTION_RATE, JACKPOT_SEED, CASH_OUT_RATE, MAX_PAYOUT, cashOutAmount } from "./pachinkoPayouts";
import { PachinkoOutcome, ShotResult } from "../../../shared/pachinko/pachinkoPhysics";
import { spinReel, reelRngForSeed, ReelSpinResult } from "../../../shared/pachinko/pachinkoReels";
import { applyShot, gateFlagsFor, PachinkoGateState, PachinkoPayoutConstants } from "../../../shared/pachinko/economy";

import Piscina from "piscina";
import path from "path";
import { PachinkoPhysicsTask } from "./pachinkoPhysicsWorker";

// Passed into the shared applyShot on every shot - the server's own copy of the payout sizes.
const PAYOUT_CONSTANTS: PachinkoPayoutConstants = { bonusPocketBalls: BONUS_POCKET_BALLS, sideTulipBalls: SIDE_TULIP_BALLS, attackerBalls: ATTACKER_BALLS };

const SLUG = "pachinko";
const PRICE_PER_BALL = 100;
const REUP_SIZES = [1000];

// simulateShot (up to 2000 matter-js Engine.update() calls per shot) runs on a worker thread
// pool instead of inline, so a burst of hold-to-fire confirms can't block the main event loop -
// see pachinkoPhysicsWorker.ts's own header for the full story. Piscina is pointed at the small
// .cjs entry (not the .ts worker file directly) - see that file's own comment for why: tsx's
// auto-registration used by `npm run dev`/`npm start` (no separate build step for the server)
// skips itself outside the main thread, so the worker has to register tsx's require-hook itself.
const physicsPool = new Piscina<PachinkoPhysicsTask, ShotResult>({
    filename: path.resolve(__dirname, "pachinkoPhysicsWorkerEntry.cjs"),
});

// Backstop only, checked before processing a batch - a saturated pool means the physics queue is
// deep enough that a new job would take a while. Generous on purpose: under normal load this
// should never trigger, and batch processing is a background, fire-and-forget-with-retry concern
// from the client's firing loop perspective, not something blocking the next shot.
const MAX_QUEUED_PHYSICS_JOBS = 40;

// A batch's gate-state write (tulip/attacker/jackpot/ballsRemaining/lastProcessedSeq) is guarded
// on the exact values it was computed from and retried on conflict - see processBatch's own
// comment. Bounded well above how many concurrent writers could plausibly collide (duplicate
// tabs, a retried batch racing a fresh one) so a retry storm still resolves within one request.
const MAX_LAUNCH_WRITE_ATTEMPTS = 25;

interface PachinkoBallResult {
    seq: number; // the client-assigned shot sequence number this result came from - lets the client correlate a batch response back to which locally-fired ball(s) it covers
    outcome: PachinkoOutcome;
    ballsAwarded: number;
    reelSpin?: ReelSpinResult; // only present on a chucker catch - see pachinkoReels.ts
    // Only present on a chucker catch - THIS shot's own resulting attacker window, not the
    // batch's final one. A batch can contain more than one three-of-a-kind (each stacking time on
    // top of the last - see the loop below), so the client needs each shot's own post-state to
    // reconcile its reel-queue animation correctly instead of applying the final batch value to
    // every queued spin.
    attackerOpenUntil?: number;
}

interface PachinkoTopup {
    debitKey: string;
    balls: number;
}

interface CashOutPending {
    balls: number;
    amount: number;
}

// One shot as the client reports it - just enough to replay it (seed + launchPower) plus its
// firing order (seq). Nothing about outcome or gate state is ever included; see the file header
// for why those are only ever independently re-derived server-side, never trusted from a report.
interface IncomingShot {
    seq: number;
    seed: number;
    launchPower: number;
}

interface PachinkoConditions {
    ballsTotal: number; // balls ever purchased - only grows from /buy or /reup, never from in-round catches, so "spent" stays an honest reflection of real money in
    ballsRemaining: number; // balls left to fire - grows from pocket catches, shrinks by 1 per shot actually processed (see processBatch) - not per shot merely reported, a client can report more than it can afford and the excess is just dropped
    pricePerBall: number;
    leftTulipOpen: boolean;
    rightTulipOpen: boolean;
    // BALLS, not milliseconds - how many more shots each gate stays open for, counting down one
    // per shot processed; 0 means closed. These replaced a pair of epoch-ms timestamps, which
    // were the single biggest source of client/server disagreement on this board: one side minted
    // them on its own clock and the other compared them against a different clock. See
    // shared/pachinko/pachinkoRules.ts's header for the full reasoning.
    attackerShotsRemaining: number;
    jackpotShotsRemaining: number;
    results: PachinkoBallResult[];
    topups: PachinkoTopup[];
    // Highest shot seq this round has ever processed (0 = none yet) - the server's own ordering
    // cursor, never advanced by anything but a successfully-persisted processBatch call. Lets a
    // resubmitted/retried batch safely skip whatever it already covered (see processBatch), and
    // lets a resuming client (see /active) know where to continue its own local seq counter from.
    lastProcessedSeq: number;
    // Set atomically the instant a cash-out claims the round's balls (before the real-money
    // transfer even starts), cleared once that transfer confirms. If the process dies in
    // between, the round's balls are already zeroed but the player hasn't been paid yet -
    // the stale-round sweep finishes that transfer using the same idempotent key a live request
    // would have used, so a crash mid-cashout can't strand the player's cheddar.
    cashOutPending: CashOutPending | null;
}

const nailField = generateNailField(); // static geometry, computed once and reused for every /odds response

// Rounds that were already open when gate windows became ball counts still carry the old
// epoch-ms attackerOpenUntil/jackpotOpenUntil and no ball counters at all. Rather than migrating
// the collection, a legacy round's gates simply read as closed: the old timestamps can't be
// meaningfully converted (they were minted against a clock nothing compares to anymore), both
// windows were only seconds long so virtually every still-open round has lapsed regardless, and
// closed is the conservative direction - the player loses at most the tail of one window, and the
// round self-heals on its very next chucker catch. New rounds always write both fields.
function readConditions(round: { conditions: unknown }): PachinkoConditions {
    const c = round.conditions as PachinkoConditions;
    return { ...c, attackerShotsRemaining: c.attackerShotsRemaining ?? 0, jackpotShotsRemaining: c.jackpotShotsRemaining ?? 0 };
}

// The one place any shot ever gets scored - see the file header for why the server never trusts
// anything the client reports about outcome or gate state, only the seed and the firing order
// (seq). Processes `shots` in strict ascending seq order, re-deriving both the outcome (via
// simulateShot on the physics worker pool) and every gate-state transition (tulip toggle,
// jackpot priming/window, attacker stacking, lapsed-tulip closeout - identical rules to what
// this file always used) against the server's OWN accumulating state, never the client's.
// Already-processed seqs (<=  the round's own lastProcessedSeq) are silently skipped, making a
// resubmitted/retried batch safe to call more than once. If ballsRemaining would go negative
// partway through, the rest of the batch is simply dropped - a client can't get credit for
// shots it couldn't actually afford.
//
// Returns null only when the round itself is gone (resolved/never existed) - not an error case,
// just nothing left to do.
async function processBatch(userId: string, shots: IncomingShot[]): Promise<{ newResults: PachinkoBallResult[]; updatedConditions: PachinkoConditions } | null> {
    const ordered = [...shots].sort((a, b) => a.seq - b.seq);

    let updated: Awaited<ReturnType<typeof XenCasinoRound.applyConditionsUpdate>> = null;
    let newResults: PachinkoBallResult[] = [];
    let poolOps: Array<{ type: "contribute"; amount: number } | { type: "reset" }> = [];

    for (let attempt = 0; attempt < MAX_LAUNCH_WRITE_ATTEMPTS && !updated; attempt++) {
        const round = await XenCasinoRound.findActive(SLUG, userId);
        if (!round) {
            return null;
        }
        const start = readConditions(round);

        let gateState: PachinkoGateState = {
            ballsRemaining: start.ballsRemaining,
            leftTulipOpen: start.leftTulipOpen,
            rightTulipOpen: start.rightTulipOpen,
            attackerShotsRemaining: start.attackerShotsRemaining,
            jackpotShotsRemaining: start.jackpotShotsRemaining,
        };
        let lastProcessedSeq = start.lastProcessedSeq;
        // Tracks what the shared jackpot pool would read AFTER each poolOp queued so far in this
        // attempt, without touching the real pool until this whole batch durably persists (see
        // below) - a jackpot hit needs the live value to compute jackpotBalls, but the actual
        // increment/reset side effects must never apply until the round write they're paired
        // with has actually won, or a retried attempt would double-apply them.
        let simulatedPool = await XenCasino.getPachinkoJackpotPool();

        newResults = [];
        poolOps = [];
        for (const shot of ordered) {
            if (shot.seq <= lastProcessedSeq) {
                continue; // already processed - safe to see again in a retried/resubmitted batch
            }
            if (gateState.ballsRemaining <= 0) {
                break; // can't have legitimately fired this - the rest of the batch is void
            }

            // Gate flags come from THIS attempt's own accumulating state via the shared
            // gateFlagsFor - never the client's claim about what was open when it fired. Since
            // both sides derive them through the same function from the same ball-counted state,
            // and the trajectory no longer depends on them at all (see pachinkoPhysics.ts), the
            // client's local preview and this replay cannot land the ball in different pockets.
            const flags = gateFlagsFor(gateState);
            const { outcome }: ShotResult = await physicsPool.run({
                seed: shot.seed,
                launchPower: shot.launchPower,
                ...flags,
            });

            // Derived from the shot's own seed, so this is the identical spin the client already
            // showed the player - no server-only randomness left anywhere in the scoring path.
            const reelSpin: ReelSpinResult | undefined = outcome === "chucker" ? spinReel(reelRngForSeed(shot.seed)) : undefined;

            // Every ball fired feeds the shared pool except a jackpot catch, which empties it.
            // Tracked against `simulatedPool` so a jackpot's ball value uses the pool as it stands
            // at that point in the batch, while the real side effects stay deferred (see poolOps).
            const contribution = start.pricePerBall * CONTRIBUTION_RATE;
            if (outcome === "jackpot") {
                poolOps.push({ type: "reset" });
            } else {
                poolOps.push({ type: "contribute", amount: contribution });
            }

            // The one and only place a shot is scored - the same shared function the client runs
            // (see economy.ts). Everything the old inline copy did (payouts, the -1 firing cost,
            // tulip toggling, jackpot priming, attacker stacking, the lapsed-tulip closeout) lives
            // there now, so there is no second implementation left to drift out of sync.
            const { ballsAwarded, nextState } = applyShot(gateState, outcome, reelSpin, PAYOUT_CONSTANTS, simulatedPool, start.pricePerBall);
            gateState = nextState;

            simulatedPool = outcome === "jackpot" ? JACKPOT_SEED : simulatedPool + contribution;
            lastProcessedSeq = shot.seq;
            newResults.push({ seq: shot.seq, outcome, ballsAwarded, reelSpin });
        }

        if (lastProcessedSeq === start.lastProcessedSeq) {
            // Nothing new in this batch (every seq was already processed, or there were no
            // balls left to fire any of it) - no write needed, just report current state as-is.
            updated = round;
            break;
        }

        // Guarded on the exact snapshot this attempt simulated against, same "compute, then
        // compare-and-swap" shape every other write in this file uses - a concurrent batch for
        // the same round (duplicate tab, a retry racing a fresh submission) loses cleanly and
        // this whole attempt re-simulates against fresh state instead of silently clobbering it.
        //
        // Guarding on lastProcessedSeq + ballsRemaining is sufficient and deliberate: the seq
        // cursor strictly increases and is bumped by every batch that wins, so any concurrent
        // batch is caught by it alone, and ballsRemaining additionally catches a reup landing
        // mid-batch. The gate counters are derived from those same shots, so re-listing them here
        // would add nothing - and would break legacy rounds outright, since Mongo doesn't match a
        // missing field against 0 (see readConditions).
        updated = await XenCasinoRound.applyConditionsUpdate(
            round._id,
            {
                "conditions.ballsRemaining": start.ballsRemaining,
                "conditions.lastProcessedSeq": start.lastProcessedSeq,
            },
            {
                $set: {
                    "conditions.ballsRemaining": gateState.ballsRemaining,
                    "conditions.leftTulipOpen": gateState.leftTulipOpen,
                    "conditions.rightTulipOpen": gateState.rightTulipOpen,
                    "conditions.attackerShotsRemaining": gateState.attackerShotsRemaining,
                    "conditions.jackpotShotsRemaining": gateState.jackpotShotsRemaining,
                    "conditions.lastProcessedSeq": lastProcessedSeq,
                },
                $push: { "conditions.results": { $each: newResults } },
            }
        );
    }
    if (!updated) {
        throw new Error("Pachinko board is busy right now - try again");
    }

    // Side effects only after the round write actually won - see poolOps' own comment on why
    // these can't apply any earlier (a losing/retried attempt must never touch the real pool).
    for (const op of poolOps) {
        if (op.type === "reset") {
            await XenCasino.resetPachinkoJackpotPool(JACKPOT_SEED);
        } else {
            await XenCasino.incrementPachinkoJackpotPool(op.amount);
        }
    }

    return { newResults, updatedConditions: readConditions(updated) };
}

// A session can legitimately sit open for minutes between launches (think-time between balls).
// sweepStale keys off lastActivityAt (see xenCasino.js), so an actively-playing session is
// never mistaken for an abandoned one.
const ROUND_TTL_MS = 5 * 60 * 1000;
scheduleStaleRoundSweep(SLUG, ROUND_TTL_MS, async (round) => {
    // Nothing pending to settle server-side anymore before refunding - a shot only ever exists
    // here once a batch containing it has actually been processed (see processBatch); anything
    // the client fired locally but never successfully reported simply never happened as far as
    // the server's concerned, no different from never having fired it. ballsRemaining already
    // reflects every shot this round ever got credit for.
    const conditions = round.conditions as PachinkoConditions;
    const xenCasinoAccountId = await getXenCasinoAccountId();

    // Replaying the batch debit is safe even if it already went through - the key makes
    // it a no-op on the ledger, not a double charge. Every reup debit gets the same
    // treatment via its own key.
    await transfer({
        fromAccountId: round.playerAccountId,
        toAccountId: xenCasinoAccountId,
        amount: round.wager.toFixed(10),
        key: round.debitKey,
        note: `${SLUG}_wager`,
    });
    for (const topup of conditions.topups ?? []) {
        await transfer({
            fromAccountId: round.playerAccountId,
            toAccountId: xenCasinoAccountId,
            amount: (topup.balls * conditions.pricePerBall).toFixed(10),
            key: topup.debitKey,
            note: `${SLUG}_wager`,
        });
    }

    // Finish an interrupted cash-out first - the balls it claimed are already zeroed,
    // so this is the only place that money still owes the player.
    if (conditions.cashOutPending) {
        const transferResult = await transfer({
            fromAccountId: xenCasinoAccountId,
            toAccountId: round.playerAccountId,
            amount: conditions.cashOutPending.amount.toFixed(10),
            key: `xendelta-${SLUG}-cashout-${round._id}`,
            note: `${SLUG}_cashout`,
        });
        void transferResult;
    }

    // Any balls never fired have no decided outcome to pay out - refund their
    // pro-rated cost instead of either forfeiting it or leaving the round stuck open.
    const refund = conditions.ballsRemaining > 0 ? conditions.ballsRemaining * conditions.pricePerBall : 0;
    if (refund > 0) {
        await transfer({
            fromAccountId: xenCasinoAccountId,
            toAccountId: round.playerAccountId,
            amount: refund.toFixed(10),
            key: `xendelta-${SLUG}-refund-${round._id}`,
            note: `${SLUG}_refund`,
        });
    }

    await XenCasinoRound.resolve(round._id);
    // Only counts as "played" if at least one ball was actually launched or cashed out
    // - otherwise a buy-then-abandon cycle (fully refunded above) would let a player
    // farm daily quest progress for free with no risk. Stats-wise, "wager" is the full cost
    // of every ball ever bought (conditions.ballsTotal), matching the /cashout handler's own
    // accounting - not just fired balls, since unfired ones are refunded above (or via
    // cashOutPending) rather than won by the house. "payout" is whichever real transfer paid
    // the player back: the interrupted cash-out's amount if one was pending, otherwise the
    // unfired-balls refund just above.
    if (conditions.results.length > 0 || conditions.cashOutPending) {
        await recordCasinoRoundPlayed(round.userId, {
            game: SLUG,
            wager: conditions.ballsTotal * conditions.pricePerBall,
            payout: conditions.cashOutPending ? conditions.cashOutPending.amount : refund,
        });
    }
});

module.exports = function (app: express.Application) {
    app.get(`/api/casino/games/${SLUG}/odds`, authenticateToken, async function (_req: express.Request, res: express.Response) {
        const jackpotPool = await XenCasino.getPachinkoJackpotPool();
        return res.json({
            status: true,
            data: {
                pricePerBall: PRICE_PER_BALL,
                reupSizes: REUP_SIZES,
                launchPowerRange: { min: MIN_LAUNCH_POWER, max: MAX_LAUNCH_POWER },
                layout: {
                    canvasWidth: CANVAS_WIDTH,
                    canvasHeight: CANVAS_HEIGHT,
                    boundaryRightArc: BOUNDARY_RIGHT_ARC,
                    boundaryLeftArc: BOUNDARY_LEFT_ARC,
                    railOuterArc: RAIL_OUTER_ARC,
                    railInnerArc: RAIL_INNER_ARC,
                    railCap: RAIL_CAP,
                    launcherPosition: LAUNCHER_POSITION,
                    releasePoint: RELEASE_POINT,
                    gutterCutoutXStart: GUTTER_CUTOUT_X_START,
                    gutterCutoutXEnd: GUTTER_CUTOUT_X_END,
                    gutterPocket: GUTTER_POCKET,
                    nailField,
                    tulips: TULIPS,
                    jackpot: JACKPOT,
                    attacker: ATTACKER,
                    bonusPockets: BONUS_POCKETS,
                    chucker: CHUCKER,
                    windmills: WINDMILLS,
                    roads: ROADS,
                },
                sideTulipBalls: SIDE_TULIP_BALLS,
                bonusPocketBalls: BONUS_POCKET_BALLS,
                attackerBalls: ATTACKER_BALLS,
                attackerOpenShots: ATTACKER_OPEN_SHOTS,
                jackpotOpenShots: JACKPOT_OPEN_SHOTS,
                cashOutRate: CASH_OUT_RATE,
                jackpotPool,
                maxPayout: MAX_PAYOUT,
            },
        });
    });

    app.get(`/api/casino/games/${SLUG}/active`, authenticateToken, async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const round = await XenCasinoRound.findActive(SLUG, userId);
        if (!round) {
            return res.json({ status: true, data: { active: false } });
        }
        const conditions = readConditions(round);
        return res.json({
            status: true,
            data: {
                active: true,
                roundId: round._id,
                ballsTotal: conditions.ballsTotal,
                ballsRemaining: conditions.ballsRemaining,
                pricePerBall: conditions.pricePerBall,
                leftTulipOpen: conditions.leftTulipOpen,
                rightTulipOpen: conditions.rightTulipOpen,
                attackerShotsRemaining: conditions.attackerShotsRemaining,
                jackpotShotsRemaining: conditions.jackpotShotsRemaining,
                // A resuming client needs to know where to continue its own local shot-sequence
                // counter from (see PachinkoBoard.tsx) - starting back at 0/1 could collide with
                // seqs this round already processed before the page was closed/refreshed, and a
                // colliding seq gets silently skipped as "already processed" (see processBatch).
                lastProcessedSeq: conditions.lastProcessedSeq,
                // Trajectories deliberately omitted for already-launched balls - resuming shows
                // a summary, not a replay, so this stays small regardless of batch size.
                results: conditions.results.map((r) => ({ outcome: r.outcome, ballsAwarded: r.ballsAwarded })),
            },
        });
    });

    // Buys balls - creates a fresh batch if the player has no active round, or reups (tops up)
    // their existing one if they do.
    app.post(`/api/casino/games/${SLUG}/buy`, authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const { balls } = req.body as { balls?: number };
        if (typeof balls !== "number" || !REUP_SIZES.includes(balls)) {
            return res.status(400).json({ status: false, message: `balls must be one of ${REUP_SIZES.join(", ")}` });
        }

        const userId = String((req as AuthenticatedRequest).user!._id);
        const user = await User.findById(userId).exec();
        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }

        const wager = balls * PRICE_PER_BALL;

        try {
            // A cached Weeabets account id (set once resolveUserAccount ever succeeds for this
            // user - see weeabetsClient.ts) already tells us who to debit, so skip the extra
            // lookup call and its balance pre-check entirely on a returning player - transfer()
            // below already rejects insufficient funds on its own (WeeabetsTransferError status
            // 400, handled identically either way), so the pre-check was redundant. This halves
            // the number of sequential Weeabets calls /buy makes, which matters a lot when
            // Weeabets itself is slow - two back-to-back slow calls was the whole reason a
            // simple purchase could take several real seconds.
            const discordLinked = user.authProviders?.some((p: { provider: string; isActive: boolean }) => p.provider === "discord" && p.isActive);
            let accountId: number;
            if (user.weeabetsAccountId && discordLinked) {
                accountId = user.weeabetsAccountId;
            } else {
                const resolved = await resolveUserAccount(user);
                if (!resolved.linked || !resolved.account) {
                    return res.status(400).json({ status: false, message: "Link your Discord account to play" });
                }
                accountId = resolved.account.accountId;
            }

            const xenCasinoAccountId = await getXenCasinoAccountId();
            const existing = await XenCasinoRound.findActive(SLUG, userId);

            if (existing) {
                const topupId = new mongoose.Types.ObjectId();
                const debitKey = `xendelta-${SLUG}-topup-${topupId}`;
                const reserved = await XenCasinoRound.applyConditionsUpdate(existing._id, {}, {
                    $inc: { "conditions.ballsTotal": balls, "conditions.ballsRemaining": balls },
                    $push: { "conditions.topups": { debitKey, balls } },
                });

                let balance: string;
                try {
                    const result = await transfer({
                        fromAccountId: accountId,
                        toAccountId: xenCasinoAccountId,
                        amount: wager.toFixed(10),
                        key: debitKey,
                        note: `${SLUG}_wager`,
                    });
                    balance = result.fromNewBalance;
                } catch (err) {
                    if (err instanceof WeeabetsTransferError && err.status === 400) {
                        await XenCasinoRound.applyConditionsUpdate(existing._id, {}, {
                            $inc: { "conditions.ballsTotal": -balls, "conditions.ballsRemaining": -balls },
                            $pull: { "conditions.topups": { debitKey } },
                        });
                        return res.status(400).json({ status: false, message: "Insufficient balance" });
                    }
                    throw err;
                }

                const conditions = readConditions(reserved);
                return res.json({
                    status: true,
                    data: {
                        roundId: reserved._id,
                        ballsTotal: conditions.ballsTotal,
                        ballsRemaining: conditions.ballsRemaining,
                        pricePerBall: conditions.pricePerBall,
                        leftTulipOpen: conditions.leftTulipOpen,
                        rightTulipOpen: conditions.rightTulipOpen,
                        attackerShotsRemaining: conditions.attackerShotsRemaining,
                        jackpotShotsRemaining: conditions.jackpotShotsRemaining,
                        lastProcessedSeq: conditions.lastProcessedSeq,
                        balance,
                    },
                });
            }

            const conditions: PachinkoConditions = {
                ballsTotal: balls,
                ballsRemaining: balls,
                pricePerBall: PRICE_PER_BALL,
                leftTulipOpen: false,
                rightTulipOpen: false,
                attackerShotsRemaining: 0,
                jackpotShotsRemaining: 0,
                results: [],
                topups: [],
                lastProcessedSeq: 0,
                cashOutPending: null,
            };
            const roundId = new mongoose.Types.ObjectId();
            const debitKey = `xendelta-${SLUG}-start-${roundId}`;

            let round;
            try {
                round = await XenCasinoRound.startRound({
                    roundId,
                    game: SLUG,
                    userId,
                    wager,
                    debitKey,
                    playerAccountId: accountId,
                    conditions,
                });
            } catch (err) {
                if ((err as { code?: number }).code === 11000) {
                    return res.status(400).json({ status: false, message: "You already have an active batch - try again" });
                }
                throw err;
            }

            let balance: string;
            try {
                const result = await transfer({
                    fromAccountId: accountId,
                    toAccountId: xenCasinoAccountId,
                    amount: wager.toFixed(10),
                    key: debitKey,
                    note: `${SLUG}_wager`,
                });
                balance = result.fromNewBalance;
            } catch (err) {
                if (err instanceof WeeabetsTransferError && err.status === 400) {
                    await XenCasinoRound.resolve(round._id);
                    return res.status(400).json({ status: false, message: "Insufficient balance" });
                }
                throw err;
            }

            return res.json({
                status: true,
                data: {
                    roundId: round._id,
                    ballsTotal: balls,
                    ballsRemaining: balls,
                    pricePerBall: PRICE_PER_BALL,
                    leftTulipOpen: false,
                    rightTulipOpen: false,
                    attackerOpenUntil: 0,
                    jackpotOpenUntil: 0,
                    lastProcessedSeq: 0,
                    balance,
                },
            });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    // The only endpoint firing ever touches, and it never runs while a ball is waiting on it -
    // see the file header. The client fires locally (its own seed, its own seq, its own gate
    // state read from a local mirror of this same round's economy) and reports batches of
    // {seq, seed, launchPower} here in the background. processBatch (above) is the only place
    // any of it actually gets scored - nothing about outcome or gate state is read from the
    // request body at all, only used to know which shots to replay and in what order.
    app.post(`/api/casino/games/${SLUG}/launch/batch`, authenticateToken, async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { shots } = req.body as { shots?: IncomingShot[] };
        if (!Array.isArray(shots) || shots.length === 0) {
            return res.status(400).json({ status: false, message: "shots must be a non-empty array" });
        }
        for (const shot of shots) {
            if (
                typeof shot?.seq !== "number" ||
                typeof shot?.seed !== "number" ||
                typeof shot?.launchPower !== "number" ||
                !Number.isFinite(shot.launchPower) ||
                shot.launchPower < MIN_LAUNCH_POWER ||
                shot.launchPower > MAX_LAUNCH_POWER
            ) {
                return res.status(400).json({ status: false, message: "invalid shot in batch" });
            }
        }
        if (physicsPool.queueSize >= MAX_QUEUED_PHYSICS_JOBS) {
            return res.status(503).json({ status: false, message: "Pachinko is under heavy load right now - try again in a moment" });
        }

        try {
            const settled = await processBatch(userId, shots);
            if (!settled) {
                return res.status(400).json({ status: false, message: "No active batch - buy balls first" });
            }
            const { newResults, updatedConditions } = settled;
            return res.json({
                status: true,
                data: {
                    results: newResults.map((r) => ({ seq: r.seq, outcome: r.outcome, ballsAwarded: r.ballsAwarded, reelSpin: r.reelSpin })),
                    leftTulipOpen: updatedConditions.leftTulipOpen,
                    rightTulipOpen: updatedConditions.rightTulipOpen,
                    attackerShotsRemaining: updatedConditions.attackerShotsRemaining,
                    jackpotShotsRemaining: updatedConditions.jackpotShotsRemaining,
                    ballsRemaining: updatedConditions.ballsRemaining,
                    lastProcessedSeq: updatedConditions.lastProcessedSeq,
                },
            });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    // Converts the whole current ball count to cheddar at CASH_OUT_RATE and ends the round -
    // the only point (besides the initial /buy) where real money moves. Claims the balls
    // atomically first (an optimistic match on the exact count just read, so a launch racing
    // this request loses cleanly with a 409 rather than either request clobbering the other),
    // then transfers - if the transfer itself fails ambiguously, the claim (conditions.
    // cashOutPending) is left in place for the stale-round sweep to finish, same "reserve before
    // money moves, replay on ambiguous failure" shape every other transfer in this file uses.
    app.post(`/api/casino/games/${SLUG}/cashout`, authenticateToken, async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        try {
            const round = await XenCasinoRound.findActive(SLUG, userId);
            if (!round) {
                return res.status(400).json({ status: false, message: "No active batch" });
            }

            // Nothing to settle here anymore before reading ballsRemaining - the client itself
            // flushes any not-yet-reported shots via /launch/batch before ever calling this (see
            // PachinkoBoard.tsx's cash-out handler), so by the time this request lands,
            // ballsRemaining already reflects everything the player actually fired that made it
            // to the server.
            const conditions = round.conditions as PachinkoConditions;
            if (conditions.ballsRemaining <= 0) {
                return res.status(400).json({ status: false, message: "No balls to cash out" });
            }

            const balls = conditions.ballsRemaining;
            const amount = cashOutAmount(balls, conditions.pricePerBall);

            const claimed = await XenCasinoRound.applyConditionsUpdate(
                round._id,
                { "conditions.ballsRemaining": balls },
                { $set: { "conditions.ballsRemaining": 0, "conditions.cashOutPending": { balls, amount } } }
            );
            if (!claimed) {
                return res.status(409).json({ status: false, message: "Balance changed - try again" });
            }

            const xenCasinoAccountId = await getXenCasinoAccountId();
            const transferResult = await transfer({
                fromAccountId: xenCasinoAccountId,
                toAccountId: round.playerAccountId,
                amount: amount.toFixed(10),
                key: `xendelta-${SLUG}-cashout-${round._id}`,
                note: `${SLUG}_cashout`,
            });

            await XenCasinoRound.resolve(round._id);
            // wager is the full cost of every ball ever bought for this batch (conditions.
            // ballsTotal), not just the ones fired - balls bought but cashed out unfired are a
            // real refund via `amount` below, not a house win, so counting only fired balls as
            // wager while paying out the full remaining stack overstated recorded profit.
            await recordCasinoRoundPlayed(userId, {
                game: SLUG,
                wager: conditions.ballsTotal * conditions.pricePerBall,
                payout: amount,
            });

            return res.json({
                status: true,
                data: { ballsCashedOut: balls, amount, balance: transferResult.toNewBalance },
            });
        } catch (err) {
            // The claim (cashOutPending) is already durable even if we got here - leave the
            // round in place rather than trying to unwind it; the stale-round sweep replays the
            // same idempotently-keyed transfer once the round goes stale.
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });
};
