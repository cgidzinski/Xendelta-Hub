/**
 * Chip Mine - a dark, side-view shaft the player actively digs into, one direction at a
 * time, off a daily dig allowance. Digging down consumes a ladder and enters a higher
 * risk band (cave-in chance keyed to the new depth); digging sideways needs no ladder and
 * stays at the current depth's risk band. Every tile ever dug stays visible permanently -
 * no fog ever re-covers your own history. Torches instead scout a preview (ore or not) of
 * not-yet-dug neighboring tiles as you move, one unit of fuel per newly revealed tile;
 * cave-in risk is never previewable. Position/quota/equipment bookkeeping, the dig roll,
 * and the ore/cave-in/torch-radius formulas all live in XenCasinoMineState
 * (src/server/models/xenCasino.js); this route owns equipment prices, the ore payout $
 * amount, and every money movement. There's no persistent pickaxe/torch "level" to grind -
 * the daily dig cap and torch radius are both flat, and the only boosts are single-use,
 * bought fresh each time: Explosives blast through once today's digs are used up, and a
 * Flare buys one wider one-off scouting pass around your current position.
 */
import express = require("express");
import { authenticateToken } from "../middleware/auth";
import { AuthenticatedRequest } from "../types/AuthenticatedRequest";
const { User } = require("../models/user");
const { XenCasinoMineState, XenCasinoActivity, MINE_OUTCOME, mineTorchRadiusFor } = require("../models/xenCasino");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../utils/weeabetsClient";
import { requireGameEnabled } from "../utils/casinoStatus";

const SLUG = "mine";
const BASE_DAILY_DIG_CAP = 15;

const LADDER_COST = 200;
const LADDER_BATCH = 5;
const TORCH_COST = 150;
const TORCH_BATCH_FUEL = 15;
const EXPLOSIVE_COST = 750; // single-use - blasts through once digsToday is at the daily cap
const FLARE_COST = 600; // single-use - one wider scouting pass around the current position, bought fresh each time
const MINE_FLARE_RADIUS = 3; // vs the base torch radius of 1

// The actual $ payout for a struck-ore tile - pure pricing, unlike whether the tile has
// ore at all (a structural/depth question the model already resolves).
function oreValueForDepth(depth: number): number {
    const base = 200 + depth * 60;
    return Math.round(base * (0.7 + Math.random() * 1.1));
}

function stateView(doc: any) {
    // Every tile the player has ever dug or scouted stays visible permanently, regardless
    // of current position or torch fuel - you already know what's there, no fog should
    // ever re-cover it. `status` tells the client whether a tile is just a torch preview
    // ("scouted"), actually dug ("mined"), or a cave-in marker ("collapsed").
    return {
        position: { x: doc.positionX, y: doc.positionY },
        digsToday: doc.digsToday,
        dailyDigCap: BASE_DAILY_DIG_CAP,
        ladderCount: doc.ladderCount,
        torchFuel: doc.torchFuel,
        explosiveCount: doc.explosiveCount,
        visibilityRadius: mineTorchRadiusFor(doc),
        revealedTiles: doc.dugTiles.map((t: any) => ({ x: t.x, y: t.y, hasOre: t.hasOre, status: t.status })),
        prices: {
            ladder: { cost: LADDER_COST, amount: LADDER_BATCH },
            torch: { cost: TORCH_COST, amount: TORCH_BATCH_FUEL },
            explosive: { cost: EXPLOSIVE_COST, amount: 1 },
            flare: { cost: FLARE_COST, radius: MINE_FLARE_RADIUS },
        },
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
        const { direction } = req.body as { direction: "down" | "left" | "right" };
        if (!["down", "left", "right"].includes(direction)) {
            return res.status(400).json({ status: false, message: "Invalid dig direction" });
        }

        const user = await User.findById(userId).exec();
        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }

        const result = await XenCasinoMineState.applyDig(userId, {
            direction,
            dailyDigCap: BASE_DAILY_DIG_CAP,
        });

        if (result.error === "no_digs_remaining") {
            return res.status(400).json({ status: false, message: "No digs remaining today" });
        }
        if (result.error === "no_ladders") {
            return res.status(400).json({ status: false, message: "No ladders left - buy more to descend" });
        }

        if (result.outcome !== MINE_OUTCOME.ORE) {
            const freshDoc = await XenCasinoMineState.getState(userId);
            return res.json({
                status: true,
                data: { outcome: result.outcome, payout: 0, usedExplosive: result.usedExplosive, state: stateView(freshDoc) },
            });
        }

        const payout = oreValueForDepth(result.targetY);
        try {
            const resolved = await resolveUserAccount(user);
            if (!resolved.linked || !resolved.account) {
                return res.status(400).json({ status: false, message: "Link your Discord account to play" });
            }
            const xenCasinoAccountId = await getXenCasinoAccountId();
            const transferResult = await transfer({
                fromAccountId: xenCasinoAccountId,
                toAccountId: resolved.account.accountId,
                amount: payout.toFixed(10),
                key: `mine-ore-${userId}-${result.position.x}-${result.position.y}-${Date.now()}`,
                note: "mine_ore_strike",
            });
            await XenCasinoActivity.record({ game: SLUG, userId, wager: 0, payout });
            const freshDoc = await XenCasinoMineState.getState(userId);
            return res.json({
                status: true,
                data: {
                    outcome: result.outcome,
                    payout,
                    usedExplosive: result.usedExplosive,
                    balance: transferResult.toNewBalance,
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
        const { item } = req.body as { item: "ladder" | "torch" | "explosive" };
        const cost = item === "ladder" ? LADDER_COST : item === "torch" ? TORCH_COST : item === "explosive" ? EXPLOSIVE_COST : null;
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

            const amount = item === "ladder" ? LADDER_BATCH : item === "torch" ? TORCH_BATCH_FUEL : 1;
            const doc = await XenCasinoMineState.addEquipment(userId, item, amount);
            await XenCasinoActivity.record({ game: SLUG, userId, wager: cost, payout: 0 });

            return res.json({ status: true, data: { state: stateView(doc), balance: result.fromNewBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    // Buy = immediately use: a Flare isn't stored in inventory, it's a one-off wider
    // scouting pass around the current position, bought fresh each time.
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

};
