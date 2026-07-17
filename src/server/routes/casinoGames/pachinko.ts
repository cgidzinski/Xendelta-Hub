/**
 * Pachinko — a batch-of-balls board game, unlike every other XenCasino game so far.
 * Slots/Scratch/Plinko are all single-request (bet, get an outcome, done); Pachinko is "buy
 * a batch of balls, then launch them one at a time" - the first game to use XenCasinoRound
 * as an actual multi-step session rather than a one-shot durable record (see xenCasino.js's
 * file header, which already anticipated this).
 *
 * Unlike Plinko (and this game's own first draft), there's no pre-selected target outcome.
 * The player's launch power is a genuine physics input - pachinkoPhysics.simulateShot() runs
 * one real matter-js simulation using it, and whatever the ball actually hits *is* the
 * outcome. That's still decided fully before anything is persisted or any money moves - the
 * simulation runs, then one atomic update claims the ball slot and records the decided
 * result together (XenCasinoRound.applyConditionsUpdate), mirroring the "decide, then
 * persist, then pay" order every other game uses.
 *
 * Tulip open/closed state lives on the player's own round (conditions.leftTulipOpen /
 * rightTulipOpen), not shared across players - each player works through their own priming
 * sequence within their own batch. The jackpot pool *is* shared (same pattern Slots' pool
 * already uses): every non-jackpot ball feeds it by CONTRIBUTION_RATE * pricePerBall, and a
 * primed center-tulip catch pays out the live pool value and resets it.
 */
import express = require("express");
import { authenticateToken } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/AuthenticatedRequest";
const { User } = require("../../models/user");
const { XenCasino, XenCasinoRound } = require("../../models/xenCasino");
const crypto = require("crypto");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../../utils/weeabetsClient";
import { recordCasinoRoundPlayed } from "../../utils/dailyQuest";
import {
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    BOUNDARY_RIGHT_ARC,
    BOUNDARY_LEFT_ARC,
    LAUNCHER_POSITION,
    RELEASE_POINT,
    CHANNEL_INNER_X,
    CHANNEL_OUTER_X,
    GUTTER_CUTOUT_X_START,
    GUTTER_CUTOUT_X_END,
    GUTTER_POCKET,
    TULIPS,
    WINDMILLS,
    generateNailField,
    MIN_LAUNCH_POWER,
    MAX_LAUNCH_POWER,
} from "./pachinkoLayout";
import { SIDE_TULIP_MULTIPLIER, CONTRIBUTION_RATE, JACKPOT_SEED, sideTulipPayout } from "./pachinkoPayouts";
import { simulateShot, PachinkoOutcome, TrajectorySample } from "./pachinkoPhysics";

const SLUG = "pachinko";
const PRICE_PER_BALL = 100;
const BATCH_SIZES = [10, 25, 50, 100];

interface PachinkoBallResult {
    outcome: PachinkoOutcome;
    payout: number;
    trajectory: TrajectorySample[];
}

interface PachinkoConditions {
    ballsTotal: number;
    ballsRemaining: number;
    pricePerBall: number;
    totalPayout: number;
    leftTulipOpen: boolean;
    rightTulipOpen: boolean;
    results: PachinkoBallResult[];
}

const nailField = generateNailField(); // static geometry, computed once and reused for every /odds response

// A session can legitimately sit open for minutes between launches (think-time between
// balls) - far longer than Plinko's 30s, which only ever needs to cover a mid-settlement
// crash. sweepStale keys off lastActivityAt (see xenCasino.js), so an actively-playing
// session is never mistaken for an abandoned one.
const ROUND_TTL_MS = 5 * 60 * 1000;
setInterval(() => {
    recoverStaleRounds().catch((err: Error) => {
        console.error(`${SLUG}: stale round recovery failed`, err);
    });
}, 60 * 1000).unref();

// Pays out one ball's already-decided result (if any) and updates the jackpot pool - shared
// by the live launch handler and the recovery sweep so both settle a ball exactly the same
// way. Idempotency key is per-ball (round + its index in `results`), so replaying this for
// the same ball is always safe.
async function settleBall(
    round: { _id: string; playerAccountId: number },
    ballIndex: number,
    result: PachinkoBallResult,
    pricePerBall: number
): Promise<{ balance?: string }> {
    let balance: string | undefined;
    if (result.payout > 0) {
        const xenCasinoAccountId = await getXenCasinoAccountId();
        const transferResult = await transfer({
            fromAccountId: xenCasinoAccountId,
            toAccountId: round.playerAccountId,
            amount: result.payout.toFixed(10),
            key: `xendelta-${SLUG}-payout-${round._id}-${ballIndex}`,
            note: result.outcome === "tulipCenter" ? `${SLUG}_jackpot` : `${SLUG}_win`,
        });
        balance = transferResult.toNewBalance;
    }

    if (result.outcome === "tulipCenter") {
        await XenCasino.resetPachinkoJackpotPool(JACKPOT_SEED);
    } else {
        await XenCasino.incrementPachinkoJackpotPool(pricePerBall * CONTRIBUTION_RATE);
    }

    return { balance };
}

