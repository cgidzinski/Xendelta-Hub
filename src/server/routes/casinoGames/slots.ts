/**
 * Slots — generic weighted 3-reel engine for Easy Spin (SpinMania moved to its own 5x3
 * cascading-grid engine, see spinmania.ts/spinmaniaGrid.ts - a genuinely different game
 * shape, not a config variant of this one). A machine is just an entry in `MACHINES`: its
 * own symbol weights, its own paytable, its own jackpot contribution rate/seed. Adding
 * another 3-reel machine is one new `MACHINES` entry plus one new frontend page (see
 * `SlotMachine.tsx` on the client) - nothing else in this file changes. Routes are
 * parameterized by `:machine` (`/api/casino/games/slots/:machine/odds`, `/spin`) and 404
 * on an unknown slug.
 *
 * Symbols are plain generic keys, not themed names - this file never says "cherry" or
 * "seven". Two keys are reserved and carry special meaning, shared by every machine:
 *   - `JACKPOT_ITEM`: a triple of this symbol is the jackpot, no matter which machine.
 *   - `ITEM_A`: exactly two of this symbol (the third being anything else) is the minor
 *     "two of a kind" partial-match bonus.
 * Every other symbol (`ITEM_B`, `ITEM_C`, `ITEM_D`, ...) just needs a weight and, if it
 * pays on a triple, an entry in `tripleMultipliers` - the frontend owns 100% of what each
 * key actually looks like (its own `symbols: Record<string, string>` emoji/icon map passed
 * into `SlotMachine`). The backend only ever deals in these generic keys and the odds math
 * built from them.
 *
 * Each machine's paytable + jackpot contribution rate is solved (not guessed) for its
 * documented `targetRtp` - see the comment on each `MACHINES` entry for the math.
 *
 * Jackpots are per-machine: `XenCasino.slotsJackpotPools` is a Map keyed by machine slug,
 * so a jackpot hit on one machine only resets that machine's own pool. The jackpot pool
 * itself is local bookkeeping - that wager money already sits in XenCasino's real
 * Weeabets balance the moment it's lost; only the jackpot *payout* triggers an actual
 * transfer. Settlement itself (the payout transfer + pool update) is shared with
 * spinmania.ts via slotsSettlement.ts - the one deliberate point of code sharing between
 * the two engines, since it has no opinion about reel shape.
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
const mongoose = require("mongoose");
import { resolveUserAccount, getXenCasinoAccountId, transfer, WeeabetsUnavailable, WeeabetsTransferError } from "../../utils/weeabetsClient";
import { recordCasinoRoundPlayed } from "../../utils/dailyQuest";
import { requireGameEnabled } from "../../utils/casinoStatus";
import { settleSlotsRound } from "./slotsSettlement";
import { drawWeighted } from "../../utils/weightedDraw";

type SlotSymbol = string;

// Reserved keys every machine's `symbolWeights` may use - see the file-level comment.
const JACKPOT_ITEM = "JACKPOT_ITEM";
const MINOR_ITEM = "ITEM_A";
const WILDCARD = "OTHER"; // the "any other symbol" slot in the two-of-a-kind paytable row

interface SpinConditions {
    reels: [SlotSymbol, SlotSymbol, SlotSymbol];
    multiplier: number;
    jackpot: boolean;
    payout: number;
}

interface MachineConfig {
    slug: string;
    symbolWeights: { symbol: SlotSymbol; weight: number }[];
    tripleMultipliers: Record<string, number>;
    twoOfAKindMultiplier: number; // payout for exactly two MINOR_ITEM + one other
    jackpotContributionRate: number;
    jackpotSeed: number;
    targetRtp: number;
}

const MACHINES: Record<string, MachineConfig> = {
    // Friendlier, low-stakes machine - jackpot weight raised 3->5 of 100 (odds
    // 1-in-37,037 -> 1-in-8,000) by trimming ITEM_A 40->38, then the paytable re-solved
    // for a higher blended RTP than before:
    //   EV from the ordinary paytable alone = 91.72%
    //   + 3.5% of every wager routed into the jackpot pool (contribution rate ~= its own
    //     long-run RTP contribution, since every dollar contributed is eventually paid
    //     back out to whoever hits the jackpot, so a rarer/commoner jackpot doesn't move
    //     this number by itself)
    //   = 95.2% blended RTP, i.e. ~4.8% house edge. Jackpot 1-in-8,000, resets to 0 (no
    //   floor) after a hit.
    "easy-spin": {
        slug: "easy-spin",
        symbolWeights: [
            { symbol: MINOR_ITEM, weight: 38 },
            { symbol: "ITEM_B", weight: 30 },
            { symbol: "ITEM_C", weight: 18 },
            { symbol: "ITEM_D", weight: 9 },
            { symbol: JACKPOT_ITEM, weight: 5 },
        ],
        tripleMultipliers: { ITEM_D: 40.5, ITEM_C: 16, ITEM_B: 7, [MINOR_ITEM]: 3.2 },
        twoOfAKindMultiplier: 1.6,
        jackpotContributionRate: 0.035,
        jackpotSeed: 0,
        targetRtp: 0.952,
    },
};

// A round's outcome (and thus its payout) is fully decided before it's even persisted, so
// "stale" only ever means "the process died mid-settlement" - the sweep below finishes it.
const ROUND_TTL_MS = 30 * 1000;

function totalWeight(machine: MachineConfig): number {
    return machine.symbolWeights.reduce((sum, s) => sum + s.weight, 0);
}

function weightOf(machine: MachineConfig, symbol: SlotSymbol): number {
    return machine.symbolWeights.find((s) => s.symbol === symbol)?.weight ?? 0;
}

function drawSymbol(machine: MachineConfig): SlotSymbol {
    return drawWeighted(machine.symbolWeights.map((s) => ({ value: s.symbol, weight: s.weight })));
}

function spinReels(machine: MachineConfig): [SlotSymbol, SlotSymbol, SlotSymbol] {
    return [drawSymbol(machine), drawSymbol(machine), drawSymbol(machine)];
}

function resultFor(machine: MachineConfig, reels: [SlotSymbol, SlotSymbol, SlotSymbol]): { multiplier: number; jackpot: boolean } {
    const [a, b, c] = reels;
    if (a === JACKPOT_ITEM && b === JACKPOT_ITEM && c === JACKPOT_ITEM) {
        return { multiplier: 0, jackpot: true };
    }
    if (a === b && b === c) {
        return { multiplier: machine.tripleMultipliers[a] ?? 0, jackpot: false };
    }
    const minorCount = reels.filter((s) => s === MINOR_ITEM).length;
    if (minorCount === 2) {
        return { multiplier: machine.twoOfAKindMultiplier, jackpot: false };
    }
    return { multiplier: 0, jackpot: false };
}

// Thin wrapper over the shared settlement helper (see slotsSettlement.ts) - kept as its own
// function only so every call site below still reads "settleRound(machine, round)" as before.
async function settleRound(
    machine: MachineConfig,
    round: { _id: string; wager: number; playerAccountId: number; conditions: SpinConditions }
): Promise<{ balance?: string }> {
    return settleSlotsRound(machine.slug, machine.jackpotContributionRate, machine.jackpotSeed, round, round.conditions);
}

for (const machineSlug of Object.keys(MACHINES)) {
    const machine = MACHINES[machineSlug];
    scheduleStaleRoundSweep(
        machineSlug,
        ROUND_TTL_MS,
        async (round) => {
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
            await recordCasinoRoundPlayed(round.userId);
        },
        `slots(${machineSlug})`
    );
}

module.exports = function (app: express.Application) {

    app.get("/api/casino/games/slots/:machine/odds", authenticateToken, async function (req: express.Request, res: express.Response) {
        const machine = MACHINES[req.params.machine];
        if (!machine) {
            return res.status(404).json({ status: false, message: "Unknown machine" });
        }

        const jackpotPool = await XenCasino.getJackpotPool(machine.slug, machine.jackpotSeed);
        const total = totalWeight(machine);
        const p = (symbol: SlotSymbol) => weightOf(machine, symbol) / total;

        // Built entirely from this machine's own config - a machine can add/remove/rename
        // symbols freely and the paytable just follows, no hardcoded per-symbol rows here.
        // Rarest triple first (biggest prize at the top), matching how a paytable usually
        // reads.
        const nonJackpotSymbols = machine.symbolWeights.map((s) => s.symbol).filter((s) => s !== JACKPOT_ITEM);
        const byRarity = [...nonJackpotSymbols].sort((a, b) => weightOf(machine, a) - weightOf(machine, b));

        const paytable: { symbols: string[]; probability: number; multiplier?: number; jackpot?: boolean }[] = [
            { symbols: [JACKPOT_ITEM, JACKPOT_ITEM, JACKPOT_ITEM], probability: Math.pow(p(JACKPOT_ITEM), 3), jackpot: true },
            ...byRarity.map((symbol) => ({
                symbols: [symbol, symbol, symbol],
                probability: Math.pow(p(symbol), 3),
                multiplier: machine.tripleMultipliers[symbol] ?? 0,
            })),
        ];
        if (nonJackpotSymbols.includes(MINOR_ITEM)) {
            const pMinor = p(MINOR_ITEM);
            paytable.push({
                symbols: [MINOR_ITEM, MINOR_ITEM, WILDCARD],
                probability: 3 * pMinor * pMinor * (1 - pMinor),
                multiplier: machine.twoOfAKindMultiplier,
            });
        }

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

    app.post(
        "/api/casino/games/slots/:machine/spin",
        authenticateToken,
        requireGameEnabled((req) => req.params.machine),
        async function (req: express.Request, res: express.Response) {
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

            const roundId = new mongoose.Types.ObjectId();
            const debitKey = `xendelta-slots-${machine.slug}-start-${roundId}`;
            let round;
            try {
                round = await XenCasinoRound.startRound({
                    roundId,
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
            await recordCasinoRoundPlayed(userId);

            return res.json({ status: true, data: { reels, multiplier, jackpot, payout, balance: settled.balance ?? debitBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });
};
