/**
 * Scratch Ticket — a single weighted draw from a prize-tier table. The "3 symbols" reveal
 * is purely display flavor on top of a pre-determined tier (the same way real scratch-off
 * lotteries work: the prize tier is fixed before the ticket is printed, and the scratched
 * symbols just have to be consistent with it) — that keeps the math a plain categorical
 * distribution instead of independent-cell matching, so it's exactly, trivially verifiable.
 *
 * Solved for a 90% RTP (10% house edge, same target as Slots):
 *   0.7136 * 0 + 0.22 * 2 + 0.06 * 5 + 0.006 * 20 + 0.0004 * 100 = 0.90
 * Probabilities sum to exactly 1 - verified, not eyeballed (see commit history).
 */
import express = require("express");
import { authenticateToken } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/AuthenticatedRequest";
const { User } = require("../../models/user");
const crypto = require("crypto");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../../utils/weeabetsClient";

interface PrizeTier {
    label: string;
    multiplier: number;
    probability: number;
    symbol: string | null; // null for the loss tier
}

// Ordered highest to lowest, "loss" last on purpose: if float rounding ever let the
// cumulative-probability walk in drawTier() fall through without matching, it falls back
// to the last tier - loss - the safe direction, never an accidental win.
const PRIZE_TIERS: PrizeTier[] = [
    { label: "100x", multiplier: 100, probability: 0.0004, symbol: "👑" },
    { label: "20x", multiplier: 20, probability: 0.006, symbol: "💵" },
    { label: "5x", multiplier: 5, probability: 0.06, symbol: "💰" },
    { label: "2x", multiplier: 2, probability: 0.22, symbol: "🍀" },
    { label: "loss", multiplier: 0, probability: 0.7136, symbol: null },
];
const RTP = PRIZE_TIERS.reduce((sum, t) => sum + t.probability * t.multiplier, 0);

const ALL_SYMBOLS = ["👑", "💵", "💰", "🍀", "⭐"];
const PROBABILITY_SCALE = 1_000_000;

function drawTier(): PrizeTier {
    const roll = crypto.randomInt(0, PROBABILITY_SCALE);
    let cumulative = 0;
    for (const tier of PRIZE_TIERS) {
        cumulative += tier.probability * PROBABILITY_SCALE;
        if (roll < cumulative) {
            return tier;
        }
    }
    return PRIZE_TIERS[PRIZE_TIERS.length - 1];
}

function shuffledSymbols(): string[] {
    const symbols = [...ALL_SYMBOLS];
    for (let i = symbols.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [symbols[i], symbols[j]] = [symbols[j], symbols[i]];
    }
    return symbols;
}

function revealFor(tier: PrizeTier): [string, string, string] {
    if (tier.symbol) {
        return [tier.symbol, tier.symbol, tier.symbol];
    }
    const [a, b, c] = shuffledSymbols();
    return [a, b, c];
}

module.exports = function (app: express.Application) {

    app.get("/api/casino/games/scratch/odds", authenticateToken, function (_req: express.Request, res: express.Response) {
        return res.json({
            status: true,
            data: {
                paytable: PRIZE_TIERS.filter((t) => t.label !== "loss").map((t) => ({
                    label: t.label,
                    probability: t.probability,
                    multiplier: t.multiplier,
                })),
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

            const tier = drawTier();
            const reveal = revealFor(tier);
            const xenCasinoAccountId = await getXenCasinoAccountId();
            const key = `xendelta-scratch-${userId}-${crypto.randomUUID()}`;

            const netWin = wager * (tier.multiplier - 1);
            let balance: string;
            let payout = 0;

            if (netWin > 0) {
                payout = netWin;
                const result = await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: resolved.account.accountId,
                    amount: netWin.toFixed(10),
                    key,
                    note: `scratch_${tier.label}`,
                });
                balance = result.toNewBalance;
            } else if (netWin < 0) {
                const result = await transfer({
                    fromAccountId: resolved.account.accountId,
                    toAccountId: xenCasinoAccountId,
                    amount: Math.abs(netWin).toFixed(10),
                    key,
                    note: "scratch_loss",
                });
                balance = result.fromNewBalance;
            } else {
                balance = resolved.account.balance;
            }

            return res.json({
                status: true,
                data: { reveal, tier: tier.label, multiplier: tier.multiplier, payout, balance },
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
