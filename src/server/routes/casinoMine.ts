/**
 * Chip Mine - a dark, side-view shaft the player actively digs into, one direction at a
 * time, off a daily dig allowance. Moving through tunnels you've already cleared is
 * always free (no dig spent, no risk); only pushing into new, undug territory is a real
 * dig. Digging down consumes a ladder and enters a higher risk band (cave-in chance keyed
 * to the new depth); digging sideways needs no ladder and stays at the current depth's
 * risk band. Every tile ever dug stays visible permanently - no fog ever re-covers your
 * own history. There's no passive/automatic scouting - a Flare is the only way to preview
 * a tile (its gem tier, or whether it's heavy stone) before committing to dig it.
 * Movement/dig resolution, the gem-tier roll, and the ore/cave-in/stone-by-depth formulas
 * all live in XenCasinoMineState (src/server/models/xenCasino.js); this route owns
 * equipment/flare/reset prices, the gem payout $ amounts, and every money movement.
 * There's no persistent pickaxe/torch "level" to grind - the daily dig cap is flat, and
 * every boost is single-use, bought fresh each time: Explosives blast through the daily
 * cap, a missing ladder, and/or heavy stone (any combination at once); a Reinforcement is
 * a shield that stays armed until it actually blocks a cave-in; a Flare buys one 3x3
 * scouting reveal around your current position.
 */
import express = require("express");
import { authenticateToken } from "../middleware/auth";
import { AuthenticatedRequest } from "../types/AuthenticatedRequest";
const { User } = require("../models/user");
const { XenCasinoMineState, XenCasinoActivity, MINE_OUTCOME, MINE_ORE_TIERS } = require("../models/xenCasino");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../utils/weeabetsClient";
import { requireGameEnabled } from "../utils/casinoStatus";
import { recordCasinoRoundPlayed } from "../utils/dailyQuest";

const SLUG = "mine";
const BASE_DAILY_DIG_CAP = 15;

const LADDER_COST = 500;
const LADDER_BATCH = 1;
const DIG_COST = 200; // charged per real dig attempt (never for a free move through a cleared tunnel), regardless of what's found
const EXPLOSIVE_COST = 750; // single-use - blasts through the daily dig cap, a missing ladder, and/or heavy stone, any combination at once
const REINFORCEMENT_COST = 600; // single-use shield - stays armed until it actually blocks a cave-in
const FLARE_COST = 1000; // single-use - the only way to preview a tile before digging it, bought fresh each time
const MINE_FLARE_RADIUS = 1; // a 3x3 area around the current position
const MAP_RESET_COST = 2000; // deliberate "start over" fee, not a free escape hatch

// The $ value multiplier per gem tier - MINE_ORE_TIERS (model-owned) defines which tiers
// exist and at what depth/rarity they're findable; this table is the route-owned pricing
// on top of that, same split as everywhere else in this file (structural vs economics).
const MINE_ORE_TIER_VALUE: Record<string, number> = {
    copper: 1,
    silver: 2,
    gold: 4,
    emerald: 8,
    ruby: 14,
    diamond: 25,
};

// The actual $ payout for a struck gem - pure pricing, unlike which tier it is (a
// structural/depth question the model already resolves). The base scales with depth same
// as before; the tier multiplier is what makes rarer finds actually worth more.
function oreValueForDepth(depth: number, tier: string): number {
    const base = 200 + depth * 60;
    const multiplier = MINE_ORE_TIER_VALUE[tier] ?? 1;
    return Math.round(base * multiplier * (0.7 + Math.random() * 1.1));
}

