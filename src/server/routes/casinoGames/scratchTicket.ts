/**
 * Scratch Ticket — 10 lines, each with TWO separate hidden zones: 3 symbol boxes and one
 * prize box. The symbols only decide whether a line wins at all (3-of-a-kind, any symbol -
 * which specific symbol appears is irrelevant to the payout); the prize box is a completely
 * separate, pre-assigned value, only paid out if the symbol zone matched. Same match
 * probability on every line (5 equal-weight symbols -> 4%); only the hidden prize amount
 * differs per line, shuffled into random positions per ticket.
 *
 * Math (verified, not eyeballed): match probability per line = 5 * (1/5)^3 = 1/25 = 4%.
 * Prize amounts [0.5, 0.5, 1, 1, 1, 1.5, 2, 3, 4, 5] sum to 19.5, so RTP = 0.04 * 19.5 =
 * 0.78 (78%) - still authentically worse than Crash/Slots (90%), consistent with real
 * retail scratch tickets. P(at least one winning line of 10) = 1 - 0.96^10 ≈ 33.5%
 * (~1-in-3, matching OLG's real "1-in-3 to 1-in-5" range).
 */
import express = require("express");
import { authenticateToken } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/AuthenticatedRequest";
const { User } = require("../../models/user");
const crypto = require("crypto");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../../utils/weeabetsClient";

const SYMBOL_POOL = ["🍒", "🍋", "🔔", "💎", "⭐"];
const LINE_PRIZES = [0.5, 0.5, 1, 1, 1, 1.5, 2, 3, 4, 5]; // sums to 19.5
const LINE_COUNT = LINE_PRIZES.length;

const MATCH_PROBABILITY = 1 / (SYMBOL_POOL.length * SYMBOL_POOL.length);
const PRIZE_POOL_SUM = LINE_PRIZES.reduce((sum, p) => sum + p, 0);
const RTP = MATCH_PROBABILITY * PRIZE_POOL_SUM;
const PROBABILITY_AT_LEAST_ONE_WIN = 1 - Math.pow(1 - MATCH_PROBABILITY, LINE_COUNT);

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
    return Array.from({ length: 3 }, () => SYMBOL_POOL[crypto.randomInt(0, SYMBOL_POOL.length)]);
}

function generateTicket(): TicketLine[] {
    return shuffled(LINE_PRIZES).map((prizeMultiplier) => {
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
                linePrizes: [...LINE_PRIZES].sort((a, b) => a - b),
                probabilityAtLeastOneWin: PROBABILITY_AT_LEAST_ONE_WIN,
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