async function recoverStaleRounds(): Promise<void> {
    const stale = await XenCasinoRound.sweepStale(SLUG, ROUND_TTL_MS);
    for (const round of stale) {
        try {
            const conditions = round.conditions as PachinkoConditions;
            const xenCasinoAccountId = await getXenCasinoAccountId();

            // Replaying the batch debit is safe even if it already went through - the key
            // makes it a no-op on the ledger, not a double charge.
            await transfer({
                fromAccountId: round.playerAccountId,
                toAccountId: xenCasinoAccountId,
                amount: round.wager.toFixed(10),
                key: round.debitKey,
                note: `${SLUG}_wager`,
            });

            // The most recently launched ball's outcome was already decided and persisted
            // (see the file header) - only its *settlement* (payout + pool update) might not
            // have completed if the process died mid-request. Every earlier ball's
            // settlement already completed, or this round couldn't have progressed past it.
            // Same accepted shape as Slots' own recovery sweep (which replays settleRound
            // wholesale on sweep too).
            if (conditions.results.length > 0) {
                const lastIndex = conditions.results.length - 1;
                await settleBall({ _id: round._id, playerAccountId: round.playerAccountId }, lastIndex, conditions.results[lastIndex], conditions.pricePerBall);
            }

            // No outcome was ever decided for balls that were never launched, so there's
            // nothing to pay out for them - refund their pro-rated cost instead of either
            // forfeiting it or leaving the round stuck open forever.
            if (conditions.ballsRemaining > 0) {
                const refund = conditions.ballsRemaining * conditions.pricePerBall;
                if (refund > 0) {
                    await transfer({
                        fromAccountId: xenCasinoAccountId,
                        toAccountId: round.playerAccountId,
                        amount: refund.toFixed(10),
                        key: `xendelta-${SLUG}-refund-${round._id}`,
                        note: `${SLUG}_refund`,
                    });
                }
            }

            await XenCasinoRound.resolve(round._id);
            // Only counts as "played" if at least one ball was actually launched -
            // otherwise a buy-then-abandon cycle (fully refunded above) would let a player
            // farm daily quest progress for free with no risk.
            if (conditions.results.length > 0) {
                await recordCasinoRoundPlayed(round.userId);
            }
        } catch (err) {
            console.error(`${SLUG}: failed to recover stale round ${round._id}`, err);
        }
    }
}

