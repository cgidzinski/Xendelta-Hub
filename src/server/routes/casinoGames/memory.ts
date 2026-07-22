/**
 * Memory — a 5x5 grid of 25 cards. Unlike a classic all-pairs memory game, the deck has a
 * fixed composition (SYMBOL_GROUPS below): 2 "triple" icons (3 copies each), 6 "double"
 * icons (2 copies each), and 7 unique singles that can never match - 2*3 + 6*2 + 7*1 = 25,
 * so there's no leftover/locked cell needed. That composition is public, round-independent
 * knowledge, mirrored verbatim in Memory.tsx for its pre-round "peek" flourish - only the
 * *assignment* of symbols to the 25 positions is randomized and kept secret per round.
 *
 * This is XenCasino's first genuinely multi-step round for a good reason: the payout
 * depends on which 4 of the 25 cards the player actually picks, so unlike every other game
 * here it can't be decided before the player interacts. See Pachinko's file header for the
 * precedent (buy, then launch balls one at a time) and the XenCasinoRound model's own
 * comment anticipating exactly this ("a future multi-step game ... resolved later by an
 * explicit player action"). /start debits the wager and privately persists the real grid;
 * /reveal is the player's one genuine choice, and settles the round.
 *
 * Anti-cheat note: the real grid is NEVER sent to the client before /reveal, and there's no
 * `/active`-style resume endpoint that could leak it either. If it were sent early (even
 * just to drive a "realistic" shuffle animation), a player reading the network response
 * directly - bypassing whatever the UI renders - could always click the best available
 * pattern with certainty. The "peek then shuffle" flourish the player sees client-side is
 * built entirely from the public, round-independent SYMBOL_GROUPS composition, never from
 * this round's real, secret assignment. A round abandoned after /start but never revealed
 * (no resume mechanism) simply forfeits when it goes stale - see recoverStaleRounds.
 */
import express = require("express");
import { authenticateToken } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/AuthenticatedRequest";
const { User } = require("../../models/user");
const { XenCasinoRound } = require("../../models/xenCasino");
const crypto = require("crypto");
const mongoose = require("mongoose");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../../utils/weeabetsClient";
import { recordCasinoRoundPlayed } from "../../utils/dailyQuest";
import { requireGameEnabled } from "../../utils/casinoStatus";

const SLUG = "memory";
const BASE_PRICE = 10000; // the 1x denomination shown on the lobby card / odds route
export const GRID_SIZE = 5;
export const CELL_COUNT = GRID_SIZE * GRID_SIZE; // 25
export const PICK_COUNT = 4;

// The deck's fixed composition - public, round-independent, mirrored client-side in
// Memory.tsx for the peek flourish. Must sum to CELL_COUNT (25); changing it invalidates
// MATCH_MULTIPLIERS' RTP tuning below (re-derive via matchShapeCounts()).
export const SYMBOL_GROUPS: { symbol: string; count: number }[] = [
    { symbol: "ITEM_A", count: 3 },
    { symbol: "ITEM_B", count: 3 },
    { symbol: "ITEM_C", count: 2 },
    { symbol: "ITEM_D", count: 2 },
    { symbol: "ITEM_E", count: 2 },
    { symbol: "ITEM_F", count: 2 },
    { symbol: "ITEM_G", count: 2 },
    { symbol: "ITEM_H", count: 2 },
    { symbol: "ITEM_I", count: 1 },
    { symbol: "ITEM_J", count: 1 },
    { symbol: "ITEM_K", count: 1 },
    { symbol: "ITEM_L", count: 1 },
    { symbol: "ITEM_M", count: 1 },
    { symbol: "ITEM_N", count: 1 },
    { symbol: "ITEM_O", count: 1 },
];

// Payout is scored by the *shape* of the 4 picked cards' group membership, not a raw pair
// count: {1,1,1,1} (all different groups) = 0 matches, {2,1,1} (one pair) = 1, {2,2} (two
// separate pairs) = 2, {3,1} (a full triple) = 3 - see matchShapeCounts/shapeToMatchCount.
// No group in SYMBOL_GROUPS exceeds size 3, so those 4 shapes are exhaustive. Multipliers
// solved against the *exact* combinatorial probabilities from matchShapeCounts() (not
// guessed) for ~88% RTP, in the same band as this app's other games - see memoryRtp().
export const MATCH_MULTIPLIERS: Record<number, number> = { 0: 0, 1: 1.2, 2: 50, 3: 110 };

