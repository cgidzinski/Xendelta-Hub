/**
 * Plinko — a 12-row peg board, 13 landing slots (0-12). The landing slot used to be decided
 * by 12 independent fair coin flips (`crypto.randomInt(0, 2)` per row), with the *count* of
 * "right" flips giving a binomial-distributed slot for free and a flip sequence the client
 * replayed as a predetermined walk - no physics engine involved.
 *
 * It's real physics now (matter-js, see plinkoPhysics.ts), matching the same architecture
 * Pachinko was rebuilt around: the player aims a drop position (`dropX`, wherever a marker
 * gliding back and forth above the board was when they clicked) and a real ball falls
 * through the real peg field from there - gravity, per-shot peg-restitution jitter, real
 * collisions. Whatever slot the ball actually lands in is the outcome; nothing is
 * pre-selected. `MULTIPLIERS` (in plinkoLayout.ts) is carried over unchanged from the
 * coin-flip build, but is no longer solved for an exact RTP target - there's no closed-form
 * probability model to solve against anymore now that the drop position is a player input
 * and the pegs are real obstacles rather than an abstract binomial walk. Rough starting
 * values, same "playable first, tune later" call already made for Pachinko's payouts.
 *
 * Same debit-at-start pattern used across every game in this app: the drop is fully decided
 * before any money moves, then persisted into a XenCasinoRound alongside the wager debit's
 * idempotency key, with a periodic sweep to finish the job if the process dies
 * mid-settlement.
 */
import express = require("express");
import { authenticateToken } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/AuthenticatedRequest";
const { User } = require("../../models/user");
const { XenCasinoRound } = require("../../models/xenCasino");
const crypto = require("crypto");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../../utils/weeabetsClient";
import { recordCasinoRoundPlayed } from "../../utils/dailyQuest";
import {
    CANVAS_WIDTH,
    CANVAS_HEIGHT,
    ROWS,
    SLOT_COUNT,
    BOARD_TOP,
    BOARD_BOTTOM,
    SLOT_FLOOR_Y,
    DROP_Y,
    DROP_MIN_X,
    DROP_MAX_X,
    PEG_RADIUS,
    BALL_RADIUS,
    MULTIPLIERS,
    generatePegPositions,
    slotBoundaries,
} from "./plinkoLayout";
import { simulateDrop, TrajectorySample } from "./plinkoPhysics";

const SLUG = "plinko";

interface PlinkoConditions {
    dropX: number;
    slot: number;
    multiplier: number;
    payout: number;
}

function decideDrop(wager: number, dropX: number): { conditions: PlinkoConditions; trajectory: TrajectorySample[] } {
    const { trajectory, slot } = simulateDrop(dropX);
    const multiplier = MULTIPLIERS[slot];
    return { conditions: { dropX, slot, multiplier, payout: wager * multiplier }, trajectory };
}

// A round's outcome (and thus its payout) is fully decided before it's even persisted, so
// "stale" only ever means "the process died mid-settlement" - the sweep below finishes it.
const ROUND_TTL_MS = 30 * 1000;
setInterval(() => {
    recoverStaleRounds().catch((err: Error) => {
        console.error(`${SLUG}: stale round recovery failed`, err);
    });
}, 60 * 1000).unref();

// Pays out the round's already-decided payout (if any). Shared by the live drop handler
// and the recovery sweep so both settle a round exactly the same way.
async function settleRound(round: { _id: string; playerAccountId: number; conditions: PlinkoConditions }): Promise<{ balance?: string }> {
    const { payout } = round.conditions;
    if (payout <= 0) {
        return {};
    }
    const xenCasinoAccountId = await getXenCasinoAccountId();
    const result = await transfer({
        fromAccountId: xenCasinoAccountId,
        toAccountId: round.playerAccountId,
        amount: payout.toFixed(10),
        key: `xendelta-${SLUG}-payout-${round._id}`,
        note: `${SLUG}_win`,
    });
    return { balance: result.toNewBalance };
}

