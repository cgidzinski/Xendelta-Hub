/**
 * Scratch Ticket — 10 lines, each with TWO separate hidden zones: 3 symbol boxes and one
 * prize box. The symbols only decide whether a line wins at all (3-of-a-kind, any regular
 * symbol - which one is irrelevant to the payout); the prize box is a completely separate,
 * pre-assigned value, only paid out if the symbol zone matched. Same odds on every line;
 * only the hidden prize amount differs per line, shuffled into random positions per ticket.
 *
 * On top of that: a handful of rare "instant multiplier" symbols (2x/5x/10x/20x) can also
 * appear in any of the 3 boxes. Revealing even ONE of these auto-wins the line's prize at
 * that multiple - no need for the other 2 boxes to match anything. If more than one bonus
 * symbol somehow lands on the same line, the higher multiple applies.
 *
 * Math (exact enumeration over all 3-box draws, not eyeballed):
 *   Regular 3-of-a-kind: ~4.00% per line (~1-in-25)
 *   Any bonus symbol:    ~0.024% per line (~1-in-4167) - across all 10 lines, ~1-in-417
 *   per ticket
 *   Expected payout factor per line (per 1 unit of that line's prize) = 0.04097
 *   Prize amounts [0.5, 0.5, 1, 1, 1, 1.5, 2, 3, 4, 5] sum to 19.5, so RTP ≈ 79.9% - still
 *   authentically worse than Slots (90%), consistent with real retail scratch tickets.
 *   P(at least one winning line of 10, any kind) ≈33.7% (~1-in-3, matching OLG's real
 *   "1-in-3 to 1-in-5" range).
 *
 * Same debit-at-start pattern as Slots: the whole ticket (every line's symbols and
 * prize) is drawn and the total payout is fully decided *before* any money moves, then
 * persisted into a XenCasinoRound alongside the wager debit's idempotency key. The wager
 * is debited first; only then is the (already decided) payout transferred. If the process
 * dies between those two transfers, the round survives in the database and a periodic
 * sweep replays both idempotent transfers to finish the job - a ticket's outcome is never
 * re-drawn, only ever completed.
 */
import express = require("express");
import { authenticateToken } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/AuthenticatedRequest";
const { User } = require("../../models/user");
const { XenCasinoRound } = require("../../models/xenCasino");
const crypto = require("crypto");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../../utils/weeabetsClient";

interface PoolEntry {
    symbol: string;
    weight: number;
    bonusMultiple?: number; // present only for instant-multiplier symbols
}

interface TicketLine {
    symbols: string[];
    prizeMultiplier: number; // the line's own prize, times any bonus multiple hit
    bonusMultiple: number | null;
    won: boolean;
}

interface TicketConditions {
    lines: TicketLine[];
    totalPayout: number;
}

// Integer weights over a large total for fine-grained precision with crypto.randomInt.
const TOTAL_WEIGHT = 10_000_000;
const BONUS_WEIGHT = { "2x": 500, "5x": 200, "10x": 75, "20x": 25 }; // sums to 800
const REGULAR_WEIGHT = (TOTAL_WEIGHT - 800) / 5; // 1,999,840 each

const SYMBOL_POOL: PoolEntry[] = [
    { symbol: "🍒", weight: REGULAR_WEIGHT },
    { symbol: "🍋", weight: REGULAR_WEIGHT },
    { symbol: "🔔", weight: REGULAR_WEIGHT },
    { symbol: "💎", weight: REGULAR_WEIGHT },
    { symbol: "⭐", weight: REGULAR_WEIGHT },
    { symbol: "2x", weight: BONUS_WEIGHT["2x"], bonusMultiple: 2 },
    { symbol: "5x", weight: BONUS_WEIGHT["5x"], bonusMultiple: 5 },
    { symbol: "10x", weight: BONUS_WEIGHT["10x"], bonusMultiple: 10 },
    { symbol: "20x", weight: BONUS_WEIGHT["20x"], bonusMultiple: 20 },
];

const LINE_PRIZES = [0.5, 0.5, 1, 1, 1, 1.5, 2, 3, 4, 5]; // sums to 19.5
const LINE_COUNT = LINE_PRIZES.length;
const GAME_KEY = "scratch_ticket";

// A round's outcome (and thus its payout) is fully decided before it's even persisted, so
// "stale" only ever means "the process died mid-settlement" - the sweep below finishes it.
const ROUND_TTL_MS = 30 * 1000;
setInterval(() => {
    recoverStaleRounds().catch((err: Error) => {
        console.error("scratch: stale round recovery failed", err);
    });
}, 60 * 1000).unref();