function shuffled<T>(items: T[]): T[] {
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// The real, secret per-round assignment: the fixed SYMBOL_GROUPS deck shuffled across the
// 25 positions. index i = position i's symbol.
export function generateGrid(): string[] {
    const deck = SYMBOL_GROUPS.flatMap((g) => Array.from({ length: g.count }, () => g.symbol));
    return shuffled(deck);
}

function shapeToMatchCount(shape: number[]): number {
    if (shape[0] === 3) return 3; // {3,1}
    if (shape[0] === 2 && shape.length === 2) return 2; // {2,2}
    if (shape[0] === 2) return 1; // {2,1,1}
    return 0; // {1,1,1,1}
}

export function matchCountForSymbols(symbols: string[]): number {
    const tally = new Map<string, number>();
    for (const s of symbols) tally.set(s, (tally.get(s) ?? 0) + 1);
    const shape = [...tally.values()].sort((a, b) => b - a);
    return shapeToMatchCount(shape);
}

// Exact enumeration (not Monte Carlo) of every C(25,4) = 12650 possible 4-pick over
// SYMBOL_GROUPS' fixed composition, tallied by match shape - cheap enough to brute-force
// rather than hand-derive a closed form, and self-evidently correct. Treats the deck as 25
// distinguishable "virtual positions" (one per physical cell) tagged with their group -
// exactly equivalent to enumerating real grid positions, just without materializing a grid.
// Cached at module load since SYMBOL_GROUPS never changes at runtime.
export function matchShapeCounts(): Record<number, number> {
    const positions: number[] = []; // groupIndex per virtual position, 0..24
    SYMBOL_GROUPS.forEach((g, groupIndex) => {
        for (let i = 0; i < g.count; i++) positions.push(groupIndex);
    });
    const n = positions.length;
    const counts: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (let a = 0; a < n; a++) {
        for (let b = a + 1; b < n; b++) {
            for (let c = b + 1; c < n; c++) {
                for (let d = c + 1; d < n; d++) {
                    const tally = new Map<number, number>();
                    for (const g of [positions[a], positions[b], positions[c], positions[d]]) {
                        tally.set(g, (tally.get(g) ?? 0) + 1);
                    }
                    const shape = [...tally.values()].sort((x, y) => y - x);
                    const matchCount = shapeToMatchCount(shape);
                    counts[matchCount]++;
                }
            }
        }
    }
    return counts;
}

const MATCH_SHAPE_COUNTS = matchShapeCounts();
const TOTAL_HANDS = Object.values(MATCH_SHAPE_COUNTS).reduce((sum, c) => sum + c, 0);

export function memoryRtp(): number {
    return Object.entries(MATCH_SHAPE_COUNTS).reduce((sum, [k, c]) => sum + MATCH_MULTIPLIERS[Number(k)] * (c / TOTAL_HANDS), 0);
}

interface RevealDecision {
    picks: number[];
    matchCount: number;
    payout: number;
}

interface MemoryConditions {
    grid: string[]; // secret - never sent to the client before /reveal
    revealPending: RevealDecision | null;
}

// A round can legitimately sit open for a couple of minutes between paying and picking (the
// player is looking at the peek, thinking about their 4 picks) - sweepStale keys off
// lastActivityAt (see xenCasino.js), so an actively-open round is never mistaken for an
// abandoned one before this. There's no resume flow (see the file header's anti-cheat
// note), so a round that outlives this TTL without ever calling /reveal simply forfeits.
const ROUND_TTL_MS = 2 * 60 * 1000;
// A round that fails this many consecutive sweep attempts is treated as genuinely stuck
// (not just transient) and gets a louder log line - see recoverStaleRounds below.
const SWEEP_FAILURE_ALERT_THRESHOLD = 5;
setInterval(() => {
    recoverStaleRounds().catch((err: Error) => {
        console.error(`${SLUG}: stale round recovery failed`, err);
    });
}, 60 * 1000).unref();

async function recoverStaleRounds(): Promise<void> {
    const stale = await XenCasinoRound.sweepStale(SLUG, ROUND_TTL_MS);
    for (const round of stale) {
        try {
            const conditions = round.conditions as MemoryConditions;
            const xenCasinoAccountId = await getXenCasinoAccountId();

            // Replaying the debit is safe even if it already went through - the key makes
            // it a no-op on the ledger, not a double charge.
            await transfer({
                fromAccountId: round.playerAccountId,
                toAccountId: xenCasinoAccountId,
                amount: round.wager.toFixed(10),
                key: round.debitKey,
                note: `${SLUG}_wager`,
            });

            // Only a round that already reached /reveal (and got as far as claiming
            // revealPending before dying) has a decided payout to finish - anything earlier
            // never had an outcome and simply forfeits (see the file header).
            if (conditions.revealPending && conditions.revealPending.payout > 0) {
                await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: round.playerAccountId,
                    amount: conditions.revealPending.payout.toFixed(10),
                    key: `xendelta-${SLUG}-payout-${round._id}`,
                    note: `${SLUG}_win`,
                });
            }

            await XenCasinoRound.resolve(round._id);
            // Only counts as "played" if the round actually reached a reveal - a paid-then-
            // abandoned round shouldn't let a player farm daily quest progress for free.
            if (conditions.revealPending) {
                await recordCasinoRoundPlayed(round.userId, {
                    game: SLUG,
                    wager: round.wager,
                    payout: conditions.revealPending.payout,
                });
            }
        } catch (err) {
            const failureCount = await XenCasinoRound.recordSweepFailure(round._id);
            if (failureCount !== null && failureCount >= SWEEP_FAILURE_ALERT_THRESHOLD) {
                console.error(`${SLUG}: round ${round._id} has failed sweep recovery ${failureCount} times in a row - needs investigation`, err);
            } else {
                console.error(`${SLUG}: failed to recover stale round ${round._id}`, err);
            }
        }
    }
}