async function recoverStaleRounds(): Promise<void> {
    const stale = await XenCasinoRound.sweepStale(SLUG, ROUND_TTL_MS);
    for (const round of stale) {
        try {
            const xenCasinoAccountId = await getXenCasinoAccountId();
            // Replaying the debit is safe even if it already went through - the key makes
            // it a no-op on the ledger, not a double charge.
            await transfer({
                fromAccountId: round.playerAccountId,
                toAccountId: xenCasinoAccountId,
                amount: round.wager.toFixed(10),
                key: round.debitKey,
                note: `${SLUG}_wager`,
            });
            await settleRound(round);
            await XenCasinoRound.resolve(round._id);
            await recordCasinoRoundPlayed(round.userId);
        } catch (err) {
            console.error(`${SLUG}: failed to recover stale round ${round._id}`, err);
        }
    }
}

module.exports = function (app: express.Application) {

    app.get(`/api/casino/games/${SLUG}/odds`, authenticateToken, function (_req: express.Request, res: express.Response) {
        return res.json({
            status: true,
            data: {
                rows: ROWS,
                slotCount: SLOT_COUNT,
                multipliers: MULTIPLIERS,
                layout: {
                    canvasWidth: CANVAS_WIDTH,
                    canvasHeight: CANVAS_HEIGHT,
                    boardTop: BOARD_TOP,
                    boardBottom: BOARD_BOTTOM,
                    slotFloorY: SLOT_FLOOR_Y,
                    dropY: DROP_Y,
                    dropMinX: DROP_MIN_X,
                    dropMaxX: DROP_MAX_X,
                    pegRadius: PEG_RADIUS,
                    ballRadius: BALL_RADIUS,
                    pegPositions: generatePegPositions(),
                    slotBoundaries: slotBoundaries(),
                },
            },
        });
    });

    app.post(`/api/casino/games/${SLUG}/drop`, authenticateToken, async function (req: express.Request, res: express.Response) {
        const { wager, dropX } = req.body as { wager?: number; dropX?: number };
        if (typeof wager !== "number" || !Number.isFinite(wager) || wager <= 0) {
            return res.status(400).json({ status: false, message: "wager must be a positive number" });
        }
        if (typeof dropX !== "number" || !Number.isFinite(dropX) || dropX < DROP_MIN_X || dropX > DROP_MAX_X) {
            return res.status(400).json({ status: false, message: `dropX must be between ${DROP_MIN_X} and ${DROP_MAX_X}` });
        }

        const userId = String((req as AuthenticatedRequest).user!._id);
        const user = await User.findById(userId).exec();
        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }

        try {
            const resolved = await resolveUserAccount(user);
            if (!resolved.linked || !resolved.account) {
                return res.status(400).json({ status: false, message: "Link your Discord account to play" });
            }
            if (Number(resolved.account.balance) < wager) {
                return res.status(400).json({ status: false, message: "Insufficient balance" });
            }

            const { conditions, trajectory } = decideDrop(wager, dropX);

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
                    return res.status(400).json({ status: false, message: "You already have an active round on this board" });
                }
                throw err;
            }

            const xenCasinoAccountId = await getXenCasinoAccountId();
            let debitBalance: string;
            try {
                const result = await transfer({
                    fromAccountId: resolved.account.accountId,
                    toAccountId: xenCasinoAccountId,
                    amount: wager.toFixed(10),
                    key: debitKey,
                    note: `${SLUG}_wager`,
                });
                debitBalance = result.fromNewBalance;
            } catch (err) {
                if (err instanceof WeeabetsTransferError && err.status === 400) {
                    await XenCasinoRound.resolve(round._id);
                    return res.status(400).json({ status: false, message: "Insufficient balance" });
                }
                throw err; // ambiguous - leave round in place, the recovery sweep will retry
            }

            // Debit succeeded - the payout (if any) is what's left; an ambiguous failure
            // here also leaves the round in place rather than answering with a guess.
            const settled = await settleRound(round);
            await XenCasinoRound.resolve(round._id);
            await recordCasinoRoundPlayed(userId);

            return res.json({ status: true, data: { ...conditions, trajectory, balance: settled.balance ?? debitBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });
};