module.exports = function (app: express.Application) {
    app.get(`/api/casino/games/${SLUG}/odds`, authenticateToken, async function (_req: express.Request, res: express.Response) {
        const jackpotPool = await XenCasino.getPachinkoJackpotPool();
        return res.json({
            status: true,
            data: {
                pricePerBall: PRICE_PER_BALL,
                batchSizes: BATCH_SIZES,
                launchPowerRange: { min: MIN_LAUNCH_POWER, max: MAX_LAUNCH_POWER },
                layout: {
                    canvasWidth: CANVAS_WIDTH,
                    canvasHeight: CANVAS_HEIGHT,
                    boundaryRightArc: BOUNDARY_RIGHT_ARC,
                    boundaryLeftArc: BOUNDARY_LEFT_ARC,
                    launcherPosition: LAUNCHER_POSITION,
                    releasePoint: RELEASE_POINT,
                    channelInnerX: CHANNEL_INNER_X,
                    channelOuterX: CHANNEL_OUTER_X,
                    gutterCutoutXStart: GUTTER_CUTOUT_X_START,
                    gutterCutoutXEnd: GUTTER_CUTOUT_X_END,
                    gutterPocket: GUTTER_POCKET,
                    nailField,
                    tulips: TULIPS,
                    windmills: WINDMILLS,
                },
                sideTulipMultiplier: SIDE_TULIP_MULTIPLIER,
                jackpotPool,
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
                totalPayout: conditions.totalPayout,
                leftTulipOpen: conditions.leftTulipOpen,
                rightTulipOpen: conditions.rightTulipOpen,
                // Trajectories deliberately omitted for already-launched balls - resuming
                // shows a summary, not a replay, so this stays small regardless of batch size.
                results: conditions.results.map((r) => ({ outcome: r.outcome, payout: r.payout })),
            },
        });
    });

    app.post(`/api/casino/games/${SLUG}/buy`, authenticateToken, async function (req: express.Request, res: express.Response) {
        const { ballsTotal } = req.body as { ballsTotal?: number };
        if (typeof ballsTotal !== "number" || !BATCH_SIZES.includes(ballsTotal)) {
            return res.status(400).json({ status: false, message: `ballsTotal must be one of ${BATCH_SIZES.join(", ")}` });
        }

        const userId = String((req as AuthenticatedRequest).user!._id);
        const user = await User.findById(userId).exec();
        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }

        const wager = ballsTotal * PRICE_PER_BALL;

        try {
            const resolved = await resolveUserAccount(user);
            if (!resolved.linked || !resolved.account) {
                return res.status(400).json({ status: false, message: "Link your Discord account to play" });
            }
            if (Number(resolved.account.balance) < wager) {
                return res.status(400).json({ status: false, message: "Insufficient balance" });
            }

            const conditions: PachinkoConditions = {
                ballsTotal,
                ballsRemaining: ballsTotal,
                pricePerBall: PRICE_PER_BALL,
                totalPayout: 0,
                leftTulipOpen: false,
                rightTulipOpen: false,
                results: [],
            };
            const debitKey = `xendelta-${SLUG}-start-${userId}-${crypto.randomUUID()}`;

            let round;
            try {
                round = await XenCasinoRound.startRound({
                    game: SLUG,
                    userId,
                    wager,
                    debitKey,
                    playerAccountId: resolved.account.accountId,
                    conditions,
                });
            } catch (err) {
                if ((err as { code?: number }).code === 11000) {
                    return res.status(400).json({ status: false, message: "You already have an active batch - finish it or wait for it to expire" });
                }
                throw err;
            }

            const xenCasinoAccountId = await getXenCasinoAccountId();
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
                throw err; // ambiguous - leave round in place, the recovery sweep will retry
            }

            return res.json({
                status: true,
                data: {
                    roundId: round._id,
                    ballsTotal,
                    ballsRemaining: ballsTotal,
                    pricePerBall: PRICE_PER_BALL,
                    totalPayout: 0,
                    leftTulipOpen: false,
                    rightTulipOpen: false,
                    balance,
                },
            });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

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

            // Fully decided before anything is persisted - see the file header. Tulip state
            // is per-round (not shared), so this is a plain read-simulate-write, no
            // compare-and-swap needed against other players.
            const { trajectory, outcome } = simulateShot(launchPower, {
                leftOpen: conditions.leftTulipOpen,
                rightOpen: conditions.rightTulipOpen,
            });

            let payout = 0;
            let nextLeftOpen = conditions.leftTulipOpen;
            let nextRightOpen = conditions.rightTulipOpen;
            if (outcome === "tulipLeft") {
                payout = sideTulipPayout(conditions.pricePerBall);
                nextLeftOpen = !conditions.leftTulipOpen;
            } else if (outcome === "tulipRight") {
                payout = sideTulipPayout(conditions.pricePerBall);
                nextRightOpen = !conditions.rightTulipOpen;
            } else if (outcome === "tulipCenter") {
                payout = await XenCasino.getPachinkoJackpotPool();
                nextLeftOpen = false;
                nextRightOpen = false;
            }

            const ballIndex = conditions.results.length;
            const result: PachinkoBallResult = { outcome, payout, trajectory };

            const updated = await XenCasinoRound.applyConditionsUpdate(
                round._id,
                { "conditions.ballsRemaining": { $gt: 0 } },
                {
                    $inc: { "conditions.ballsRemaining": -1, "conditions.totalPayout": payout },
                    $push: { "conditions.results": result },
                    $set: { "conditions.leftTulipOpen": nextLeftOpen, "conditions.rightTulipOpen": nextRightOpen },
                }
            );
            if (!updated) {
                // A concurrent request (double-click, duplicate tab) already claimed the
                // last ball - nothing was decided for *this* request, so nothing to unwind.
                return res.status(409).json({ status: false, message: "No balls remaining" });
            }

            const settled = await settleBall({ _id: round._id, playerAccountId: round.playerAccountId }, ballIndex, result, conditions.pricePerBall);

            const updatedConditions = updated.conditions as PachinkoConditions;
            if (updatedConditions.ballsRemaining === 0) {
                await XenCasinoRound.resolve(round._id);
                await recordCasinoRoundPlayed(userId);
            }

            return res.json({
                status: true,
                data: {
                    outcome,
                    payout,
                    trajectory,
                    leftTulipOpen: updatedConditions.leftTulipOpen,
                    rightTulipOpen: updatedConditions.rightTulipOpen,
                    ballsRemaining: updatedConditions.ballsRemaining,
                    totalPayout: updatedConditions.totalPayout,
                    balance: settled.balance,
                },
            });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });
};