module.exports = function (app: express.Application) {

    app.get(`/api/casino/games/${SLUG}/odds`, authenticateToken, function (_req: express.Request, res: express.Response) {
        return res.json({
            status: true,
            data: {
                price: BASE_PRICE,
                pickCount: PICK_COUNT,
                symbolGroups: SYMBOL_GROUPS,
                distribution: [0, 1, 2, 3].map((k) => ({
                    matchCount: k,
                    multiplier: MATCH_MULTIPLIERS[k],
                    probability: MATCH_SHAPE_COUNTS[k] / TOTAL_HANDS,
                })),
                rtp: memoryRtp(),
            },
        });
    });

    app.post(`/api/casino/games/${SLUG}/start`, authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
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

            const conditions: MemoryConditions = { grid: generateGrid(), revealPending: null };
            const roundId = new mongoose.Types.ObjectId();
            const debitKey = `xendelta-${SLUG}-start-${roundId}`;
            let round;
            try {
                round = await XenCasinoRound.startRound({
                    roundId,
                    game: SLUG,
                    userId,
                    wager,
                    debitKey,
                    playerAccountId: resolved.account.accountId,
                    conditions,
                });
            } catch (err) {
                if ((err as { code?: number }).code === 11000) {
                    return res.status(400).json({ status: false, message: "You already have an active round - reveal it, or wait for it to expire" });
                }
                throw err;
            }

            const xenCasinoAccountId = await getXenCasinoAccountId();
            let balance: string;
            try {
                const result = await transfer({
                    fromAccountId: resolved.account.accountId,
                    toAccountId: xenCasinoAccountId,
                    amount: wager.toFixed(10),
                    key: debitKey,
                    note: `${SLUG}_wager`,
                });
                balance = result.fromNewBalance;
            } catch (err) {
                if (err instanceof WeeabetsTransferError && err.status === 400) {
                    await XenCasinoRound.resolve(round._id);
                    return res.status(400).json({ status: false, message: "Insufficient balance" });
                }
                throw err; // ambiguous - leave round in place, the recovery sweep will retry
            }

            return res.json({ status: true, data: { roundId: round._id, balance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    app.post(`/api/casino/games/${SLUG}/reveal`, authenticateToken, async function (req: express.Request, res: express.Response) {
        const { picks } = req.body as { picks?: number[] };
        const validPicks =
            Array.isArray(picks) &&
            picks.length === PICK_COUNT &&
            new Set(picks).size === PICK_COUNT &&
            picks.every((p) => Number.isInteger(p) && p >= 0 && p < CELL_COUNT);
        if (!validPicks) {
            return res.status(400).json({ status: false, message: `picks must be ${PICK_COUNT} distinct integers between 0 and ${CELL_COUNT - 1}` });
        }

        const userId = String((req as AuthenticatedRequest).user!._id);

        try {
            const round = await XenCasinoRound.findActive(SLUG, userId);
            if (!round) {
                return res.status(400).json({ status: false, message: "No active round - start one first" });
            }
            const conditions = round.conditions as MemoryConditions;

            // A retry of an already-claimed reveal (e.g. the first attempt's response never
            // made it back) reuses the already-decided outcome rather than re-deciding it -
            // the incoming `picks` are ignored in that case, same "never re-draw, only ever
            // finish" rule every other game's recovery sweep follows.
            let decision = conditions.revealPending as RevealDecision | null;
            if (!decision) {
                const symbols = (picks as number[]).map((p) => conditions.grid[p]);
                const matchCount = matchCountForSymbols(symbols);
                const payout = round.wager * (MATCH_MULTIPLIERS[matchCount] ?? 0);
                decision = { picks: picks as number[], matchCount, payout };

                const claimed = await XenCasinoRound.applyConditionsUpdate(
                    round._id,
                    { "conditions.revealPending": null },
                    { $set: { "conditions.revealPending": decision } }
                );
                if (!claimed) {
                    return res.status(409).json({ status: false, message: "Round changed - try again" });
                }
            }

            let balance: string | undefined;
            if (decision.payout > 0) {
                const xenCasinoAccountId = await getXenCasinoAccountId();
                const result = await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: round.playerAccountId,
                    amount: decision.payout.toFixed(10),
                    key: `xendelta-${SLUG}-payout-${round._id}`,
                    note: `${SLUG}_win`,
                });
                balance = result.toNewBalance;
            }

            await XenCasinoRound.resolve(round._id);
            await recordCasinoRoundPlayed(userId, { game: SLUG, wager: round.wager, payout: decision.payout });

            return res.json({
                status: true,
                data: {
                    picks: decision.picks.map((p) => ({ position: p, symbol: conditions.grid[p] })),
                    matchCount: decision.matchCount,
                    payout: decision.payout,
                    balance,
                },
            });
        } catch (err) {
            // The decision (if claimed) is already durable even if we got here - leave the
            // round in place rather than trying to unwind it; recoverStaleRounds replays the
            // same idempotently-keyed payout transfer once the round goes stale.
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });
};
