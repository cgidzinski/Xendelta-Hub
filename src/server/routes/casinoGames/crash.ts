/**
 * Crash — simple per-player round. The wager is debited the moment a round starts, not at
 * cashout - without that, a player who's about to lose could simply abandon the page
 * instead of cashing out, and since nothing else would move money, they'd walk away having
 * paid nothing. The round itself is a durable `XenCasinoRound` document (not just an
 * in-memory map): the server draws a secret crash point at start, persists
 * `{wager, conditions: {crashPoint}}`, and only the server ever computes the multiplier
 * from its own recorded elapsed time - no client-submitted multiplier is ever trusted, and
 * a server restart mid-round loses nothing since the round survives in the database.
 *
 * crashPoint = (1 - houseEdge) / (1 - r), r uniform in [0,1) via crypto RNG. This formula
 * has the property that expected return is exactly (1 - houseEdge) no matter what
 * multiplier a player commits to cashing out at - a single honest number for "the odds."
 *
 * This is the template for future "start now, resolve later" games (e.g. Mines): debit at
 * start into a XenCasinoRound row, pay the gross amount out only on a win, delete the row
 * either way once resolved.
 */
import express = require("express");
import { authenticateToken } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/AuthenticatedRequest";
const { User } = require("../../models/user");
const { XenCasino, XenCasinoRound } = require("../../models/xenCasino");
const crypto = require("crypto");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../../utils/weeabetsClient";

const HOUSE_EDGE = 0.01; // 1%
const DOUBLING_SECONDS = 3;
const GROWTH_PER_SECOND = Math.log(2) / DOUBLING_SECONDS;
const GAME_KEY = "crash";

// A round's wager is already taken the moment it exists, so an abandoned round costs
// nothing further to clean up - this is pure garbage collection, not a money operation.
const ROUND_TTL_MS = 5 * 60 * 1000;
setInterval(() => {
    XenCasinoRound.deleteStale(GAME_KEY, ROUND_TTL_MS).catch((err: Error) => {
        console.error("crash: stale round sweep failed", err);
    });
}, 60 * 1000).unref();

function drawCrashPoint(): number {
    const r = crypto.randomInt(0, 1_000_000_000) / 1_000_000_000; // uniform [0,1)
    return (1 - HOUSE_EDGE) / (1 - r);
}

function multiplierAt(elapsedMs: number): number {
    return Math.exp(GROWTH_PER_SECOND * (elapsedMs / 1000));
}

module.exports = function (app: express.Application) {

    app.get("/api/casino/games/crash/odds", authenticateToken, function (_req: express.Request, res: express.Response) {
        return res.json({
            status: true,
            data: {
                houseEdge: HOUSE_EDGE,
                growthPerSecond: GROWTH_PER_SECOND,
                referenceOdds: [2, 5, 10, 25].map((m) => ({ multiplier: m, probability: (1 - HOUSE_EDGE) / m })),
            },
        });
    });

    app.get("/api/casino/games/crash/recent", authenticateToken, async function (_req: express.Request, res: express.Response) {
        const state = await XenCasino.getSingleton();
        return res.json({ status: true, data: { recentRounds: state.crashRecentRounds } });
    });

    app.post("/api/casino/games/crash/start", authenticateToken, async function (req: express.Request, res: express.Response) {
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

            const crashPoint = drawCrashPoint();
            const debitKey = `xendelta-crash-start-${userId}-${crypto.randomUUID()}`;

            let round;
            try {
                round = await XenCasinoRound.startRound({
                    game: GAME_KEY,
                    userId,
                    wager,
                    debitKey,
                    conditions: { crashPoint },
                });
            } catch (err) {
                if ((err as { code?: number }).code === 11000) {
                    return res.status(400).json({ status: false, message: "You already have an active Crash round" });
                }
                throw err;
            }

            const xenCasinoAccountId = await getXenCasinoAccountId();
            try {
                const result = await transfer({
                    fromAccountId: resolved.account.accountId,
                    toAccountId: xenCasinoAccountId,
                    amount: wager.toFixed(10),
                    key: debitKey,
                    note: "crash_wager",
                });
                return res.json({
                    status: true,
                    data: { startedAt: round.startedAt.getTime(), growthPerSecond: GROWTH_PER_SECOND, balance: result.fromNewBalance },
                });
            } catch (err) {
                // Only roll back the round if the transfer definitely never happened (bad
                // balance). Any other error is ambiguous - it may have gone through server
                // side even though this request errored - so the round (and its debitKey)
                // stays in place; a retry replays the same idempotent transfer safely
                // instead of risking a silent double-charge or an untracked debit.
                if (err instanceof WeeabetsTransferError && err.status === 400) {
                    await XenCasinoRound.resolve(round._id);
                    return res.status(400).json({ status: false, message: "Insufficient balance" });
                }
                throw err;
            }
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    app.post("/api/casino/games/crash/cashout", authenticateToken, async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);

        const round = await XenCasinoRound.findActive(GAME_KEY, userId);
        if (!round) {
            return res.status(404).json({ status: false, message: "No active round" });
        }

        const { crashPoint } = round.conditions as { crashPoint: number };
        const actualMultiplier = multiplierAt(Date.now() - round.startedAt.getTime());
        const won = actualMultiplier < crashPoint;
        const settledMultiplier = won ? actualMultiplier : crashPoint;

        const user = await User.findById(userId).exec();
        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }

        try {
            const resolved = await resolveUserAccount(user);
            if (!resolved.linked || !resolved.account) {
                return res.status(400).json({ status: false, message: "Link your Discord account to play" });
            }

            let balance: string;
            if (won) {
                const xenCasinoAccountId = await getXenCasinoAccountId();
                const payout = round.wager * actualMultiplier;
                const result = await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: resolved.account.accountId,
                    amount: payout.toFixed(10),
                    key: `xendelta-crash-cashout-${round._id}`,
                    note: "crash_win",
                });
                balance = result.toNewBalance;
            } else {
                balance = resolved.account.balance;
            }

            await XenCasinoRound.resolve(round._id);
            await XenCasino.recordCrashRound(crashPoint);

            return res.json({ status: true, data: { won, multiplier: settledMultiplier, crashPoint, balance } });
        } catch (err) {
            // Ambiguous transfer failures leave the round in place - the player (or a retry)
            // can call cashout again; the payout transfer's key makes that safe to replay.
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });
};