function stateView(doc: any) {
    // Every tile the player has ever dug, scouted, or been blocked by stays visible
    // permanently - you already know what's there, no fog should ever re-cover it.
    // `status` tells the client whether a tile is a Flare preview ("scouted"), known
    // heavy stone ("blocked"), actually dug ("mined"), or a cave-in marker ("collapsed").
    return {
        position: { x: doc.positionX, y: doc.positionY },
        digsToday: doc.digsToday,
        dailyDigCap: BASE_DAILY_DIG_CAP,
        ladderCount: doc.ladderCount,
        explosiveCount: doc.explosiveCount,
        reinforcementCount: doc.reinforcementCount,
        deepestDepthReached: doc.deepestDepthReached,
        bestGemTier: doc.bestGemTier,
        revealedTiles: doc.dugTiles.map((t: any) => ({ x: t.x, y: t.y, oreTier: t.oreTier, isHeavyStone: t.isHeavyStone, status: t.status })),
        prices: {
            dig: { cost: DIG_COST },
            ladder: { cost: LADDER_COST, amount: LADDER_BATCH },
            explosive: { cost: EXPLOSIVE_COST, amount: 1 },
            reinforcement: { cost: REINFORCEMENT_COST, amount: 1 },
            flare: { cost: FLARE_COST, radius: MINE_FLARE_RADIUS },
            reset: { cost: MAP_RESET_COST },
        },
        // For the client's legend/odds display - which gem tiers exist, at what depth
        // they start showing up, and what they're worth relative to Copper.
        oreTiers: MINE_ORE_TIERS.map((t: any) => ({ key: t.key, label: t.label, minDepth: t.minDepth, valueMultiplier: MINE_ORE_TIER_VALUE[t.key] ?? 1 })),
    };
}

