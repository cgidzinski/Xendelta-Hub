/**
 * Pachinko — a batch-of-balls board game, unlike every other XenCasino game so far.
 * Slots/Scratch/Plinko are all single-request (bet, get an outcome, done); Pachinko is "buy a
 * batch of balls, then launch them one at a time" - a multi-step session built on
 * XenCasinoRound, not a one-shot durable record.
 *
 * Ticket/confirm launch protocol, not a single request-response: the old design ran the whole
 * matter-js simulation inline in /launch, so every ball's flight couldn't even START animating
 * client-side until a full network round trip PLUS the physics compute finished. Under sustained
 * hold-to-fire that backlog of not-yet-answered requests could take several real seconds to
 * drain, reading as balls still launching well after letting go of the fire button, and any
 * single slow/failed request risked derailing the whole session.
 *
 * Now: POST /launch does no physics at all - it just claims a ball, generates a random seed, and
 * hands back {seed, launchPower, gate state} near-instantly. The client immediately replays
 * pachinkoPhysics.simulateShot() with that exact seed ITSELF (see PachinkoBoard.tsx's sim
 * worker - the shared, isomorphic src/shared/pachinko/pachinkoPhysics.ts runs unmodified on
 * both sides) and starts animating the ball right away, no waiting on the server for an outcome.
 * POST /launch/confirm then re-runs that same seeded simulation server-side (on the existing
 * physics worker pool) in the background - not blocking the next shot - and THAT replay, never
 * anything the client claims, is what actually credits balls, moves gate state, and feeds the
 * jackpot pool. The client's own local run is a preview only; if it ever disagreed with the
 * server's replay (matter-js has no internal randomness of its own - see pachinkoPhysics.ts's
 * header - so this should only ever be floating-point drift across environments, not a real
 * discrepancy), the server's replay is what actually counts, unconditionally.
 *
 * The economy is ball-only, not instant cash: every pocket (bonus, tulip, chucker, attacker,
 * jackpot) awards more balls, credited straight into the round's own ballsRemaining once its
 * ticket is confirmed - there's no per-ball money transfer or deferred settlement step the way
 * earlier drafts of this game had, because no real money moves on a launch at all. Real cheddar
 * only moves on /buy, /cashout, and the stale-round recovery sweep's refund of never-fired balls
 * - see /cashout's own comment for how it stays crash-recoverable the same way /buy already is.
 *
 * Tulip open/closed state and the attacker's/jackpot's own open-until timestamps live on the
 * player's own round (conditions.*), not shared across players - each player works through their
 * own priming sequence within their own batch. Both the attacker and the jackpot are real timed
 * windows, not standing "primed" flags: a chucker catch spins the board's central reel (see
 * pachinkoReels.ts), and only a match opens the attacker, for ATTACKER_OPEN_MS - queued matches
 * (multiple chucker catches landing close together under hold-to-fire) each ADD that much time on
 * top of whatever's currently left rather than resetting it. Hitting both tulips simultaneously
 * opens the jackpot for JACKPOT_OPEN_MS and immediately resets both tulips - there's no standing
 * "primed" state to sit open indefinitely, just that one window. The jackpot pool *is* shared
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
    isJackpotPrimed,
    shouldCloseLapsedTulips,
    MIN_LAUNCH_POWER,
    MAX_LAUNCH_POWER,
} from "../../../shared/pachinko/pachinkoLayout";
import { BONUS_POCKET_BALLS, SIDE_TULIP_BALLS, ATTACKER_OPEN_MS, ATTACKER_BALLS, JACKPOT_OPEN_MS, CONTRIBUTION_RATE, JACKPOT_SEED, CASH_OUT_RATE, MAX_PAYOUT, jackpotBalls, cashOutAmount } from "./pachinkoPayouts";
import { PachinkoOutcome, ShotResult, TrajectorySample, TRAJECTORY_SAMPLE_MS } from "../../../shared/pachinko/pachinkoPhysics";
import { randomSeed } from "../../../shared/pachinko/prng";
import { spinReel, ReelSpinResult } from "./pachinkoReels";
import Piscina from "piscina";
import path from "path";
import { PachinkoPhysicsTask } from "./pachinkoPhysicsWorker";

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

// Backstop only, now checked at /confirm time (not /launch, which no longer touches physics at
// all) - a saturated pool means the physics queue is deep enough that a new job would take a
// while. Generous on purpose: under normal load this should never trigger, and confirms are a
// background, fire-and-forget-with-retry concern from the client's perspective, not something
// blocking the next shot.
const MAX_QUEUED_PHYSICS_JOBS = 40;

// /confirm's gate-state write (tulip/attacker/jackpot) is guarded on the exact values it was
// computed from and retried on conflict - see that handler's own comment. Bounded well above
// MAX_CONCURRENT_BALLS (20, PachinkoBoard.tsx) worth of plausible pile-up so a retry storm still
// resolves within one request rather than 409ing a legitimate catch.
const MAX_LAUNCH_WRITE_ATTEMPTS = 25;

// A ticket nobody ever confirms (client crashed, tab closed mid-flight) shouldn't strand its
// already-claimed ball forever - the stale-round sweep settles any still-pending tickets itself
// (see confirmTicket below, its only other caller) before computing what's left to refund.
const TICKET_TTL_MS = 60 * 1000;

interface PachinkoBallResult {
    outcome: PachinkoOutcome;
    ballsAwarded: number;
    trajectory: TrajectorySample[];
    reelSpin?: ReelSpinResult; // only present on a chucker catch - see pachinkoReels.ts
}

interface PachinkoTopup {
    debitKey: string;
    balls: number;
}

interface CashOutPending {
    balls: number;
    amount: number;
}

// One claimed-but-not-yet-scored shot. Everything simulateShot needs to replay it is captured
// here at issue time so /confirm (and the stale-round sweep) never has to trust anything the
// client sends back except which seed it's confirming.
interface PendingTicket {
    seed: number;
    launchPower: number;
    chuckerActive: boolean;
    attackerActive: boolean;
    jackpotActive: boolean;
    issuedAt: number; // epoch ms - also what the jackpot window's landedAt anchors to, see confirmTicket
}

interface PachinkoConditions {
    ballsTotal: number; // balls ever purchased - only grows from /buy or /reup, never from in-round catches, so "spent" stays an honest reflection of real money in
    ballsRemaining: number; // balls left to fire - grows from pocket catches, shrinks by 1 per launch ticket issued (not per confirm - firing always costs a ball the instant you commit to the shot)
    pricePerBall: number;
    leftTulipOpen: boolean;
    rightTulipOpen: boolean;
    attackerOpenUntil: number; // epoch ms; attacker pays while Date.now() < this - 0 means never opened yet
    jackpotOpenUntil: number; // epoch ms; jackpot pays while Date.now() < this - 0 means never primed yet. Set the instant both tulips are simultaneously open, which also immediately resets both back to closed (see the tulip branches below) - there's no standing "primed" state, only this timed window.
    results: PachinkoBallResult[];
    topups: PachinkoTopup[];
    pendingTickets: PendingTicket[]; // claimed, not yet confirmed - see PendingTicket
    // Set atomically the instant a cash-out claims the round's balls (before the real-money
    // transfer even starts), cleared once that transfer confirms. If the process dies in
    // between, the round's balls are already zeroed but the player hasn't been paid yet -
    // the stale-round sweep finishes that transfer using the same idempotent key a live request
    // would have used, so a crash mid-cashout can't strand the player's cheddar.
    cashOutPending: CashOutPending | null;
}

const nailField = generateNailField(); // static geometry, computed once and reused for every /odds response

// The one place a ticket actually gets scored - re-runs the exact seeded simulation the client
// already showed a preview of, and is the SOLE source of truth for the outcome (nothing the
// client claims is ever trusted or even looked at). Called from both the live /confirm route and
// the stale-round sweep (a ticket nobody ever confirms still needs settling, not just refunding -
// the ball was already fired, its cost already spent, so it has a real decided outcome due).
//
// Returns null when there's nothing to do: the seed doesn't match any currently-pending ticket,
// either because it was already confirmed (a client retry racing its own earlier success) or
// because it's bogus. Never a hard failure worth surfacing as an error in that case.
async function confirmTicket(userId: string, seed: number): Promise<{ result: PachinkoBallResult; updatedConditions: PachinkoConditions } | null> {
    const round = await XenCasinoRound.findActive(SLUG, userId);
    if (!round) {
        return null;
    }
    let liveConditions = round.conditions as PachinkoConditions;
    const ticket = liveConditions.pendingTickets.find((t) => t.seed === seed);
    if (!ticket) {
        return null;
    }

    // Fully decided before anything is persisted - see the file header. Runs on the physics
    // worker pool (see physicsPool above), not inline on the main thread. Re-derives the exact
    // same trajectory/outcome the client already showed a preview of, from the same seed - never
    // anything the client itself reports.
    const { trajectory, outcome }: ShotResult = await physicsPool.run({
        seed: ticket.seed,
        launchPower: ticket.launchPower,
        chuckerActive: ticket.chuckerActive,
        attackerActive: ticket.attackerActive,
        jackpotActive: ticket.jackpotActive,
    });

    // ballsAwarded/reelSpin/poolContribution/resetPool depend only on `outcome` (already
    // decided) plus one-shot randomness (spinReel, the jackpot pool read) - never on the
    // board's own tulip/attacker/jackpot gate state, so these are safe to decide once.
    let ballsAwarded = 0;
    let poolContribution = 0;
    let resetPool = false;
    let reelSpin: ReelSpinResult | undefined;

    if (outcome === "bonusLeft" || outcome === "bonusRight") {
        ballsAwarded = BONUS_POCKET_BALLS;
        poolContribution = liveConditions.pricePerBall * CONTRIBUTION_RATE;
    } else if (outcome === "tulipLeft" || outcome === "tulipRight") {
        ballsAwarded = SIDE_TULIP_BALLS;
        poolContribution = liveConditions.pricePerBall * CONTRIBUTION_RATE;
    } else if (outcome === "chucker") {
        // Fires the board's own central reel gimmick - a real machine's "heso" -> LCD
        // reel -> bonus round flow (see pachinkoReels.ts). A catch with no match or a
        // two-of-a-kind opens nothing; only a three-of-a-kind match opens the attacker
        // for ATTACKER_OPEN_MS, ADDED on top of whatever's currently left on the clock
        // (not reset to it) - queued chucker catches landing close together under
        // hold-to-fire stack their time instead of one clobbering another's.
        reelSpin = spinReel();
        ballsAwarded = reelSpin.ballsAwarded;
        poolContribution = liveConditions.pricePerBall * CONTRIBUTION_RATE;
    } else if (outcome === "attacker") {
        // Physics only ever returns "attacker" while attackerActive was true, i.e. it
        // was actually open for this shot - no need to re-check attackerOpen here.
        ballsAwarded = ATTACKER_BALLS;
        poolContribution = liveConditions.pricePerBall * CONTRIBUTION_RATE;
    } else if (outcome === "jackpot") {
        // Physics only ever returns "jackpot" while jackpotActive was true, i.e. within
        // its own timed window - no need to re-check jackpotOpen here. Catching it closes
        // the window immediately rather than letting it run out naturally.
        const pool = await XenCasino.getPachinkoJackpotPool();
        ballsAwarded = jackpotBalls(pool, liveConditions.pricePerBall);
        resetPool = true;
    } else {
        poolContribution = liveConditions.pricePerBall * CONTRIBUTION_RATE;
    }

    const result: PachinkoBallResult = { outcome, ballsAwarded, trajectory, reelSpin };

    // The client's own local preview already started flying this ball the instant the ticket
    // arrived (see PachinkoBoard.tsx's sim worker) - not once THIS confirm response arrives,
    // which could be a while after under hold-to-fire (confirms run in the background, not
    // gating the next shot). A newly-primed jackpot window has to be anchored to when the client
    // actually showed the catch (ticket.issuedAt + however long that flight took), not to now.
    const now = Date.now();
    const landedAt = ticket.issuedAt + Math.max(0, trajectory.length - 1) * TRAJECTORY_SAMPLE_MS;

    // Everything below - tulip toggle, jackpot priming, attacker stacking, the lapsed-tulip
    // closeout - depends on the board's CURRENT gate state, which by the time we get here may no
    // longer match `liveConditions` (other tickets for this same round can confirm concurrently,
    // same as launches always could). Guard the write on the exact gate fields this transition
    // was computed from, and recompute against fresh state on conflict instead of blindly
    // overwriting whatever another concurrent confirm already decided. Also guard on the ticket
    // itself still being pending (`$pull`ed atomically alongside), so two racing confirms for the
    // same seed can't both credit it.
    let updated: Awaited<ReturnType<typeof XenCasinoRound.applyConditionsUpdate>> = null;
    for (let attempt = 0; attempt < MAX_LAUNCH_WRITE_ATTEMPTS && !updated; attempt++) {
        let nextLeftOpen = liveConditions.leftTulipOpen;
        let nextRightOpen = liveConditions.rightTulipOpen;
        let nextAttackerOpenUntil = liveConditions.attackerOpenUntil;
        let nextJackpotOpenUntil = liveConditions.jackpotOpenUntil;

        const jackpotWindowActive = liveConditions.jackpotOpenUntil > now;
        if (outcome === "tulipLeft" || outcome === "tulipRight") {
            if (jackpotWindowActive) {
                // Both tulips are held open for the rest of an already-active jackpot
                // window - a catch on either side still pays SIDE_TULIP_BALLS (handled
                // above) but doesn't toggle the gate itself until the window resolves.
            } else {
                if (outcome === "tulipLeft") {
                    nextLeftOpen = !liveConditions.leftTulipOpen;
                } else {
                    nextRightOpen = !liveConditions.rightTulipOpen;
                }
                // The instant both are simultaneously open is the priming moment - starts
                // the jackpot's own timed window (see JACKPOT_OPEN_MS). Both tulips then
                // stay open for the whole window (see jackpotWindowActive above and the
                // "jackpot" outcome branch below), not reset immediately - catching the
                // jackpot, or letting the window lapse, is what closes them again.
                if (isJackpotPrimed(nextLeftOpen, nextRightOpen)) {
                    nextJackpotOpenUntil = landedAt + JACKPOT_OPEN_MS;
                }
            }
        } else if (outcome === "chucker" && reelSpin && reelSpin.attackerOpenMs > 0) {
            nextAttackerOpenUntil = Math.max(now, liveConditions.attackerOpenUntil) + reelSpin.attackerOpenMs;
        } else if (outcome === "jackpot") {
            // Catching the jackpot pocket resolves the window right now, same as letting
            // it lapse - close both tulips immediately rather than waiting for the next
            // shot's shouldCloseLapsedTulips check to notice.
            nextJackpotOpenUntil = 0;
            nextLeftOpen = false;
            nextRightOpen = false;
        }

        // If a jackpot window WAS actually primed and has since expired without being
        // caught, close any open tulips - they exist only to prime the jackpot, so
        // there's no reason to leave them open once the window ends (see
        // shouldCloseLapsedTulips's own comment for why this can't just be "there's
        // currently no open window"). Also clears jackpotOpenUntil back to 0 - leaving it
        // at its lapsed (past) timestamp would make this same check true forever after,
        // permanently re-closing every future tulip toggle on the very shot that made it.
        if (shouldCloseLapsedTulips(liveConditions.jackpotOpenUntil, nextJackpotOpenUntil, now)) {
            nextLeftOpen = false;
            nextRightOpen = false;
            nextJackpotOpenUntil = 0;
        }

        updated = await XenCasinoRound.applyConditionsUpdate(
            round._id,
            {
                "conditions.pendingTickets.seed": seed,
                "conditions.leftTulipOpen": liveConditions.leftTulipOpen,
                "conditions.rightTulipOpen": liveConditions.rightTulipOpen,
                "conditions.attackerOpenUntil": liveConditions.attackerOpenUntil,
                "conditions.jackpotOpenUntil": liveConditions.jackpotOpenUntil,
            },
            {
                $inc: { "conditions.ballsRemaining": ballsAwarded },
                $push: { "conditions.results": result },
                $pull: { "conditions.pendingTickets": { seed } },
                $set: {
                    "conditions.leftTulipOpen": nextLeftOpen,
                    "conditions.rightTulipOpen": nextRightOpen,
                    "conditions.attackerOpenUntil": nextAttackerOpenUntil,
                    "conditions.jackpotOpenUntil": nextJackpotOpenUntil,
                },
            }
        );
        if (!updated) {
            const fresh = await XenCasinoRound.findActive(SLUG, userId);
            const freshConditions = fresh?.conditions as PachinkoConditions | undefined;
            const freshTicket = freshConditions?.pendingTickets.find((t) => t.seed === seed);
            if (!freshConditions || !freshTicket) {
                // Already confirmed (or the round's gone) - nothing left for this call to do.
                return null;
            }
            liveConditions = freshConditions; // gate state moved under us - retry against it
        }
    }
    if (!updated) {
        throw new Error("Pachinko board is busy right now - try again");
    }

    if (resetPool) {
        await XenCasino.resetPachinkoJackpotPool(JACKPOT_SEED);
    } else if (poolContribution > 0) {
        await XenCasino.incrementPachinkoJackpotPool(poolContribution);
    }

    return { result, updatedConditions: updated.conditions as PachinkoConditions };
}

// A session can legitimately sit open for minutes between launches (think-time between balls).
// sweepStale keys off lastActivityAt (see xenCasino.js), so an actively-playing session is
// never mistaken for an abandoned one.
const ROUND_TTL_MS = 5 * 60 * 1000;
scheduleStaleRoundSweep(SLUG, ROUND_TTL_MS, async (round) => {
    // Settle any tickets nobody ever confirmed FIRST - each one already cost a real ball (spent
    // at /launch time, see PendingTicket), so it has a genuine decided outcome still owed, not
    // just an unfired ball to refund. Re-fetches conditions fresh afterward since confirmTicket
    // mutates ballsRemaining/results out from under the snapshot the sweep loop originally read.
    for (const ticket of (round.conditions as PachinkoConditions).pendingTickets ?? []) {
        await confirmTicket(round.userId, ticket.seed);
    }
    const settled = await XenCasinoRound.findActive(SLUG, round.userId);
    const conditions = (settled?.conditions ?? round.conditions) as PachinkoConditions;
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
                attackerOpenMs: ATTACKER_OPEN_MS,
                jackpotOpenMs: JACKPOT_OPEN_MS,
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
        const conditions = round.conditions as PachinkoConditions;
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
                attackerOpenUntil: conditions.attackerOpenUntil,
                jackpotOpenUntil: conditions.jackpotOpenUntil,
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
            const resolved = await resolveUserAccount(user);
            if (!resolved.linked || !resolved.account) {
                return res.status(400).json({ status: false, message: "Link your Discord account to play" });
            }
            if (Number(resolved.account.balance) < wager) {
                return res.status(400).json({ status: false, message: "Insufficient balance" });
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
                        fromAccountId: resolved.account.accountId,
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

                const conditions = reserved.conditions as PachinkoConditions;
                return res.json({
                    status: true,
                    data: {
                        roundId: reserved._id,
                        ballsTotal: conditions.ballsTotal,
                        ballsRemaining: conditions.ballsRemaining,
                        pricePerBall: conditions.pricePerBall,
                        leftTulipOpen: conditions.leftTulipOpen,
                        rightTulipOpen: conditions.rightTulipOpen,
                        attackerOpenUntil: conditions.attackerOpenUntil,
                        jackpotOpenUntil: conditions.jackpotOpenUntil,
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
                attackerOpenUntil: 0,
                jackpotOpenUntil: 0,
                results: [],
                topups: [],
                pendingTickets: [],
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
                    playerAccountId: resolved.account.accountId,
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
                    fromAccountId: resolved.account.accountId,
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
                    balance,
                },
            });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    // Cheap - claims a ball and hands back a ticket, no physics at all (see the file header for
    // why: this used to be where the whole matter-js simulation ran, which is exactly what let a
    // slow/backed-up physics pool stall the entire hold-to-fire loop). The client replays the
    // exact same seeded shot locally the instant this response arrives and starts animating
    // immediately; /launch/confirm (below) is what actually scores it, in the background.
    app.post(`/api/casino/games/${SLUG}/launch`, authenticateToken, async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { launchPower } = req.body as { launchPower?: number };
        if (typeof launchPower !== "number" || !Number.isFinite(launchPower) || launchPower < MIN_LAUNCH_POWER || launchPower > MAX_LAUNCH_POWER) {
            return res.status(400).json({ status: false, message: `launchPower must be between ${MIN_LAUNCH_POWER} and ${MAX_LAUNCH_POWER}` });
        }

        try {
            const round = await XenCasinoRound.findActive(SLUG, userId);
            if (!round) {
                return res.status(400).json({ status: false, message: "No active batch - buy balls first" });
            }
            const conditions = round.conditions as PachinkoConditions;
            if (conditions.ballsRemaining <= 0) {
                return res.status(400).json({ status: false, message: "No balls remaining in this batch" });
            }

            const now = Date.now();
            // Self-healing safety net for tickets whose /confirm call never made it back (a
            // client that gave up retrying, a tab that died mid-flight) - an actively-firing
            // round never goes stale (see ROUND_TTL_MS/lastActivityAt below), so a dangling
            // ticket in one could otherwise sit unconfirmed indefinitely despite the ball's cost
            // already being spent. Piggybacks on the player's own next launch rather than a
            // separate background job; fire-and-forget so a slow settle never delays this shot.
            for (const stale of conditions.pendingTickets) {
                if (now - stale.issuedAt > TICKET_TTL_MS) {
                    void confirmTicket(userId, stale.seed).catch(() => undefined);
                }
            }
            // The chucker, the attacker, and the jackpot are each only ever physically present
            // (real walls, real catch) while active - see pachinkoPhysics.ts's own comment on
            // chuckerActive/attackerActive/jackpotActive. Locked into the ticket now, at issue
            // time - both the client's own preview and the server's later /confirm replay must
            // simulate against the exact same gate state, not whatever it happens to be by the
            // time confirm actually runs.
            const attackerOpen = conditions.attackerOpenUntil > now;
            const jackpotOpen = conditions.jackpotOpenUntil > now;
            const ticket: PendingTicket = {
                seed: randomSeed(),
                launchPower,
                chuckerActive: !attackerOpen,
                attackerActive: attackerOpen,
                jackpotActive: jackpotOpen,
                issuedAt: now,
            };

            // Optimistic claim - guarded on the exact ballsRemaining just read, same shape every
            // other claim-then-act write in this file uses. On conflict, just tell the client to
            // retry rather than looping: unlike the old inline-physics /launch, nothing expensive
            // has happened yet, so there's nothing to unwind and no reason to retry server-side.
            const updated = await XenCasinoRound.applyConditionsUpdate(
                round._id,
                { "conditions.ballsRemaining": { $gt: 0 } },
                { $inc: { "conditions.ballsRemaining": -1 }, $push: { "conditions.pendingTickets": ticket } }
            );
            if (!updated) {
                return res.status(409).json({ status: false, message: "No balls remaining" });
            }

            const updatedConditions = updated.conditions as PachinkoConditions;
            return res.json({
                status: true,
                data: {
                    seed: ticket.seed,
                    launchPower,
                    chuckerActive: ticket.chuckerActive,
                    attackerActive: ticket.attackerActive,
                    jackpotActive: ticket.jackpotActive,
                    ballsRemaining: updatedConditions.ballsRemaining,
                },
            });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    // The only place a launch ticket actually gets scored - see confirmTicket's own header for
    // why the client's own local preview is never trusted here. Meant to be called in the
    // background right after the client's local sim finishes (or retried later if that fails) -
    // never something the firing loop waits on, so a slow or failed confirm can't stall hold-to-
    // fire the way a slow inline /launch used to.
    app.post(`/api/casino/games/${SLUG}/launch/confirm`, authenticateToken, async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { seed } = req.body as { seed?: number };
        if (typeof seed !== "number" || !Number.isFinite(seed)) {
            return res.status(400).json({ status: false, message: "seed must be a number" });
        }
        if (physicsPool.queueSize >= MAX_QUEUED_PHYSICS_JOBS) {
            return res.status(503).json({ status: false, message: "Pachinko is under heavy load right now - try again in a moment" });
        }

        try {
            const settled = await confirmTicket(userId, seed);
            if (!settled) {
                // Already confirmed (a client retry racing its own earlier success) or the round
                // is gone - either way there's nothing left to do, and definitely nothing to
                // treat as a fresh error the client should react to.
                return res.json({ status: true, data: { alreadySettled: true } });
            }
            const { result, updatedConditions } = settled;
            return res.json({
                status: true,
                data: {
                    outcome: result.outcome,
                    ballsAwarded: result.ballsAwarded,
                    reelSpin: result.reelSpin,
                    leftTulipOpen: updatedConditions.leftTulipOpen,
                    rightTulipOpen: updatedConditions.rightTulipOpen,
                    attackerOpenUntil: updatedConditions.attackerOpenUntil,
                    jackpotOpenUntil: updatedConditions.jackpotOpenUntil,
                    ballsRemaining: updatedConditions.ballsRemaining,
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
            let round = await XenCasinoRound.findActive(SLUG, userId);
            if (!round) {
                return res.status(400).json({ status: false, message: "No active batch" });
            }

            // Settle any still-in-flight tickets before reading ballsRemaining for the cash-out
            // amount - each one already cost a real ball and may have a real payout due; cashing
            // out from underneath an unconfirmed shot would silently strand its winnings once the
            // round resolves. Normally a no-op (there's rarely anything pending by the time a
            // player deliberately presses Cash Out).
            for (const ticket of (round.conditions as PachinkoConditions).pendingTickets) {
                await confirmTicket(userId, ticket.seed);
            }
            round = await XenCasinoRound.findActive(SLUG, userId);
            if (!round) {
                return res.status(400).json({ status: false, message: "No active batch" });
            }

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