function shuffled<T>(items: T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function drawSymbol(): PoolEntry {
    const roll = crypto.randomInt(0, TOTAL_WEIGHT);
    let cumulative = 0;
    for (const entry of SYMBOL_POOL) {
        cumulative += entry.weight;
        if (roll < cumulative) {
            return entry;
        }
    }
    return SYMBOL_POOL[SYMBOL_POOL.length - 1];
}

function generateTicket(): TicketLine[] {
    return shuffled(LINE_PRIZES).map((linePrize) => {
        const draws = Array.from({ length: 3 }, () => drawSymbol());
        const symbols = draws.map((d) => d.symbol);
        const bonusMultiples = draws.filter((d) => d.bonusMultiple).map((d) => d.bonusMultiple as number);

        if (bonusMultiples.length > 0) {
            const bonusMultiple = Math.max(...bonusMultiples);
            return { symbols, prizeMultiplier: linePrize * bonusMultiple, bonusMultiple, won: true };
        }
        const won = symbols.every((s) => s === symbols[0]);
        return { symbols, prizeMultiplier: won ? linePrize : 0, bonusMultiple: null, won };
    });
}

// Exact enumeration over all 3-box combinations (9^3 = 729) - precise, not a Monte Carlo
// estimate, computed once at module load. Mirrors generateTicket()'s win logic exactly.
function computeExactOdds() {
    let expectedFactorPerLine = 0;
    let probabilityRegularMatch = 0;
    let probabilityAnyBonus = 0;
    for (const a of SYMBOL_POOL) {
        for (const b of SYMBOL_POOL) {
            for (const c of SYMBOL_POOL) {
                const p = (a.weight / TOTAL_WEIGHT) * (b.weight / TOTAL_WEIGHT) * (c.weight / TOTAL_WEIGHT);
                const draws = [a, b, c];
                const bonusMultiples = draws.filter((d) => d.bonusMultiple).map((d) => d.bonusMultiple as number);
                if (bonusMultiples.length > 0) {
                    expectedFactorPerLine += p * Math.max(...bonusMultiples);
                    probabilityAnyBonus += p;
                } else if (a.symbol === b.symbol && b.symbol === c.symbol) {
                    expectedFactorPerLine += p * 1;
                    probabilityRegularMatch += p;
                }
            }
        }
    }
    const lineWinProbability = probabilityRegularMatch + probabilityAnyBonus;
    const prizePoolSum = LINE_PRIZES.reduce((sum, p) => sum + p, 0);
    return {
        matchProbability: probabilityRegularMatch,
        bonusProbability: probabilityAnyBonus,
        probabilityAtLeastOneWin: 1 - Math.pow(1 - lineWinProbability, LINE_COUNT),
        probabilityAtLeastOneBonus: 1 - Math.pow(1 - probabilityAnyBonus, LINE_COUNT),
        rtp: expectedFactorPerLine * prizePoolSum,
    };
}

const ODDS = computeExactOdds();

// Pays out the ticket's already-decided total (if any). Shared by the live play handler
// and the recovery sweep so both settle a round exactly the same way.
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
        key: `xendelta-scratch-payout-${round._id}`,
        note: "scratch_win",
    });
    return { balance: result.toNewBalance };
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
                note: "scratch_wager",
            });
            await settleRound(round);
            await XenCasinoRound.resolve(round._id);
        } catch (err) {
            console.error(`scratch: failed to recover stale round ${round._id}`, err);
        }
    }
}

module.exports = function (app: express.Application) {

    app.get("/api/casino/games/scratch/odds", authenticateToken, function (_req: express.Request, res: express.Response) {
        return res.json({
            status: true,
            data: {
                lineCount: LINE_COUNT,
                matchProbability: ODDS.matchProbability,
                linePrizes: [...LINE_PRIZES].sort((a, b) => a - b),
                bonusSymbols: SYMBOL_POOL.filter((s) => s.bonusMultiple).map((s) => ({
                    symbol: s.symbol,
                    multiple: s.bonusMultiple,
                    probability: s.weight / TOTAL_WEIGHT,
                })),
                probabilityAtLeastOneBonus: ODDS.probabilityAtLeastOneBonus,
                probabilityAtLeastOneWin: ODDS.probabilityAtLeastOneWin,
                rtp: ODDS.rtp,
            },
        });
    });

    app.post("/api/casino/games/scratch/play", authenticateToken, async function (req: express.Request, res: express.Response) {
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

            const lines = generateTicket();
            const totalMultiplier = lines.reduce((sum, line) => sum + (line.won ? line.prizeMultiplier : 0), 0);
            const totalPayout = wager * totalMultiplier;

            const debitKey = `xendelta-scratch-start-${userId}-${crypto.randomUUID()}`;
            let round;
            try {
                round = await XenCasinoRound.startRound({
                    game: GAME_KEY,
                    userId,
                    wager,
                    debitKey,
                    playerAccountId: resolved.account.accountId,
                    conditions: { lines, totalPayout } as TicketConditions,
                });
            } catch (err) {
                if ((err as { code?: number }).code === 11000) {
                    return res.status(400).json({ status: false, message: "You already have an active Scratch Ticket round" });
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
                    note: "scratch_wager",
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

            return res.json({ status: true, data: { lines, totalPayout, balance: settled.balance ?? debitBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });
};
