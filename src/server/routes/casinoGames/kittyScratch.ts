/**
 * Kitty Scratch — 4 independent row draws plus a real multiplier on the total. Each row is
 * just a repeat of the same simple "one weighted draw, possibly $0" mechanic - no symbol
 * pools, no match combinatorics: a row's "3 matching symbols" is purely a client-side costume
 * for its real `won` flag (drawn amount > 0), never the other way around. Price is fixed and
 * server-owned; `/play` never reads a client-supplied wager. The whole payout (all 4 rows +
 * the multiplier) is drawn and fully decided *before* any money moves, then persisted into a
 * XenCasinoRound alongside the wager debit's idempotency key — same debit-at-start pattern
 * used across every game in this app. If the process dies mid-settlement, the round survives
 * in the database and a periodic sweep replays both idempotent transfers to finish the job;
 * the outcome is never re-drawn, only ever completed.
 */
import express = require("express");
import { authenticateToken } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/AuthenticatedRequest";
const { User } = require("../../models/user");
const { XenCasinoRound } = require("../../models/xenCasino");
const mongoose = require("mongoose");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../../utils/weeabetsClient";
import { recordCasinoRoundPlayed } from "../../utils/dailyQuest";
import { requireGameEnabled } from "../../utils/casinoStatus";
import { PrizeWeight, drawPrize, prizeDistribution } from "./prizeWeights";
import { scheduleStaleRoundSweep } from "./staleRoundRecovery";

const SLUG = "kitty-scratch";
const PRICE = 5000;
const ROW_COUNT = 4; // matches the background art's 4 boxes

// Each of the 4 rows independently draws one of these amounts (0 = that row doesn't win).
// Nicer round-number tier values (x10 pass over the previous 140/280/700/1400/2800/7000/28000
// table), weights re-solved (nonzero-tier ratios kept at 500:300:150:60:20:5:1, only the $0
// weight re-solved) to land back on the same ~89.9% RTP this table was tuned to before.
// Per-row loss probability ~=81.7% (was 80% pre-rebalance - close enough that multi-row-win
// frequency stays in the same ballpark as the already-approved fix).
export const ROW_PRIZE_WEIGHTS: PrizeWeight[] = [
    { value: 0, weight: 4626 },
    { value: 1500, weight: 500 },
    { value: 3000, weight: 300 },
    { value: 8000, weight: 150 },
    { value: 15000, weight: 60 },
    { value: 30000, weight: 20 },
    { value: 80000, weight: 5 },
    { value: 300000, weight: 1 },
];

// Applied once to the sum of the 4 rows - independent of which rows won. Mostly 1x, a rare 5x.
export const MULTIPLIER_WEIGHTS: PrizeWeight[] = [
    { value: 1, weight: 800 },
    { value: 2, weight: 180 },
    { value: 5, weight: 20 },
];

// E[totalPayout] = ROW_COUNT * E[row draw] * E[multiplier] (independence) - solved so this
// lands at ~90% RTP; see kittyScratch rebalance notes for the exact weight derivation.
function rowExpectedValue(): number {
    const total = ROW_PRIZE_WEIGHTS.reduce((sum, w) => sum + w.weight, 0);
    return ROW_PRIZE_WEIGHTS.reduce((sum, w) => sum + w.value * w.weight, 0) / total;
}
function multiplierExpectedValue(): number {
    const total = MULTIPLIER_WEIGHTS.reduce((sum, w) => sum + w.weight, 0);
    return MULTIPLIER_WEIGHTS.reduce((sum, w) => sum + w.value * w.weight, 0) / total;
}
export function kittyScratchRtp(): number {
    return (ROW_COUNT * rowExpectedValue() * multiplierExpectedValue()) / PRICE;
}

interface RowResult {
    amount: number;
    won: boolean;
}

interface TicketConditions {
    rows: RowResult[];
    multiplier: number;
    basePayout: number;
    totalPayout: number;
}

export function generateRound(): TicketConditions {
    const rows: RowResult[] = Array.from({ length: ROW_COUNT }, () => {
        const amount = drawPrize(ROW_PRIZE_WEIGHTS);
        return { amount, won: amount > 0 };
    });
    const basePayout = rows.reduce((sum, r) => sum + r.amount, 0);
    const multiplier = drawPrize(MULTIPLIER_WEIGHTS);
    return { rows, multiplier, basePayout, totalPayout: basePayout * multiplier };
}

// A round's outcome (and thus its payout) is fully decided before it's even persisted, so
// "stale" only ever means "the process died mid-settlement" - the sweep below finishes it.
const ROUND_TTL_MS = 30 * 1000;

// Pays out the round's already-decided prize (if any). Shared by the live play handler and
// the recovery sweep so both settle a round exactly the same way.
async function settleRound(round: { _id: string; playerAccountId: number; conditions: TicketConditions }): Promise<{ balance?: string }> {
    const { totalPayout } = round.conditions;
    if (totalPayout <= 0) {
        return {};
    }
    const xenCasinoAccountId = await getXenCasinoAccountId();
    const result = await transfer({
        fromAccountId: xenCasinoAccountId,
        toAccountId: round.playerAccountId,
        amount: totalPayout.toFixed(10),
        key: `xendelta-${SLUG}-payout-${round._id}`,
        note: `${SLUG}_win`,
    });
    return { balance: result.toNewBalance };
}

scheduleStaleRoundSweep(SLUG, ROUND_TTL_MS, async (round) => {
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
    await recordCasinoRoundPlayed(round.userId, { game: SLUG, wager: round.wager, payout: round.conditions.totalPayout });
});

module.exports = function (app: express.Application) {

    app.get(`/api/casino/games/${SLUG}/odds`, authenticateToken, function (_req: express.Request, res: express.Response) {
        return res.json({
            status: true,
            data: {
                price: PRICE,
                rowCount: ROW_COUNT,
                rowDistribution: prizeDistribution(ROW_PRIZE_WEIGHTS),
                multiplierDistribution: prizeDistribution(MULTIPLIER_WEIGHTS),
                rtp: kittyScratchRtp(),
            },
        });
    });

    app.post(`/api/casino/games/${SLUG}/play`, authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const wager = PRICE;

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

            const conditions = generateRound();

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
                    return res.status(400).json({ status: false, message: "You already have an active round on this ticket" });
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
            await recordCasinoRoundPlayed(userId, { game: SLUG, wager, payout: conditions.totalPayout });

            return res.json({ status: true, data: { ...conditions, balance: settled.balance ?? debitBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });
};
