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
 *
 * Same debit-at-start pattern used across every game: the reels are drawn and the payout
 * is fully decided *before* any money moves, then persisted into a XenCasinoRound
 * alongside the wager debit's idempotency key. The wager is debited first; only then is
 * the (already decided) payout transferred. If the process dies between those two
 * transfers, the round survives in the database and a periodic sweep replays both
 * idempotent transfers to finish the job - a spin's outcome is never re-drawn, only ever
 * completed.
 */
import express = require("express");
import { authenticateToken } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/AuthenticatedRequest";
const { User } = require("../../models/user");
const { XenCasino, XenCasinoRound } = require("../../models/xenCasino");
const crypto = require("crypto");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../../utils/weeabetsClient";

type Symbol = "cherry" | "lemon" | "bell" | "diamond" | "seven";

interface SpinConditions {
    reels: [Symbol, Symbol, Symbol];
    multiplier: number;
    jackpot: boolean;
    payout: number;
}

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
const GAME_KEY = "slots";

// A round's outcome (and thus its payout) is fully decided before it's even persisted, so
// "stale" only ever means "the process died mid-settlement" - the sweep below finishes it.
const ROUND_TTL_MS = 30 * 1000;
setInterval(() => {
    recoverStaleRounds().catch((err: Error) => {
        console.error("slots: stale round recovery failed", err);
    });
}, 60 * 1000).unref();

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

// Pays out the round's already-decided payout (if any) and updates the jackpot pool.
// Shared by the live spin handler and the recovery sweep so both settle a round exactly
// the same way.
async function settleRound(round: { _id: string; wager: number; playerAccountId: number; conditions: SpinConditions }): Promise<{ balance?: string }> {
    const { jackpot, payout } = round.conditions;

    let balance: string | undefined;
    if (payout > 0) {
        const xenCasinoAccountId = await getXenCasinoAccountId();
        const result = await transfer({
            fromAccountId: xenCasinoAccountId,
            toAccountId: round.playerAccountId,
            amount: payout.toFixed(10),
            key: `xendelta-slots-payout-${round._id}`,
            note: jackpot ? "slots_jackpot" : "slots_win",
        });
        balance = result.toNewBalance;
    }

    if (jackpot) {
        await XenCasino.resetJackpotPool();
    } else {
        await XenCasino.incrementJackpotPool(round.wager * JACKPOT_CONTRIBUTION_RATE);
    }

    return { balance };
}

async function recoverStaleRounds(): Promise<void> {
    const stale = await XenCasinoRound.sweepStale(GAME_KEY, ROUND_TTL_MS);
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
                note: "slots_wager",
            });
            await settleRound(round);
            await XenCasinoRound.resolve(round._id);
        } catch (err) {
            console.error(`slots: failed to recover stale round ${round._id}`, err);
        }
    }
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

            const reels = spinReels();
            const { multiplier, jackpot } = resultFor(reels);
            const payout = jackpot ? (await XenCasino.getSingleton()).slotsJackpotPool : wager * multiplier;

            const debitKey = `xendelta-slots-start-${userId}-${crypto.randomUUID()}`;
            let round;
            try {
                round = await XenCasinoRound.startRound({
                    game: GAME_KEY,
                    userId,
                    wager,
                    debitKey,
                    playerAccountId: resolved.account.accountId,
                    conditions: { reels, multiplier, jackpot, payout } as SpinConditions,
                });
            } catch (err) {
                if ((err as { code?: number }).code === 11000) {
                    return res.status(400).json({ status: false, message: "You already have an active Slots round" });
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
                    note: "slots_wager",
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

            return res.json({ status: true, data: { reels, multiplier, jackpot, payout, balance: settled.balance ?? debitBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });
};
