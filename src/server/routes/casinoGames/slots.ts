/**
 * Slots — generic weighted 3-reel engine shared by every slot machine. A machine is just
 * an entry in `MACHINES`: its own symbol weights, its own paytable, its own jackpot
 * contribution rate/seed. Adding a new machine is one new `MACHINES` entry plus one new
 * frontend page (see `SlotMachine.tsx` on the client) - nothing else in this file changes.
 * Routes are parameterized by `:machine` (`/api/casino/games/slots/:machine/odds`,
 * `/spin`) and 404 on an unknown slug.
 *
 * Each machine's paytable + jackpot contribution rate is solved (not guessed) for its
 * documented `targetRtp` - see the comment on each `MACHINES` entry for the math.
 *
 * Jackpots are per-machine: `XenCasino.slotsJackpotPools` is a Map keyed by machine slug,
 * so a jackpot hit on one machine only resets that machine's own pool. The jackpot pool
 * itself is local bookkeeping - that wager money already sits in XenCasino's real
 * Weeabets balance the moment it's lost; only the jackpot *payout* triggers an actual
 * transfer.
 *
 * Same debit-at-start pattern used across every game: the reels are drawn and the payout
 * is fully decided *before* any money moves, then persisted into a XenCasinoRound
 * alongside the wager debit's idempotency key. The wager is debited first; only then is
 * the (already decided) payout transferred. If the process dies between those two
 * transfers, the round survives in the database and a periodic sweep replays both
 * idempotent transfers to finish the job - a spin's outcome is never re-drawn, only ever
 * completed. `XenCasinoRound.game` is the machine slug itself, so each machine gets its
 * own round-locking ("one active round per user per machine") and recovery sweep for
 * free from that existing generic infrastructure.
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

interface MachineConfig {
    slug: string;
    symbolWeights: { symbol: Symbol; weight: number }[];
    tripleMultipliers: Partial<Record<Symbol, number>>;
    twoCherryMultiplier: number;
    jackpotContributionRate: number;
    jackpotSeed: number;
    targetRtp: number;
}

const MACHINES: Record<string, MachineConfig> = {
    // Original machine, unchanged: paytable solved for a blended ~90% RTP -
    //   EV from the ordinary paytable alone = 86.51%
    //   + 3.5% of every wager routed into the jackpot pool (contribution rate ~= its own
    //     long-run RTP contribution, since every dollar contributed is eventually paid
    //     back out to whoever hits the jackpot)
    //   = 90.01% blended RTP, i.e. ~10% house edge. Jackpot ~1-in-37,037.
    "easy-spin": {
        slug: "easy-spin",
        symbolWeights: [
            { symbol: "cherry", weight: 40 },
            { symbol: "lemon", weight: 30 },
            { symbol: "bell", weight: 18 },
            { symbol: "diamond", weight: 9 },
            { symbol: "seven", weight: 3 },
        ],
        tripleMultipliers: { diamond: 36, bell: 14, lemon: 6, cherry: 3 },
        twoCherryMultiplier: 1.4,
        jackpotContributionRate: 0.035,
        jackpotSeed: 100,
        targetRtp: 0.9001,
    },
    // Higher-denomination, higher-volatility machine: rarer jackpot symbol (1.5% vs Easy
    // Spin's 3%), rarer/bigger top triple, smaller/flatter minor wins (two-cherry pays
    // even money, not 1.4x). Solved analytically (fix the common terms - cherry triple,
    // two-cherry - to clean numbers, then solve the rare triples for the exact remaining
    // RTP target) and verified by exact 5^3 enumeration + a 20M-spin simulation before
    // shipping:
    //   Paytable RTP = 85.74% (exact)
    //   + 4.26% jackpot contribution = 90.00% blended RTP, matching Easy Spin's house
    //     edge exactly, just shaped for bigger, rarer swings. Jackpot ~1-in-296,296.
    "spinmania": {
        slug: "spinmania",
        symbolWeights: [
            { symbol: "cherry", weight: 380 },
            { symbol: "lemon", weight: 300 },
            { symbol: "bell", weight: 190 },
            { symbol: "diamond", weight: 115 },
            { symbol: "seven", weight: 15 },
        ],
        tripleMultipliers: { diamond: 87, bell: 23, lemon: 7, cherry: 2 },
        twoCherryMultiplier: 1,
        jackpotContributionRate: 0.0426,
        jackpotSeed: 400,
        targetRtp: 0.9,
    },
};

// A round's outcome (and thus its payout) is fully decided before it's even persisted, so
// "stale" only ever means "the process died mid-settlement" - the sweep below finishes it.
const ROUND_TTL_MS = 30 * 1000;
for (const machine of Object.keys(MACHINES)) {
    setInterval(() => {
        recoverStaleRounds(machine).catch((err: Error) => {
            console.error(`slots(${machine}): stale round recovery failed`, err);
        });
    }, 60 * 1000).unref();
}

function totalWeight(machine: MachineConfig): number {
    return machine.symbolWeights.reduce((sum, s) => sum + s.weight, 0);
}

function weightOf(machine: MachineConfig, symbol: Symbol): number {
    return machine.symbolWeights.find((s) => s.symbol === symbol)!.weight;
}

function drawSymbol(machine: MachineConfig): Symbol {
    const total = totalWeight(machine);
    const roll = crypto.randomInt(0, total);
    let cumulative = 0;
    for (const { symbol, weight } of machine.symbolWeights) {
        cumulative += weight;
        if (roll < cumulative) {
            return symbol;
        }
    }
    return machine.symbolWeights[machine.symbolWeights.length - 1].symbol;
}

function spinReels(machine: MachineConfig): [Symbol, Symbol, Symbol] {
    return [drawSymbol(machine), drawSymbol(machine), drawSymbol(machine)];
}

function resultFor(machine: MachineConfig, reels: [Symbol, Symbol, Symbol]): { multiplier: number; jackpot: boolean } {
    const [a, b, c] = reels;
    if (a === "seven" && b === "seven" && c === "seven") {
        return { multiplier: 0, jackpot: true };
    }
    if (a === b && b === c) {
        return { multiplier: machine.tripleMultipliers[a] ?? 0, jackpot: false };
    }
    const cherryCount = reels.filter((s) => s === "cherry").length;
    if (cherryCount === 2) {
        return { multiplier: machine.twoCherryMultiplier, jackpot: false };
    }
    return { multiplier: 0, jackpot: false };
}

// Pays out the round's already-decided payout (if any) and updates the jackpot pool.
// Shared by the live spin handler and the recovery sweep so both settle a round exactly
// the same way.
async function settleRound(
    machine: MachineConfig,
    round: { _id: string; wager: number; playerAccountId: number; conditions: SpinConditions }
): Promise<{ balance?: string }> {
    const { jackpot, payout } = round.conditions;

    let balance: string | undefined;
    if (payout > 0) {
        const xenCasinoAccountId = await getXenCasinoAccountId();
        const result = await transfer({
            fromAccountId: xenCasinoAccountId,
            toAccountId: round.playerAccountId,
            amount: payout.toFixed(10),
            key: `xendelta-slots-${machine.slug}-payout-${round._id}`,
            note: jackpot ? `${machine.slug}_jackpot` : `${machine.slug}_win`,
        });
        balance = result.toNewBalance;
    }

    if (jackpot) {
        await XenCasino.resetJackpotPool(machine.slug, machine.jackpotSeed);
    } else {
        await XenCasino.incrementJackpotPool(machine.slug, round.wager * machine.jackpotContributionRate);
    }

    return { balance };
}

async function recoverStaleRounds(machineSlug: string): Promise<void> {
    const machine = MACHINES[machineSlug];
    const stale = await XenCasinoRound.sweepStale(machineSlug, ROUND_TTL_MS);
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
                note: `${machineSlug}_wager`,
            });
            await settleRound(machine, round);
            await XenCasinoRound.resolve(round._id);
        } catch (err) {
            console.error(`slots(${machineSlug}): failed to recover stale round ${round._id}`, err);
        }
    }
}

module.exports = function (app: express.Application) {

    app.get("/api/casino/games/slots/:machine/odds", authenticateToken, async function (req: express.Request, res: express.Response) {
        const machine = MACHINES[req.params.machine];
        if (!machine) {
            return res.status(404).json({ status: false, message: "Unknown machine" });
        }

        const jackpotPool = await XenCasino.getJackpotPool(machine.slug, machine.jackpotSeed);
        const total = totalWeight(machine);
        const p = (symbol: Symbol) => weightOf(machine, symbol) / total;
        const pCherry = p("cherry");
        const paytable = [
            { combo: "7-7-7 (jackpot)", probability: Math.pow(p("seven"), 3) },
            { combo: "diamond-diamond-diamond", probability: Math.pow(p("diamond"), 3), multiplier: machine.tripleMultipliers.diamond },
            { combo: "bell-bell-bell", probability: Math.pow(p("bell"), 3), multiplier: machine.tripleMultipliers.bell },
            { combo: "lemon-lemon-lemon", probability: Math.pow(p("lemon"), 3), multiplier: machine.tripleMultipliers.lemon },
            { combo: "cherry-cherry-cherry", probability: Math.pow(pCherry, 3), multiplier: machine.tripleMultipliers.cherry },
            { combo: "cherry-cherry-*", probability: 3 * pCherry * pCherry * (1 - pCherry), multiplier: machine.twoCherryMultiplier },
        ];
        return res.json({
            status: true,
            data: {
                paytable,
                jackpotContributionRate: machine.jackpotContributionRate,
                jackpotPool,
                rtp: machine.targetRtp,
            },
        });
    });

    app.post("/api/casino/games/slots/:machine/spin", authenticateToken, async function (req: express.Request, res: express.Response) {
        const machine = MACHINES[req.params.machine];
        if (!machine) {
            return res.status(404).json({ status: false, message: "Unknown machine" });
        }

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

            const reels = spinReels(machine);
            const { multiplier, jackpot } = resultFor(machine, reels);
            const payout = jackpot ? await XenCasino.getJackpotPool(machine.slug, machine.jackpotSeed) : wager * multiplier;

            const debitKey = `xendelta-slots-${machine.slug}-start-${userId}-${crypto.randomUUID()}`;
            let round;
            try {
                round = await XenCasinoRound.startRound({
                    game: machine.slug,
                    userId,
                    wager,
                    debitKey,
                    playerAccountId: resolved.account.accountId,
                    conditions: { reels, multiplier, jackpot, payout } as SpinConditions,
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
                    note: `${machine.slug}_wager`,
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
            const settled = await settleRound(machine, round);
            await XenCasinoRound.resolve(round._id);

            return res.json({ status: true, data: { reels, multiplier, jackpot, payout, balance: settled.balance ?? debitBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });
};
