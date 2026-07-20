/**
 * SpinMania — 5x3 all-ways-pay grid with cascading (tumbling) wins, its own dedicated
 * engine forked from Easy Spin's generic 3-reel machine (slots.ts) rather than a config
 * variant of it - see spinmaniaGrid.ts's file header for why. Routes live at
 * `/api/casino/games/spinmania/*` (NOT under `/api/casino/games/slots/*`) because Express
 * matches route registration order: slots.ts's own `:machine` param route is registered
 * first in server.ts and would otherwise intercept any request whose `:machine` happened to
 * be "spinmania" before this file's handler is ever reached.
 *
 * `XenCasinoRound.game` stays the literal string "spinmania" (unchanged from the old 3-reel
 * SpinMania) so the existing jackpot pool (`XenCasino.slotsJackpotPools.get("spinmania")`)
 * and the one-active-round-per-user-per-game index carry over untouched - no reseed, no
 * migration needed. `conditions` is `Mixed` on the model, so its new shape
 * (`{ initialGrid, steps, totalPayout, jackpot, payout }`, see spinmaniaGrid.ts's
 * `SpinResult`) needs no schema change either.
 *
 * Same debit-then-settle-then-persist pattern as every other casino game: the entire
 * cascade chain is resolved synchronously up front (see resolveSpin), so by the time a
 * round is created its payout is already fully decided - "stale" only ever means "the
 * process died mid-settlement," same as slots.ts. Settlement itself (the payout transfer +
 * jackpot pool update) is shared with slots.ts via slotsSettlement.ts.
 *
 * One migration nuance: a round created by the *old* 3-reel SpinMania code could in
 * principle still be sitting unsettled (process died between debit and payout, within the
 * old 30s TTL) at the exact moment this new engine deploys. That's safe without any special
 * casing: `settleSlotsRound` (see slotsSettlement.ts) only ever reads `payout`/`jackpot` off
 * `conditions`, a field pair both the old shape (`{ reels, multiplier, jackpot, payout }`)
 * and the new one (`{ initialGrid, steps, totalPayout, jackpot, payout }`) provide - neither
 * this file nor the shared settlement helper ever needs to know which shape it's looking at.
 */
import express = require("express");
import { authenticateToken } from "../../middleware/auth";
import { AuthenticatedRequest } from "../../types/AuthenticatedRequest";
const { User } = require("../../models/user");
const { XenCasino, XenCasinoRound } = require("../../models/xenCasino");
const mongoose = require("mongoose");
import { resolveUserAccount, getXenCasinoAccountId, transfer, WeeabetsUnavailable, WeeabetsTransferError } from "../../utils/weeabetsClient";
import { recordCasinoRoundPlayed } from "../../utils/dailyQuest";
import { settleSlotsRound } from "./slotsSettlement";
import { GRID_COLS, GRID_ROWS, JACKPOT_ITEM, SpinmaniaConfig, SpinResult, weightOf, resolveSpin } from "./spinmaniaGrid";

const MACHINE_SLUG = "spinmania";

// Tuned via Monte Carlo simulation against this exact config (see
// spinmaniaGrid.rtp.test.ts) rather than hand-derived - a 5x3 all-ways-pay grid with
// cascades has no tractable closed-form probability the way slots.ts's independent-reel
// math does. `BLANK` is a non-paying, non-scatter filler symbol (the majority of the
// weight) - without it, matches would be far too dense; real ways-pay machines use the
// same trick (a "blank" reel stop) to control hit frequency independently of how many
// symbols actually pay.
//
// Simulated (2M+ spins/seed, 3 independent seeds): base-game RTP ~85.5%, hit frequency
// ~22% of spins, average cascade depth ~1.1x once a spin wins at all (occasional chains up
// to 4-6 deep), jackpot ~1-in-55,000-70,000 (same order of magnitude as the old 3-reel
// SpinMania's 1-in-37,037). + 5% jackpot contribution = ~90.5% blended RTP, i.e. ~9.5%
// house edge - between Easy Spin's 4.8% and the old 3-reel SpinMania's 15.2%, reflecting
// the extra win frequency cascades add on top of the base paytable.
export const SPINMANIA_CONFIG: SpinmaniaConfig = {
    slug: MACHINE_SLUG,
    symbolWeights: [
        { symbol: "ITEM_A", weight: 22 },
        { symbol: "ITEM_B", weight: 15 },
        { symbol: "ITEM_C", weight: 10 },
        { symbol: "ITEM_D", weight: 6 },
        { symbol: JACKPOT_ITEM, weight: 4 },
        { symbol: "BLANK", weight: 43 },
    ],
    paytable: {
        ITEM_A: { 3: 0.28, 4: 0.86, 5: 2.75 },
        ITEM_B: { 3: 0.42, 4: 1.4, 5: 4.8 },
        ITEM_C: { 3: 0.86, 4: 2.75, 5: 9.6 },
        ITEM_D: { 3: 1.7, 4: 5.5, 5: 20.5 },
    },
    cascadeMultipliers: [1, 2, 3, 5, 8, 13],
    jackpotScatterCount: 6,
    jackpotContributionRate: 0.05,
    jackpotSeed: 0,
    targetRtp: 0.905,
};

// See slots.ts's identical constants for the reasoning - a round's outcome is fully decided
// before it's persisted, so "stale" only ever means "the process died mid-settlement."
const ROUND_TTL_MS = 30 * 1000;
const SWEEP_FAILURE_ALERT_THRESHOLD = 5;
setInterval(() => {
    recoverStaleRounds().catch((err: Error) => {
        console.error(`spinmania: stale round recovery failed`, err);
    });
}, 60 * 1000).unref();

