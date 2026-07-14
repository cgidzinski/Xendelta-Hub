/**
 * Crash — simple per-player round. The server draws a secret crash point when a round
 * starts; the client animates a multiplier climbing locally using the same public growth
 * formula, but never learns the crash point. The only authoritative check happens at
 * cashout: the server derives the multiplier itself from server-recorded elapsed time and
 * compares it to the crash point - no client-submitted multiplier is ever trusted.
 *
 * crashPoint = (1 - houseEdge) / (1 - r), r uniform in [0,1) via crypto RNG. This formula
 * has the property that expected return is exactly (1 - houseEdge) no matter what
 * multiplier a player commits to cashing out at - a single honest number for "the odds."
 */
import express = require("express");
import { authenticateToken } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/AuthenticatedRequest";
const { User } = require("../../models/user");
const { XenCasino } = require("../../models/xenCasino");
const crypto = require("crypto");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../../utils/weeabetsClient";

const HOUSE_EDGE = 0.01; // 1%
const DOUBLING_SECONDS = 3;
const GROWTH_PER_SECOND = Math.log(2) / DOUBLING_SECONDS;

function drawCrashPoint(): number {
    const r = crypto.randomInt(0, 1_000_000_000) / 1_000_000_000; // uniform [0,1)
    return (1 - HOUSE_EDGE) / (1 - r);
}

function multiplierAt(elapsedMs: number): number {
    return Math.exp(GROWTH_PER_SECOND * (elapsedMs / 1000));
}

interface ActiveRound {
    userId: string;
    wager: number;
    crashPoint: number;
    startedAt: number;
}

const activeRounds = new Map<string, ActiveRound>();

// Nothing moves until cashout, so an abandoned round risks no money - this sweep is
// purely to stop the in-memory map growing forever.
const ROUND_TTL_MS = 5 * 60 * 1000;
setInterval(() => {
    const cutoff = Date.now() - ROUND_TTL_MS;
    for (const [roundId, round] of activeRounds) {
        if (round.startedAt < cutoff) {
            activeRounds.delete(roundId);
        }
    }
}, 60 * 1000).unref();

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

        const userId = (req as AuthenticatedRequest).user!._id;
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

            const roundId = crypto.randomUUID();
            const startedAt = Date.now();
            const crashPoint = drawCrashPoint();
            activeRounds.set(roundId, { userId: String(userId), wager, crashPoint, startedAt });

            return res.json({ status: true, data: { roundId, startedAt, growthPerSecond: GROWTH_PER_SECOND } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    app.post("/api/casino/games/crash/cashout", authenticateToken, async function (req: express.Request, res: express.Response) {
        const { roundId } = req.body as { roundId?: string };
        const userId = String((req as AuthenticatedRequest).user!._id);

        const round = roundId ? activeRounds.get(roundId) : undefined;
        if (!round || round.userId !== userId) {
            return res.status(404).json({ status: false, message: "Round not found" });
        }
        activeRounds.delete(roundId as string);

        const actualMultiplier = multiplierAt(Date.now() - round.startedAt);
        const won = actualMultiplier < round.crashPoint;
        const settledMultiplier = won ? actualMultiplier : round.crashPoint;

        const user = await User.findById(userId).exec();
        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }

        try {
            const resolved = await resolveUserAccount(user);
            if (!resolved.linked || !resolved.account) {
                return res.status(400).json({ status: false, message: "Link your Discord account to play" });
            }
            const xenCasinoAccountId = await getXenCasinoAccountId();
            const key = `xendelta-crash-${roundId}`;

            let balance: string;
            if (won) {
                const netWin = round.wager * (actualMultiplier - 1);
                if (netWin > 0) {
                    const result = await transfer({
                        fromAccountId: xenCasinoAccountId,
                        toAccountId: resolved.account.accountId,
                        amount: netWin.toFixed(10),
                        key,
                        note: "crash_win",
                    });
                    balance = result.toNewBalance;
                } else {
                    balance = resolved.account.balance;
                }
            } else {
                const result = await transfer({
                    fromAccountId: resolved.account.accountId,
                    toAccountId: xenCasinoAccountId,
                    amount: round.wager.toFixed(10),
                    key,
                    note: "crash_loss",
                });
                balance = result.fromNewBalance;
            }

            await XenCasino.recordCrashRound(round.crashPoint);

            return res.json({
                status: true,
                data: { won, multiplier: settledMultiplier, crashPoint: round.crashPoint, balance },
            });
        } catch (err) {
            if (err instanceof WeeabetsTransferError && err.status === 400) {
                return res.status(400).json({ status: false, message: "Insufficient balance to settle" });
            }
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });
};
