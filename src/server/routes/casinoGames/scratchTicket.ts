/**
 * Scratch Ticket — 10 lines, each with 3 hidden symbols and a fixed, visible prize. A line
 * wins if its 3 symbols all match. Unlike a flat "same odds, different label" ticket, each
 * line draws from its own symbol pool size — a bigger pool means matching 3-of-a-kind is
 * genuinely rarer, not just differently labeled, mirroring how real scratch-off tickets
 * work (per OLG/Wizard-of-Odds research: overall odds of winning ANY prize sit around
 * 1-in-3 to 1-in-5, heavily dominated by small prizes, with progressively rarer big tiers).
 * Pool sizes are capped at 16 so a small, fixed set of emoji covers every tier - smaller
 * (easier) pools only draw from the common fruit symbols; only the rarer, bigger-pool
 * tiers reach into the special ones at the end of MASTER_SYMBOLS.
 *
 * Also unlike Crash/Slots (90% RTP): real retail scratch tickets run notably worse than
 * casino games (commonly ~50-65%), so this one is authentically a worse-value game rather
 * than force-fit to match the others - see the LINE_TIERS table below for the exact,
 * computed (not eyeballed) math. This config block is the template for future scratch
 * variants with different odds.
 */
import express = require("express");
import { authenticateToken } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/AuthenticatedRequest";
const { User } = require("../../models/user");
const crypto = require("crypto");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../../utils/weeabetsClient";

interface LineTier {
    prizeMultiplier: number;
    poolSize: number; // this line's 3 symbols are drawn uniformly from MASTER_SYMBOLS[0..poolSize)
}

// RTP ≈ 75.9%, P(at least one winning line) ≈ 34.3% (~1 in 2.9), top prize 1-in-256.
const LINE_TIERS: LineTier[] = [
    { prizeMultiplier: 0.3, poolSize: 3 },
    { prizeMultiplier: 0.3, poolSize: 3 },
    { prizeMultiplier: 0.5, poolSize: 4 },
    { prizeMultiplier: 1, poolSize: 5 },
    { prizeMultiplier: 1.5, poolSize: 6 },
    { prizeMultiplier: 3, poolSize: 7 },
    { prizeMultiplier: 6, poolSize: 9 },
    { prizeMultiplier: 12, poolSize: 11 },
    { prizeMultiplier: 24, poolSize: 13 },
    { prizeMultiplier: 52, poolSize: 16 },
];

function matchProbability(tier: LineTier): number {
    return 1 / (tier.poolSize * tier.poolSize);
}

const RTP = LINE_TIERS.reduce((sum, t) => sum + matchProbability(t) * t.prizeMultiplier, 0);
const PROBABILITY_AT_LEAST_ONE_WIN = 1 - LINE_TIERS.reduce((product, t) => product * (1 - matchProbability(t)), 1);

interface TicketLine {
    symbols: string[];
    prizeMultiplier: number;
    poolSize: number;
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

// Ordered common -> special so smaller (easier) pools only draw from the plain fruit
// symbols, and only the rarer, bigger-pool tiers reach the bell/diamond/star/crown at the
// end - exactly 16 entries, covering the largest LINE_TIERS pool size with none to spare.
const MASTER_SYMBOLS = [
    "🍒", "🍋", "🍇", "🍉", "🍓", "🍑", "🍍", "🥝",
    "🍌", "🥥", "🍏", "🍊", "🔔", "💎", "⭐", "👑",
];

function drawLineSymbols(poolSize: number): string[] {
    return Array.from({ length: 3 }, () => MASTER_SYMBOLS[crypto.randomInt(0, poolSize)]);
}

function generateTicket(): TicketLine[] {
    return shuffled(LINE_TIERS).map((tier) => {
        const symbols = drawLineSymbols(tier.poolSize);
        const won = symbols.every((s) => s === symbols[0]);
        return { symbols, prizeMultiplier: tier.prizeMultiplier, poolSize: tier.poolSize, won };
    });
}

module.exports = function (app: express.Application) {

    app.get("/api/casino/games/scratch/odds", authenticateToken, function (_req: express.Request, res: express.Response) {
        return res.json({
            status: true,
            data: {
                lineCount: LINE_TIERS.length,
                tiers: [...LINE_TIERS]
                    .sort((a, b) => a.prizeMultiplier - b.prizeMultiplier)
                    .map((t) => ({
                        prizeMultiplier: t.prizeMultiplier,
                        poolSize: t.poolSize,
                        probability: matchProbability(t),
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
