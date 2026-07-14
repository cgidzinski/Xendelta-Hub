/**
 * Slots — weighted 3-reel machine with a progressive jackpot. Paytable and jackpot
 * contribution rate were solved (not guessed) for a blended ~90% RTP:
 *   EV from the ordinary paytable alone = 86.51%
 *   + 3.5% of every wager routed into the jackpot pool (contribution rate ~= its own
 *     long-run RTP contribution, since every dollar contributed is eventually paid back
 *     out to whoever hits the jackpot)
 *   = 90.01% blended RTP, i.e. ~10% house edge.
 * The jackpot pool itself is local bookkeeping (an XenCasino.slotsJackpotPool counter) -
 * that wager money already sits in XenCasino's real Weeabets balance the moment it's
 * lost; only the jackpot *payout* triggers an actual transfer.
 */
import express = require("express");
import { authenticateToken } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/AuthenticatedRequest";
const { User } = require("../../models/user");
const { XenCasino } = require("../../models/xenCasino");
const crypto = require("crypto");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../../utils/weeabetsClient";

type Symbol = "cherry" | "lemon" | "bell" | "diamond" | "seven";

const SYMBOL_WEIGHTS: { symbol: Symbol; weight: number }[] = [
    { symbol: "cherry", weight: 40 },
    { symbol: "lemon", weight: 30 },
    { symbol: "bell", weight: 18 },
    { symbol: "diamond", weight: 9 },
    { symbol: "seven", weight: 3 },
];
const TOTAL_WEIGHT = SYMBOL_WEIGHTS.reduce((sum, s) => sum + s.weight, 0); // 100

const TRIPLE_MULTIPLIERS: Partial<Record<Symbol, number>> = {
    diamond: 36,
    bell: 14,
    lemon: 6,
    cherry: 3,
};
const TWO_CHERRY_MULTIPLIER = 1.4;
const JACKPOT_CONTRIBUTION_RATE = 0.035; // 3.5% of every non-jackpot wager
const BLENDED_RTP = 0.9001;

function weightOf(symbol: Symbol): number {
    return SYMBOL_WEIGHTS.find((s) => s.symbol === symbol)!.weight;
}

function drawSymbol(): Symbol {
    const roll = crypto.randomInt(0, TOTAL_WEIGHT);
    let cumulative = 0;
    for (const { symbol, weight } of SYMBOL_WEIGHTS) {
        cumulative += weight;
        if (roll < cumulative) {
            return symbol;
        }
    }
    return SYMBOL_WEIGHTS[SYMBOL_WEIGHTS.length - 1].symbol;
}

function spinReels(): [Symbol, Symbol, Symbol] {
    return [drawSymbol(), drawSymbol(), drawSymbol()];
}

function resultFor(reels: [Symbol, Symbol, Symbol]): { multiplier: number; jackpot: boolean } {
    const [a, b, c] = reels;
    if (a === "seven" && b === "seven" && c === "seven") {
        return { multiplier: 0, jackpot: true };
    }
    if (a === b && b === c) {
        return { multiplier: TRIPLE_MULTIPLIERS[a] ?? 0, jackpot: false };
    }
    const cherryCount = reels.filter((s) => s === "cherry").length;
    if (cherryCount === 2) {
        return { multiplier: TWO_CHERRY_MULTIPLIER, jackpot: false };
    }
    return { multiplier: 0, jackpot: false };
}

module.exports = function (app: express.Application) {

    app.get("/api/casino/games/slots/odds", authenticateToken, async function (_req: express.Request, res: express.Response) {
        const state = await XenCasino.getSingleton();
        const p = (symbol: Symbol) => weightOf(symbol) / TOTAL_WEIGHT;
        const pCherry = p("cherry");
        const paytable = [
            { combo: "7-7-7 (jackpot)", probability: Math.pow(p("seven"), 3) },
            { combo: "diamond-diamond-diamond", probability: Math.pow(p("diamond"), 3), multiplier: TRIPLE_MULTIPLIERS.diamond },
            { combo: "bell-bell-bell", probability: Math.pow(p("bell"), 3), multiplier: TRIPLE_MULTIPLIERS.bell },
            { combo: "lemon-lemon-lemon", probability: Math.pow(p("lemon"), 3), multiplier: TRIPLE_MULTIPLIERS.lemon },
            { combo: "cherry-cherry-cherry", probability: Math.pow(pCherry, 3), multiplier: TRIPLE_MULTIPLIERS.cherry },
            { combo: "cherry-cherry-*", probability: 3 * pCherry * pCherry * (1 - pCherry), multiplier: TWO_CHERRY_MULTIPLIER },
        ];
        return res.json({
            status: true,
            data: {
                paytable,
                jackpotContributionRate: JACKPOT_CONTRIBUTION_RATE,
                jackpotPool: state.slotsJackpotPool,
                rtp: BLENDED_RTP,
            },
        });
    });

    app.post("/api/casino/games/slots/spin", authenticateToken, async function (req: express.Request, res: express.Response) {
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

            const reels = spinReels();
            const { multiplier, jackpot } = resultFor(reels);
            const xenCasinoAccountId = await getXenCasinoAccountId();
            const key = `xendelta-slots-${userId}-${crypto.randomUUID()}`;

            let balance: string;
            let payout = 0;

            if (jackpot) {
                const state = await XenCasino.getSingleton();
                payout = state.slotsJackpotPool;
                const result = await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: resolved.account.accountId,
                    amount: payout.toFixed(10),
                    key,
                    note: "slots_jackpot",
                });
                balance = result.toNewBalance;
                await XenCasino.resetJackpotPool();
            } else {
                const netWin = wager * (multiplier - 1);
                if (netWin > 0) {
                    payout = netWin;
                    const result = await transfer({
                        fromAccountId: xenCasinoAccountId,
                        toAccountId: resolved.account.accountId,
                        amount: netWin.toFixed(10),
                        key,
                        note: "slots_win",
                    });
                    balance = result.toNewBalance;
                } else if (netWin < 0) {
                    const result = await transfer({
                        fromAccountId: resolved.account.accountId,
                        toAccountId: xenCasinoAccountId,
                        amount: Math.abs(netWin).toFixed(10),
                        key,
                        note: "slots_loss",
                    });
                    balance = result.fromNewBalance;
                } else {
                    balance = resolved.account.balance;
                }
                await XenCasino.incrementJackpotPool(wager * JACKPOT_CONTRIBUTION_RATE);
            }

            return res.json({ status: true, data: { reels, multiplier, jackpot, payout, balance } });
        } catch (err) {
            if (err instanceof WeeabetsTransferError && err.status === 400) {
                return res.status(400).json({ status: false, message: "Insufficient balance to settle" });
            }
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });
};
