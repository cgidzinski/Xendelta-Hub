/**
 * Scratch Ticket — a real scratch-off layout: 10 lines, each with 3 hidden symbols and a
 * fixed, visible prize. A line wins if its 3 symbols all match (any symbol). Every line
 * shares the same match mechanic/probability; only the printed prize differs per line
 * (exactly like a real ticket - the prize is known upfront, only whether you matched it
 * is hidden), and the 10 prize values are shuffled into random line positions per ticket.
 *
 * This whole config block (LINE_COUNT / SYMBOL_POOL / LINE_PRIZE_MULTIPLIERS) is meant to
 * be copied and re-tuned for future scratch variants with different odds - it's kept as
 * one small, self-contained object rather than spread across the file on purpose.
 *
 * Math (verified, not eyeballed - see commit history for the derivation):
 *   5 equally-weighted symbols -> match probability per line = 5 * (1/5)^3 = 1/25 = 4%
 *   Prize multipliers [0.5, 0.5, 1, 1, 1, 2, 2, 3, 5, 6.5] sum to 22.5
 *   RTP = matchProbability * sum(prizes) = 0.04 * 22.5 = 0.90 (90%, matching Slots)
 *   P(at least one winning line per ticket) = 1 - (1 - 0.04)^10 ≈ 33.5%
 */
import express = require("express");
import { authenticateToken } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/AuthenticatedRequest";
const { User } = require("../../models/user");
const crypto = require("crypto");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../../utils/weeabetsClient";

const LINE_COUNT = 10;
const SYMBOLS_PER_LINE = 3;
const SYMBOL_POOL = ["🍀", "💰", "💵", "👑", "⭐"];
const LINE_PRIZE_MULTIPLIERS = [0.5, 0.5, 1, 1, 1, 2, 2, 3, 5, 6.5];

const MATCH_PROBABILITY = 1 / (SYMBOL_POOL.length * SYMBOL_POOL.length);
const PRIZE_POOL_SUM = LINE_PRIZE_MULTIPLIERS.reduce((sum, m) => sum + m, 0);
const RTP = MATCH_PROBABILITY * PRIZE_POOL_SUM;

interface TicketLine {
    symbols: string[];
    prizeMultiplier: number;
    won: boolean;
}

function shuffled<T>(items: T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function drawLineSymbols(): string[] {
    return Array.from({ length: SYMBOLS_PER_LINE }, () => SYMBOL_POOL[crypto.randomInt(0, SYMBOL_POOL.length)]);
}

function generateTicket(): TicketLine[] {
    const prizes = shuffled(LINE_PRIZE_MULTIPLIERS);
    return prizes.map((prizeMultiplier) => {
        const symbols = drawLineSymbols();
        const won = symbols.every((s) => s === symbols[0]);
        return { symbols, prizeMultiplier, won };
    });
}

module.exports = function (app: express.Application) {

    app.get("/api/casino/games/scratch/odds", authenticateToken, function (_req: express.Request, res: express.Response) {
        return res.json({
            status: true,
            data: {
                lineCount: LINE_COUNT,
                matchProbability: MATCH_PROBABILITY,
                linePrizeMultipliers: [...LINE_PRIZE_MULTIPLIERS].sort((a, b) => a - b),
                probabilityAtLeastOneWin: 1 - Math.pow(1 - MATCH_PROBABILITY, LINE_COUNT),
                rtp: RTP,
            },
        });
    });

    app.post("/api/casino/games/scratch/play", authenticateToken, async function (req: express.Request, res: express.Response) {
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

            const lines = generateTicket();
            const totalMultiplier = lines.reduce((sum, line) => sum + (line.won ? line.prizeMultiplier : 0), 0);
            const totalPayout = wager * totalMultiplier;
            const net = totalPayout - wager;

            const xenCasinoAccountId = await getXenCasinoAccountId();
            const key = `xendelta-scratch-${userId}-${crypto.randomUUID()}`;

            let balance: string;
            if (net > 0) {
                const result = await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: resolved.account.accountId,
                    amount: net.toFixed(10),
                    key,
                    note: "scratch_win",
                });
                balance = result.toNewBalance;
            } else if (net < 0) {
                const result = await transfer({
                    fromAccountId: resolved.account.accountId,
                    toAccountId: xenCasinoAccountId,
                    amount: Math.abs(net).toFixed(10),
                    key,
                    note: "scratch_loss",
                });
                balance = result.fromNewBalance;
            } else {
                balance = resolved.account.balance;
            }

            return res.json({ status: true, data: { lines, totalPayout, balance } });
        } catch (err) {
            if (err instanceof WeeabetsTransferError && err.status === 400) {
                return res.status(400).json({ status: false, message: "Insufficient balance to settle" });
            }
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });
};
