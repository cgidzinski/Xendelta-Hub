/**
 * Scratch Ticket — 10 lines, each with 3 hidden symbols. A line wins if its 3 symbols all
 * match, and the prize is whatever that specific symbol is worth - the symbol IS the
 * prize, not decoration on top of a pre-set line prize. Every line draws from the same
 * shared weighted pool (same principle as Slots): rarer symbols are both harder to match
 * and worth more. Neither the symbols nor the prize are known until scratched.
 *
 * Math (computed, not eyeballed): per-line win probability ≈3.16% (~1-in-31.7); across 10
 * independent lines, P(at least one winning line) ≈27.45% (~1-in-3.64), matching OLG's
 * real-world "1-in-3 to 1-in-5" range. RTP ≈79.1% - still authentically worse than
 * Crash/Slots (90%), consistent with real retail scratch tickets running worse than casino
 * games. This SYMBOL_TABLE is the template for future scratch variants with different odds.
 */
import express = require("express");
import { authenticateToken } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/AuthenticatedRequest";
const { User } = require("../../models/user");
const crypto = require("crypto");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../../utils/weeabetsClient";

interface SymbolEntry {
    symbol: string;
    weight: number;
    prizeMultiplier: number;
}

const SYMBOL_TABLE: SymbolEntry[] = [
    { symbol: "🍒", weight: 25, prizeMultiplier: 1 },
    { symbol: "🍋", weight: 20, prizeMultiplier: 2 },
    { symbol: "🍇", weight: 16, prizeMultiplier: 3 },
    { symbol: "🍉", weight: 13, prizeMultiplier: 5 },
    { symbol: "🔔", weight: 10, prizeMultiplier: 8 },
    { symbol: "🍀", weight: 8, prizeMultiplier: 15 },
    { symbol: "💎", weight: 5, prizeMultiplier: 40 },
    { symbol: "👑", weight: 3, prizeMultiplier: 130 },
];
const TOTAL_WEIGHT = SYMBOL_TABLE.reduce((sum, s) => sum + s.weight, 0); // 100

function matchProbability(entry: SymbolEntry): number {
    return Math.pow(entry.weight / TOTAL_WEIGHT, 3);
}

const LINE_WIN_PROBABILITY = SYMBOL_TABLE.reduce((sum, s) => sum + matchProbability(s), 0);
const LINE_COUNT = 10;
const RTP = LINE_COUNT * SYMBOL_TABLE.reduce((sum, s) => sum + matchProbability(s) * s.prizeMultiplier, 0);
const PROBABILITY_AT_LEAST_ONE_WIN = 1 - Math.pow(1 - LINE_WIN_PROBABILITY, LINE_COUNT);

interface TicketLine {
    symbols: string[];
    prizeMultiplier: number;
    won: boolean;
}

function drawSymbol(): string {
    const roll = crypto.randomInt(0, TOTAL_WEIGHT);
    let cumulative = 0;
    for (const entry of SYMBOL_TABLE) {
        cumulative += entry.weight;
        if (roll < cumulative) {
            return entry.symbol;
        }
    }
    return SYMBOL_TABLE[SYMBOL_TABLE.length - 1].symbol;
}

function drawLineSymbols(): string[] {
    return Array.from({ length: 3 }, () => drawSymbol());
}

function generateTicket(): TicketLine[] {
    return Array.from({ length: LINE_COUNT }, () => {
        const symbols = drawLineSymbols();
        const won = symbols.every((s) => s === symbols[0]);
        const prizeMultiplier = won ? (SYMBOL_TABLE.find((e) => e.symbol === symbols[0])?.prizeMultiplier ?? 0) : 0;
        return { symbols, prizeMultiplier, won };
    });
}

module.exports = function (app: express.Application) {

    app.get("/api/casino/games/scratch/odds", authenticateToken, function (_req: express.Request, res: express.Response) {
        return res.json({
            status: true,
            data: {
                lineCount: LINE_COUNT,
                symbols: SYMBOL_TABLE.map((s) => ({
                    symbol: s.symbol,
                    prizeMultiplier: s.prizeMultiplier,
                    probability: matchProbability(s),
                })),
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