interface SpinConditions {
    initialGrid: SpinResult["initialGrid"];
    steps: SpinResult["steps"];
    finalGrid: SpinResult["finalGrid"];
    totalPayout: number;
    jackpot: boolean;
    payout: number;
}

async function settleRound(round: { _id: string; wager: number; playerAccountId: number; conditions: { jackpot: boolean; payout: number } }): Promise<{ balance?: string }> {
    return settleSlotsRound(MACHINE_SLUG, SPINMANIA_CONFIG.jackpotContributionRate, SPINMANIA_CONFIG.jackpotSeed, round, round.conditions);
}

function binomialCoefficient(n: number, k: number): number {
    if (k < 0 || k > n) {
        return 0;
    }
    let result = 1;
    for (let i = 0; i < k; i++) {
        result = (result * (n - i)) / (i + 1);
    }
    return result;
}

// P(X >= kMin) for X ~ Binomial(n, p) - n is always GRID_COLS*GRID_ROWS (15), small enough
// to sum exactly rather than approximate. Used for the jackpot's true scatter odds, since
// (unlike a paytable run) it's a plain "N-or-more anywhere on the grid" condition.
function binomialTailProbability(n: number, p: number, kMin: number): number {
    let total = 0;
    for (let k = kMin; k <= n; k++) {
        total += binomialCoefficient(n, k) * Math.pow(p, k) * Math.pow(1 - p, n - k);
    }
    return total;
}

async function recoverStaleRounds(): Promise<void> {
    const stale = await XenCasinoRound.sweepStale(MACHINE_SLUG, ROUND_TTL_MS);
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
                note: `${MACHINE_SLUG}_wager`,
            });
            await settleRound(round);
            await XenCasinoRound.resolve(round._id);
            await recordCasinoRoundPlayed(round.userId);
        } catch (err) {
            const failureCount = await XenCasinoRound.recordSweepFailure(round._id);
            if (failureCount !== null && failureCount >= SWEEP_FAILURE_ALERT_THRESHOLD) {
                console.error(`spinmania: round ${round._id} has failed sweep recovery ${failureCount} times in a row - needs investigation`, err);
            } else {
                console.error(`spinmania: failed to recover stale round ${round._id}`, err);
            }
        }
    }
}

module.exports = function (app: express.Application) {
    app.get("/api/casino/games/spinmania/odds", authenticateToken, async function (_req: express.Request, res: express.Response) {
        const jackpotPool = await XenCasino.getJackpotPool(MACHINE_SLUG, SPINMANIA_CONFIG.jackpotSeed);
        const total = SPINMANIA_CONFIG.symbolWeights.reduce((sum, s) => sum + s.weight, 0);
        const p = (symbol: string) => weightOf(SPINMANIA_CONFIG, symbol) / total;

        // Built entirely from this machine's own config, same convention as slots.ts's
        // /odds - probability here is "this symbol appears at least once in each of the
        // first N columns," the same condition evaluateWins requires for an N-column win.
        const paySymbols = Object.keys(SPINMANIA_CONFIG.paytable);
        const paytable = paySymbols.flatMap((symbol) =>
            Object.entries(SPINMANIA_CONFIG.paytable[symbol]).map(([runLength, multiplier]) => {
                const columnProbability = 1 - Math.pow(1 - p(symbol), GRID_ROWS);
                return {
                    symbol,
                    runLength: Number(runLength),
                    probability: Math.pow(columnProbability, Number(runLength)),
                    multiplier,
                };
            })
        );
        paytable.sort((a, b) => a.probability - b.probability);

        const jackpotProbability = binomialTailProbability(GRID_COLS * GRID_ROWS, p(JACKPOT_ITEM), SPINMANIA_CONFIG.jackpotScatterCount);

        return res.json({
            status: true,
            data: {
                gridCols: GRID_COLS,
                gridRows: GRID_ROWS,
                paytable,
                cascadeMultipliers: SPINMANIA_CONFIG.cascadeMultipliers,
                jackpotScatterCount: SPINMANIA_CONFIG.jackpotScatterCount,
                jackpotProbability,
                jackpotContributionRate: SPINMANIA_CONFIG.jackpotContributionRate,
                jackpotPool,
                rtp: SPINMANIA_CONFIG.targetRtp,
            },
        });
    });

    app.post("/api/casino/games/spinmania/spin", authenticateToken, async function (req: express.Request, res: express.Response) {
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

            const spin = resolveSpin(SPINMANIA_CONFIG);
            const payout = spin.jackpot ? await XenCasino.getJackpotPool(MACHINE_SLUG, SPINMANIA_CONFIG.jackpotSeed) : wager * spin.totalPayout;

            const roundId = new mongoose.Types.ObjectId();
            const debitKey = `xendelta-slots-${MACHINE_SLUG}-start-${roundId}`;
            const conditions: SpinConditions = {
                initialGrid: spin.initialGrid,
                steps: spin.steps,
                finalGrid: spin.finalGrid,
                totalPayout: spin.totalPayout,
                jackpot: spin.jackpot,
                payout,
            };
            let round;
            try {
                round = await XenCasinoRound.startRound({
                    roundId,
                    game: MACHINE_SLUG,
                    userId,
                    wager,
                    debitKey,
                    playerAccountId: resolved.account.accountId,
                    conditions,
                });
            } catch (err) {
                if ((err as { code?: number }).code === 11000) {
                    return res.status(400).json({ status: false, message: "You already have an active round on this machine" });
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
                    note: `${MACHINE_SLUG}_wager`,
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
            await recordCasinoRoundPlayed(userId);

            return res.json({
                status: true,
                data: {
                    initialGrid: spin.initialGrid,
                    steps: spin.steps,
                    finalGrid: spin.finalGrid,
                    jackpot: spin.jackpot,
                    payout,
                    balance: settled.balance ?? debitBalance,
                },
            });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });
};
