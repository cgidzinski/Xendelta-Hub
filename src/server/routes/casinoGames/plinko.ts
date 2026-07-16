/**
 * Plinko — a 12-row peg board, 13 landing slots (0-12). Unlike Slots' weighted symbol
 * draw, a slot's odds are never hand-weighted: the server flips 12 independent fair coins
 * (`crypto.randomInt(0, 2)` per row - left/right) and the *count* of "right" flips is the
 * landing slot, so probabilities fall out of the binomial distribution (`C(12,k)/4096`)
 * for free, and the exact flip sequence (`path`) is returned to the client so the ball's
 * bounce animation can just replay the server-decided path deterministically - no physics
 * engine needed (none is installed in this repo), the animation is a predetermined walk,
 * not a simulation.
 *
 * `MULTIPLIERS` is symmetric around the center (rare edges pay big, the common middle
 * pays sub-1x/breakeven) and solved so the binomial-probability-weighted average lands on
 * a documented target RTP - only the edge multiplier is solved; every other value is a
 * plain round number:
 *   0.5*924 + 2*(1*792 + 1.0*495 + 1.3*220 + 1.5*66 + 2*12) + 2*edge*1 = 0.95 * 4096
 *   => edge = 18.6
 *
 * Same debit-at-start pattern used across every game in this app: the path/slot/payout
 * are fully decided before any money moves, then persisted into a XenCasinoRound
 * alongside the wager debit's idempotency key, with a periodic sweep to finish the job if
 * the process dies mid-settlement.
 */
import express = require("express");
import { authenticateToken } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/AuthenticatedRequest";
const { User } = require("../../models/user");
const { XenCasinoRound } = require("../../models/xenCasino");
const crypto = require("crypto");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../../utils/weeabetsClient";
import { recordCasinoRoundPlayed } from "../../utils/dailyQuest";
import { ROWS, MULTIPLIERS, SLOT_WEIGHT, TOTAL_WEIGHT, plinkoRtp } from "./plinkoOdds";

const SLUG = "plinko";

interface PlinkoConditions {
    path: number[]; // 0=left, 1=right, one entry per row
    slot: number;
    multiplier: number;
    payout: number;
}

function dropBall(wager: number): PlinkoConditions {
    const path: number[] = [];
    let slot = 0;
    for (let i = 0; i < ROWS; i++) {
        const bit = crypto.randomInt(0, 2);
        path.push(bit);
        slot += bit;
    }
    const multiplier = MULTIPLIERS[slot];
    return { path, slot, multiplier, payout: wager * multiplier };
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
                paytable: SLOT_WEIGHT.map((weight, slot) => ({
                    slot,
                    probability: weight / TOTAL_WEIGHT,
                    multiplier: MULTIPLIERS[slot],
                })),
                rtp: plinkoRtp(),
            },
        });
    });

    app.post(`/api/casino/games/${SLUG}/drop`, authenticateToken, async function (req: express.Request, res: express.Response) {
        const { wager } = req.body as { wager?: number };
        if (typeof wager !== "number" || !Number.isFinite(wager) || wager <= 0) {
            return res.status(400).json({ status: false, message: "wager must be a positive number" });
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

            const conditions = dropBall(wager);

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

            return res.json({ status: true, data: { ...conditions, balance: settled.balance ?? debitBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });
};
