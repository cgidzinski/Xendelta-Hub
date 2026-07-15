/**
 * Scratch Ticket — generic 10-line matching engine shared by every ticket. A ticket is just
 * an entry in `TICKETS`: its own fixed price, its own prize table, its own symbol/bonus
 * weights. Adding a new ticket is one new `TICKETS` entry plus one new frontend page (see
 * `ScratchCard.tsx` on the client) - nothing else in this file changes. Routes are
 * parameterized by `:ticket` (`/api/casino/games/scratch/:ticket/odds`, `/play`) and 404 on
 * an unknown slug.
 *
 * Each line independently draws 3 symbols from the ticket's weighted symbol pool. Any rare
 * "instant multiplier" bonus symbol in any of the 3 boxes auto-wins that line at that
 * multiple (highest, if more than one lands); otherwise a plain 3-of-a-kind wins the line's
 * own pre-assigned prize. Odds/RTP are solved by exact enumeration over all 3-box draws
 * (not eyeballed), computed once per ticket at module load - see each `TICKETS` entry's own
 * comment for the math.
 *
 * The ticket's price is server-owned: `/play` never reads a client-supplied wager, it always
 * charges `ticket.price`. Same debit-at-start pattern used across every game: the whole
 * ticket (every line's symbols and prize) is drawn and the total payout is fully decided
 * *before* any money moves, then persisted into a XenCasinoRound alongside the wager debit's
 * idempotency key. The wager is debited first; only then is the (already decided) payout
 * transferred. If the process dies between those two transfers, the round survives in the
 * database and a periodic per-ticket sweep replays both idempotent transfers to finish the
 * job - a ticket's outcome is never re-drawn, only ever completed.
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

interface TicketConfig {
    slug: string;
    price: number;
    linePrizes: number[];
    symbolPool: PoolEntry[];
}

const TICKETS: Record<string, TicketConfig> = {
    // Original ticket, unchanged: exact enumeration gives ~4.00% regular-match probability
    // per line (~1-in-25), ~0.024% any-bonus per line (~1-in-4167), P(at least one winning
    // line of 10) ~33.7% (~1-in-3, matching OLG's real "1-in-3 to 1-in-5" range), RTP ~79.9%
    // - authentically worse than Slots (90%), consistent with real retail scratch tickets.
    "easy-scratch": {
        slug: "easy-scratch",
        price: 500,
        linePrizes: [0.5, 0.5, 1, 1, 1, 1.5, 2, 3, 4, 5], // sums to 19.5
        symbolPool: (() => {
            const totalWeight = 10_000_000;
            const bonusWeight = { "2x": 500, "5x": 200, "10x": 75, "20x": 25 }; // sums to 800
            const regularWeight = (totalWeight - 800) / 5; // 1,999,840 each
            return [
                { symbol: "🍒", weight: regularWeight },
                { symbol: "🍋", weight: regularWeight },
                { symbol: "🔔", weight: regularWeight },
                { symbol: "💎", weight: regularWeight },
                { symbol: "⭐", weight: regularWeight },
                { symbol: "2x", weight: bonusWeight["2x"], bonusMultiple: 2 },
                { symbol: "5x", weight: bonusWeight["5x"], bonusMultiple: 5 },
                { symbol: "10x", weight: bonusWeight["10x"], bonusMultiple: 10 },
                { symbol: "20x", weight: bonusWeight["20x"], bonusMultiple: 20 },
            ];
        })(),
    },
    // Higher-denomination, higher-volatility ticket: a 6th regular symbol makes a plain
    // match rarer (~2.78% per line vs Easy Scratch's ~4.00%), bonus symbols are rarer still
    // but pay far bigger (2x/5x/15x/50x vs 2x/5x/10x/20x), and the prize table is bigger and
    // more top-heavy. Solved by exact enumeration (see scratchmania_odds.js in this repo's
    // history) for a comparable ~80% RTP, just shaped for bigger, rarer swings:
    //   matchProbability ~2.78%, any-bonus ~0.0131% per line
    //   P(at least one winning line of 10) ~24.6% (~1-in-4, rarer than Easy Scratch's ~1-in-3)
    //   RTP ~80.1%
    "scratchmania": {
        slug: "scratchmania",
        price: 2000,
        linePrizes: [0.5, 0.75, 1, 1, 1.5, 1.5, 2.5, 3.5, 6, 10], // sums to 28.25
        symbolPool: (() => {
            const totalWeight = 10_000_000;
            const bonusWeight = { "2x": 300, "5x": 100, "15x": 30, "50x": 8 }; // sums to 438
            const regularWeight = (totalWeight - 438) / 6;
            return [
                { symbol: "🍒", weight: regularWeight },
                { symbol: "🍋", weight: regularWeight },
                { symbol: "🔔", weight: regularWeight },
                { symbol: "💎", weight: regularWeight },
                { symbol: "⭐", weight: regularWeight },
                { symbol: "👑", weight: regularWeight },
                { symbol: "2x", weight: bonusWeight["2x"], bonusMultiple: 2 },
                { symbol: "5x", weight: bonusWeight["5x"], bonusMultiple: 5 },
                { symbol: "15x", weight: bonusWeight["15x"], bonusMultiple: 15 },
                { symbol: "50x", weight: bonusWeight["50x"], bonusMultiple: 50 },
            ];
        })(),
    },
};

// A round's outcome (and thus its payout) is fully decided before it's even persisted, so
// "stale" only ever means "the process died mid-settlement" - the sweep below finishes it.
const ROUND_TTL_MS = 30 * 1000;
for (const slug of Object.keys(TICKETS)) {
    setInterval(() => {
        recoverStaleRounds(slug).catch((err: Error) => {
            console.error(`scratch(${slug}): stale round recovery failed`, err);
        });
    }, 60 * 1000).unref();
}

function totalWeight(pool: PoolEntry[]): number {
    return pool.reduce((sum, entry) => sum + entry.weight, 0);
}

function shuffled<T>(items: T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function drawSymbol(pool: PoolEntry[]): PoolEntry {
    const total = totalWeight(pool);
    const roll = crypto.randomInt(0, total);
    let cumulative = 0;
    for (const entry of pool) {
        cumulative += entry.weight;
        if (roll < cumulative) {
            return entry;
        }
    }
    return pool[pool.length - 1];
}

function generateTicket(ticket: TicketConfig): TicketLine[] {
    return shuffled(ticket.linePrizes).map((linePrize) => {
        const draws = Array.from({ length: 3 }, () => drawSymbol(ticket.symbolPool));
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

// Exact enumeration over all 3-box combinations - precise, not a Monte Carlo estimate,
// computed once per ticket at module load. Mirrors generateTicket()'s win logic exactly.
function computeExactOdds(ticket: TicketConfig) {
    const total = totalWeight(ticket.symbolPool);
    let expectedFactorPerLine = 0;
    let probabilityRegularMatch = 0;
    let probabilityAnyBonus = 0;
    for (const a of ticket.symbolPool) {
        for (const b of ticket.symbolPool) {
            for (const c of ticket.symbolPool) {
                const p = (a.weight / total) * (b.weight / total) * (c.weight / total);
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
    const prizePoolSum = ticket.linePrizes.reduce((sum, p) => sum + p, 0);
    const lineCount = ticket.linePrizes.length;
    return {
        matchProbability: probabilityRegularMatch,
        bonusProbability: probabilityAnyBonus,
        probabilityAtLeastOneWin: 1 - Math.pow(1 - lineWinProbability, lineCount),
        probabilityAtLeastOneBonus: 1 - Math.pow(1 - probabilityAnyBonus, lineCount),
        rtp: expectedFactorPerLine * prizePoolSum,
    };
}

const ODDS: Record<string, ReturnType<typeof computeExactOdds>> = Object.fromEntries(
    Object.entries(TICKETS).map(([slug, ticket]) => [slug, computeExactOdds(ticket)])
);

// Pays out the ticket's already-decided total (if any). Shared by the live play handler and
// the recovery sweep so both settle a round exactly the same way.
async function settleRound(
    ticket: TicketConfig,
    round: { _id: string; playerAccountId: number; conditions: TicketConditions }
): Promise<{ balance?: string }> {
    const { totalPayout } = round.conditions;
    if (totalPayout <= 0) {
        return {};
    }
    const xenCasinoAccountId = await getXenCasinoAccountId();
    const result = await transfer({
        fromAccountId: xenCasinoAccountId,
        toAccountId: round.playerAccountId,
        amount: totalPayout.toFixed(10),
        key: `xendelta-scratch-${ticket.slug}-payout-${round._id}`,
        note: `${ticket.slug}_win`,
    });
    return { balance: result.toNewBalance };
}

async function recoverStaleRounds(slug: string): Promise<void> {
    const ticket = TICKETS[slug];
    const stale = await XenCasinoRound.sweepStale(slug, ROUND_TTL_MS);
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
                note: `${slug}_wager`,
            });
            await settleRound(ticket, round);
            await XenCasinoRound.resolve(round._id);
        } catch (err) {
            console.error(`scratch(${slug}): failed to recover stale round ${round._id}`, err);
        }
    }
}

module.exports = function (app: express.Application) {

    app.get("/api/casino/games/scratch/:ticket/odds", authenticateToken, function (req: express.Request, res: express.Response) {
        const ticket = TICKETS[req.params.ticket];
        if (!ticket) {
            return res.status(404).json({ status: false, message: "Unknown ticket" });
        }
        const odds = ODDS[ticket.slug];
        return res.json({
            status: true,
            data: {
                price: ticket.price,
                lineCount: ticket.linePrizes.length,
                matchProbability: odds.matchProbability,
                linePrizes: [...ticket.linePrizes].sort((a, b) => a - b),
                bonusSymbols: ticket.symbolPool
                    .filter((s) => s.bonusMultiple)
                    .map((s) => ({
                        symbol: s.symbol,
                        multiple: s.bonusMultiple,
                        probability: s.weight / totalWeight(ticket.symbolPool),
                    })),
                probabilityAtLeastOneBonus: odds.probabilityAtLeastOneBonus,
                probabilityAtLeastOneWin: odds.probabilityAtLeastOneWin,
                rtp: odds.rtp,
            },
        });
    });

    app.post("/api/casino/games/scratch/:ticket/play", authenticateToken, async function (req: express.Request, res: express.Response) {
        const ticket = TICKETS[req.params.ticket];
        if (!ticket) {
            return res.status(404).json({ status: false, message: "Unknown ticket" });
        }
        const wager = ticket.price;

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

            const lines = generateTicket(ticket);
            const totalMultiplier = lines.reduce((sum, line) => sum + (line.won ? line.prizeMultiplier : 0), 0);
            const totalPayout = wager * totalMultiplier;

            const debitKey = `xendelta-scratch-${ticket.slug}-start-${userId}-${crypto.randomUUID()}`;
            let round;
            try {
                round = await XenCasinoRound.startRound({
                    game: ticket.slug,
                    userId,
                    wager,
                    debitKey,
                    playerAccountId: resolved.account.accountId,
                    conditions: { lines, totalPayout } as TicketConditions,
                });
            } catch (err) {
                if ((err as { code?: number }).code === 11000) {
                    return res.status(400).json({ status: false, message: "You already have an active round on this ticket" });
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
                    note: `${ticket.slug}_wager`,
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
            const settled = await settleRound(ticket, round);
            await XenCasinoRound.resolve(round._id);

            return res.json({ status: true, data: { lines, totalPayout, balance: settled.balance ?? debitBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });
};
