/**
 * Memory — a 5x5 grid of 25 cards, classic match-two mechanic. The deck has 7 "triple"
 * icons (3 copies each) and 2 "double" icons (2 copies each) — 7×3 + 2×2 = 25, so every
 * card has at least one match. The composition is public and mirrored in Memory.tsx for
 * the pre-round "peek" flourish.
 *
 * The round has up to 3 reveal steps: each /reveal call the player picks 2 face-down
 * cards. If the two cards share the same symbol, they match — stay face-up and are removed
 * from future picks. If not, the server reports both symbols and the client flips them
 * back. After 3 reveals (or when no more pairs are possible), the round resolves: payout =
 * wager × MATCH_MULTIPLIERS[matchedPairs].
 *
 * Anti-cheat: the real grid is NEVER sent to the client before /reveal. The peek flourish
 * uses the public SYMBOL_GROUPS only. A round abandoned mid-reveal forfeits when stale.
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
import { capPayout } from "./payoutCap";

const SLUG = "memory";
const BASE_PRICE = 2500; // the 1x denomination shown on the lobby card / odds route
// Hard ceiling on a single reveal's payout - see payoutCap.ts.
const MAX_PAYOUT = 10_000_000;
export const GRID_SIZE = 5;
export const CELL_COUNT = GRID_SIZE * GRID_SIZE; // 25
export const PICK_COUNT = 2;
export const MAX_REVEALS = 3;

// 7 triples + 2 doubles = 25 cards, 9 unique symbols. Every card has at least one match
// — no dead singles. Tuned so random match rate is ~7.7% per attempt, with a meaningful
// skill gap (~2× better for perfect memory) concentrated in the 3rd reveal.
export const SYMBOL_GROUPS: { symbol: string; count: number }[] = [
    { symbol: "ITEM_A", count: 3 },
    { symbol: "ITEM_B", count: 3 },
    { symbol: "ITEM_C", count: 3 },
    { symbol: "ITEM_D", count: 3 },
    { symbol: "ITEM_E", count: 3 },
    { symbol: "ITEM_F", count: 3 },
    { symbol: "ITEM_G", count: 3 },
    { symbol: "ITEM_H", count: 2 },
    { symbol: "ITEM_I", count: 2 },
];

// Payout multipliers by matched-pair count (0-3). Balanced for ~88% RTP for typical play
// where the player uses partial memory (not purely random, not perfect either). Skilled
// players who remember every card they've seen can beat 100% RTP — that's intentional for
// a game called "Memory." Tune these values to adjust house edge.
export const MATCH_MULTIPLIERS: Record<number, number> = { 0: 0, 1: 3, 2: 15, 3: 100 };

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

// Rough RTP estimate for the pair-match mechanic, assuming purely random picks (no skill).
// Exact RTP depends on player memory skill — this is the floor. Use for display only.
export function memoryRtp(): number {
    // With 7 triples + 2 doubles, per-attempt random match probability:
    //   P(match) = (21/25 * 2/24) + (4/25 * 1/24) = 46/600 ≈ 0.0767
    // Binomial probabilities for 3 independent attempts (close enough for RTP estimate):
    const p = (21 * 2 + 4 * 1) / (25 * 24); // 46/600 ≈ 0.07667
    const q = 1 - p;
    const probs = [q ** 3, 3 * q ** 2 * p, 3 * q * p ** 2, p ** 3];
    return Object.entries(MATCH_MULTIPLIERS).reduce((sum, [k, m]) => sum + m * probs[Number(k)], 0);
}

interface RevealResult {
    picks: number[];
    symbols: string[];
    matched: boolean;
}

interface MemoryConditions {
    grid: string[]; // secret — never sent to the client before /reveal
    clearedPositions: number[]; // positions of already-matched cards (unpickable)
    revealCount: number; // how many /reveal calls have happened this round (0-3)
    matchedPairs: number; // how many of those reveals were matches (0-3)
    finalPayout: number; // 0 until the round resolves; set on final reveal
    resolved: boolean; // true once the round has been settled
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

            // Replay the debit (idempotent key — safe to replay).
            await transfer({
                fromAccountId: round.playerAccountId,
                toAccountId: xenCasinoAccountId,
                amount: round.wager.toFixed(10),
                key: round.debitKey,
                note: `${SLUG}_wager`,
            });

            // If the round was resolved with a payout but the transfer never completed,
            // replay it. If the round never finished (abandoned mid-reveal), forfeit.
            if (conditions.resolved && conditions.finalPayout > 0) {
                await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: round.playerAccountId,
                    amount: conditions.finalPayout.toFixed(10),
                    key: `xendelta-${SLUG}-payout-${round._id}`,
                    note: `${SLUG}_win`,
                });
            }

            await XenCasinoRound.resolve(round._id);
            // Only counts as played if the round was actually completed (all 3 reveals done
            // or max pairs reached). Abandoned rounds don't count toward daily quests.
            if (conditions.resolved) {
                await recordCasinoRoundPlayed(round.userId, {
                    game: SLUG,
                    wager: round.wager,
                    payout: conditions.finalPayout,
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
        const p = (21 * 2 + 4 * 1) / (25 * 24); // random match probability per attempt
        const q = 1 - p;
        const binomial = [q ** 3, 3 * q ** 2 * p, 3 * q * p ** 2, p ** 3];
        return res.json({
            status: true,
            data: {
                price: BASE_PRICE,
                pickCount: PICK_COUNT,
                maxReveals: MAX_REVEALS,
                symbolGroups: SYMBOL_GROUPS,
                distribution: [0, 1, 2, 3].map((k) => ({
                    matchedPairs: k,
                    multiplier: MATCH_MULTIPLIERS[k],
                    probability: binomial[k],
                })),
                rtp: memoryRtp(),
                maxPayout: MAX_PAYOUT,
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

            const conditions: MemoryConditions = { grid: generateGrid(), clearedPositions: [], revealCount: 0, matchedPairs: 0, finalPayout: 0, resolved: false };
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
        const { picks, revealIndex } = req.body as { picks?: number[]; revealIndex?: number };
        const validPicks =
            Array.isArray(picks) &&
            picks.length === PICK_COUNT &&
            new Set(picks).size === PICK_COUNT &&
            picks.every((p) => Number.isInteger(p) && p >= 0 && p < CELL_COUNT);
        if (!validPicks) {
            return res.status(400).json({ status: false, message: `picks must be ${PICK_COUNT} distinct integers between 0 and ${CELL_COUNT - 1}` });
        }
        if (typeof revealIndex !== "number" || revealIndex < 0 || revealIndex >= MAX_REVEALS) {
            return res.status(400).json({ status: false, message: `revealIndex must be 0-${MAX_REVEALS - 1}` });
        }

        const userId = String((req as AuthenticatedRequest).user!._id);

        try {
            const round = await XenCasinoRound.findActive(SLUG, userId);
            if (!round) {
                return res.status(400).json({ status: false, message: "No active round - start one first" });
            }
            const conditions = round.conditions as MemoryConditions;
            const picksArr = picks as number[];

            // Reject picks that include already-cleared (matched) positions.
            const clearedSet = new Set(conditions.clearedPositions);
            if (picksArr.some((p) => clearedSet.has(p))) {
                return res.status(400).json({ status: false, message: "One or more picks are already matched and cleared" });
            }

            // If this revealIndex has already been processed (retry), return cached result.
            // We store the last reveal result in a transient field on conditions.
            if (revealIndex < conditions.revealCount) {
                // Retry of a past reveal — the picks must match what was originally sent,
                // otherwise the client is trying to change history.
                const pastPicks = (conditions as any)._lastRevealPicks as number[] | undefined;
                if (pastPicks && pastPicks.length === PICK_COUNT && pastPicks.every((pp, i) => pp === picksArr[i])) {
                    const pastResult = (conditions as any)._lastRevealResult as RevealResult | undefined;
                    if (pastResult) {
                        return res.json({
                            status: true,
                            data: {
                                ...pastResult,
                                revealCount: conditions.revealCount,
                                matchedPairs: conditions.matchedPairs,
                                maxReveals: MAX_REVEALS,
                                isFinal: conditions.resolved,
                                finalPayout: conditions.finalPayout,
                            },
                        });
                    }
                }
                return res.status(400).json({ status: false, message: "This reveal step was already completed — picks don't match" });
            }

            if (revealIndex !== conditions.revealCount) {
                return res.status(400).json({ status: false, message: `Expected revealIndex ${conditions.revealCount}, got ${revealIndex}` });
            }

            // Process this reveal.
            const symbols = picksArr.map((p) => conditions.grid[p]);
            const matched = symbols[0] === symbols[1];
            const newCleared = matched ? [...conditions.clearedPositions, picksArr[0], picksArr[1]] : conditions.clearedPositions;
            const newMatchedPairs = conditions.matchedPairs + (matched ? 1 : 0);
            const newRevealCount = conditions.revealCount + 1;

            const result: RevealResult = {
                picks: picksArr,
                symbols,
                matched,
            };

            const isFinal = newRevealCount >= MAX_REVEALS;
            let finalPayout = 0;
            let balance: string | undefined;

            if (isFinal) {
                finalPayout = capPayout(round.wager * (MATCH_MULTIPLIERS[newMatchedPairs] ?? 0), MAX_PAYOUT);

                // Atomically update conditions to mark resolved and claim the final payout.
                const updated = await XenCasinoRound.applyConditionsUpdate(
                    round._id,
                    { "conditions.resolved": false },
                    {
                        $set: {
                            "conditions.clearedPositions": newCleared,
                            "conditions.revealCount": newRevealCount,
                            "conditions.matchedPairs": newMatchedPairs,
                            "conditions.finalPayout": finalPayout,
                            "conditions.resolved": true,
                            "conditions._lastRevealPicks": picksArr,
                            "conditions._lastRevealResult": result,
                        },
                    }
                );
                if (!updated) {
                    return res.status(409).json({ status: false, message: "Round changed — try again" });
                }

                if (finalPayout > 0) {
                    const xenCasinoAccountId = await getXenCasinoAccountId();
                    const transferResult = await transfer({
                        fromAccountId: xenCasinoAccountId,
                        toAccountId: round.playerAccountId,
                        amount: finalPayout.toFixed(10),
                        key: `xendelta-${SLUG}-payout-${round._id}`,
                        note: `${SLUG}_win`,
                    });
                    balance = transferResult.toNewBalance;
                }

                await XenCasinoRound.resolve(round._id);
                await recordCasinoRoundPlayed(userId, { game: SLUG, wager: round.wager, payout: finalPayout });
            } else {
                // Mid-round: persist progress, round stays active.
                const updated = await XenCasinoRound.applyConditionsUpdate(
                    round._id,
                    { "conditions.revealCount": conditions.revealCount, "conditions.resolved": false },
                    {
                        $set: {
                            "conditions.clearedPositions": newCleared,
                            "conditions.revealCount": newRevealCount,
                            "conditions.matchedPairs": newMatchedPairs,
                            "conditions._lastRevealPicks": picksArr,
                            "conditions._lastRevealResult": result,
                        },
                    }
                );
                if (!updated) {
                    return res.status(409).json({ status: false, message: "Round changed — try again" });
                }
            }

            return res.json({
                status: true,
                data: {
                    picks: picksArr.map((p) => ({ position: p, symbol: conditions.grid[p] })),
                    matched,
                    revealCount: newRevealCount,
                    matchedPairs: newMatchedPairs,
                    maxReveals: MAX_REVEALS,
                    isFinal,
                    finalPayout,
                    balance,
                },
            });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });
};