module.exports = function (app: express.Application) {

    app.get("/api/casino/mine", authenticateToken, async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const doc = await XenCasinoMineState.getState(userId);
        return res.json({ status: true, data: stateView(doc) });
    });

    app.post("/api/casino/mine/dig", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { direction } = req.body as { direction: "up" | "down" | "left" | "right" };
        if (!["up", "down", "left", "right"].includes(direction)) {
            return res.status(400).json({ status: false, message: "Invalid direction" });
        }

        const user = await User.findById(userId).exec();
        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }

        // Moving into an already-mined tile (or "up", which is only ever that) is always
        // free - skip the per-dig fee entirely rather than charging and refunding it.
        const before = await XenCasinoMineState.getState(userId);
        const targetX = before.positionX + (direction === "left" ? -1 : direction === "right" ? 1 : 0);
        const targetY = before.positionY + (direction === "down" ? 1 : direction === "up" ? -1 : 0);
        const existingTarget = before.dugTiles.find((t: any) => t.x === targetX && t.y === targetY);
        const isFreeMove = direction === "up" ? true : !!existingTarget && existingTarget.status === "mined";

        if (isFreeMove) {
            const result = await XenCasinoMineState.applyDig(userId, { direction, dailyDigCap: BASE_DAILY_DIG_CAP });
            if (result.error) {
                return res.status(400).json({ status: false, message: "You can't go that way" });
            }
            const freshDoc = await XenCasinoMineState.getState(userId);
            return res.json({
                status: true,
                data: { outcome: result.outcome, payout: 0, usedExplosive: false, state: stateView(freshDoc) },
            });
        }

        // A real dig attempt costs a flat fee up front, regardless of what's found -
        // refunded if the attempt turns out to be blocked (cap/ladder/stone) with nothing
        // to clear it.
        try {
            const resolved = await resolveUserAccount(user);
            if (!resolved.linked || !resolved.account) {
                return res.status(400).json({ status: false, message: "Link your Discord account to play" });
            }
            const xenCasinoAccountId = await getXenCasinoAccountId();
            const chargeResult = await transfer({
                fromAccountId: resolved.account.accountId,
                toAccountId: xenCasinoAccountId,
                amount: DIG_COST.toFixed(10),
                key: `mine-dig-${userId}-${Date.now()}`,
                note: "mine_dig",
            });

            const result = await XenCasinoMineState.applyDig(userId, { direction, dailyDigCap: BASE_DAILY_DIG_CAP });

            if (result.error) {
                await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: resolved.account.accountId,
                    amount: DIG_COST.toFixed(10),
                    key: `mine-dig-refund-${userId}-${Date.now()}`,
                    note: "mine_dig_refund",
                });
                const message =
                    result.error === "no_digs_remaining" ? "No digs remaining today - buy an Explosive to blast through" :
                    result.error === "no_ladders" ? "No ladders left - buy more to descend, or use an Explosive to blast through" :
                    result.error === "blocked_by_stone" ? "Heavy duty stone blocks the way - you'll need an Explosive to clear it" :
                    result.error === "blocked_by_collapse" ? "A cave-in has permanently blocked this tunnel - you'll have to dig around it" :
                    "You can't go that way";
                return res.status(400).json({ status: false, message });
            }

            // A stone-clearing dig resolves with no gem possible - same "no payout"
            // response shape as an empty dig, both still charged the flat dig fee above.
            if (result.outcome !== MINE_OUTCOME.ORE) {
                await recordCasinoRoundPlayed(userId, { game: SLUG, wager: DIG_COST, payout: 0 });
                const freshDoc = await XenCasinoMineState.getState(userId);
                return res.json({
                    status: true,
                    data: { outcome: result.outcome, payout: 0, usedExplosive: result.usedExplosive, balance: chargeResult.fromNewBalance, state: stateView(freshDoc) },
                });
            }

            const payout = oreValueForDepth(result.targetY, result.oreTier);
            const payoutResult = await transfer({
                fromAccountId: xenCasinoAccountId,
                toAccountId: resolved.account.accountId,
                amount: payout.toFixed(10),
                key: `mine-ore-${userId}-${result.position.x}-${result.position.y}-${Date.now()}`,
                note: `mine_ore_${result.oreTier}`,
            });
            await recordCasinoRoundPlayed(userId, { game: SLUG, wager: DIG_COST, payout });
            const freshDoc = await XenCasinoMineState.getState(userId);
            return res.json({
                status: true,
                data: {
                    outcome: result.outcome,
                    oreTier: result.oreTier,
                    payout,
                    usedExplosive: result.usedExplosive,
                    balance: payoutResult.toNewBalance,
                    state: stateView(freshDoc),
                },
            });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    app.post("/api/casino/mine/buy-equipment", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { item } = req.body as { item: "ladder" | "explosive" | "reinforcement" };
        const cost = item === "ladder" ? LADDER_COST : item === "explosive" ? EXPLOSIVE_COST : item === "reinforcement" ? REINFORCEMENT_COST : null;
        if (!cost) {
            return res.status(400).json({ status: false, message: "Invalid equipment item" });
        }

        const user = await User.findById(userId).exec();
        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }

        try {
            const resolved = await resolveUserAccount(user);
            if (!resolved.linked || !resolved.account) {
                return res.status(400).json({ status: false, message: "Link your Discord account to play" });
            }

            const xenCasinoAccountId = await getXenCasinoAccountId();
            const result = await transfer({
                fromAccountId: resolved.account.accountId,
                toAccountId: xenCasinoAccountId,
                amount: cost.toFixed(10),
                key: `mine-buy-${item}-${userId}-${Date.now()}`,
                note: `mine_buy_${item}`,
            });

            const amount = item === "ladder" ? LADDER_BATCH : 1;
            const doc = await XenCasinoMineState.addEquipment(userId, item, amount);
            await XenCasinoActivity.record({ game: SLUG, userId, wager: cost, payout: 0 });

            return res.json({ status: true, data: { state: stateView(doc), balance: result.fromNewBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    // Buy = immediately use: a Flare isn't stored in inventory, it's a one-off 3x3
    // scouting reveal around the current position, bought fresh each time.
    app.post("/api/casino/mine/flare", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
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

            const xenCasinoAccountId = await getXenCasinoAccountId();
            const result = await transfer({
                fromAccountId: resolved.account.accountId,
                toAccountId: xenCasinoAccountId,
                amount: FLARE_COST.toFixed(10),
                key: `mine-flare-${userId}-${Date.now()}`,
                note: "mine_flare",
            });

            const doc = await XenCasinoMineState.useFlare(userId, MINE_FLARE_RADIUS);
            await XenCasinoActivity.record({ game: SLUG, userId, wager: FLARE_COST, payout: 0 });

            return res.json({ status: true, data: { state: stateView(doc), balance: result.fromNewBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    // Wipes the whole dug map and returns to the shaft entrance for a flat fee - equipment
    // inventory and today's dig count are untouched, only the map layout/position reset.
    app.post("/api/casino/mine/reset", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
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

            const xenCasinoAccountId = await getXenCasinoAccountId();
            const result = await transfer({
                fromAccountId: resolved.account.accountId,
                toAccountId: xenCasinoAccountId,
                amount: MAP_RESET_COST.toFixed(10),
                key: `mine-reset-${userId}-${Date.now()}`,
                note: "mine_reset",
            });

            const doc = await XenCasinoMineState.resetMap(userId);
            await XenCasinoActivity.record({ game: SLUG, userId, wager: MAP_RESET_COST, payout: 0 });

            return res.json({ status: true, data: { state: stateView(doc), balance: result.fromNewBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

};
