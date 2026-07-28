/**
 * Chip Mine - a dark, side-view shaft the player actively digs into, one direction at a
 * time, off a daily dig allowance. Digging down consumes a ladder and enters a higher
 * risk band (cave-in chance keyed to the new depth); digging sideways needs no ladder and
 * stays at the current depth's risk band. Every tile ever dug stays visible permanently -
 * no fog ever re-covers your own history. Torches instead scout a preview (ore or not) of
 * not-yet-dug neighboring tiles as you move, one unit of fuel per newly revealed tile;
 * cave-in risk is never previewable. Position/quota/equipment bookkeeping, the dig roll,
 * and the ore/cave-in/torch-radius formulas all live in XenCasinoMineState
 * (src/server/models/xenCasino.js); this route owns equipment/upgrade prices, the ore
 * payout $ amount, and every money movement.
 */
import express = require("express");
import { authenticateToken } from "../middleware/auth";
import { AuthenticatedRequest } from "../types/AuthenticatedRequest";
const { User } = require("../models/user");
const { XenCasinoMineState, MINE_OUTCOME, mineTorchRadiusFor } = require("../models/xenCasino");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../utils/weeabetsClient";
import { requireGameEnabled } from "../utils/casinoStatus";

const SLUG = "mine";
const MAX_PICKAXE_LEVEL = 5;
const MAX_TORCH_LEVEL = 5;
const BASE_DAILY_DIG_CAP = 15;
const DIG_CAP_PER_PICKAXE_LEVEL = 5;

const LADDER_COST = 200;
const LADDER_BATCH = 5;
const TORCH_COST = 150;
const TORCH_BATCH_FUEL = 15;
const PICKAXE_UPGRADE_COST = 6000;
const TORCH_UPGRADE_COST = 4000;

// The actual $ payout for a struck-ore tile - pure pricing, unlike whether the tile has
// ore at all (a structural/depth question the model already resolves).
function oreValueForDepth(depth: number): number {
    const base = 200 + depth * 60;
    return Math.round(base * (0.7 + Math.random() * 1.1));
}

function dailyDigCapFor(doc: any): number {
    return BASE_DAILY_DIG_CAP + (doc.pickaxeLevel - 1) * DIG_CAP_PER_PICKAXE_LEVEL;
}

function stateView(doc: any) {
    // Every tile the player has ever dug or scouted stays visible permanently, regardless
    // of current position or torch fuel - you already know what's there, no fog should
    // ever re-cover it. `status` tells the client whether a tile is just a torch preview
    // ("scouted"), actually dug ("mined"), or a cave-in marker ("collapsed").
    return {
        position: { x: doc.positionX, y: doc.positionY },
        digsToday: doc.digsToday,
        dailyDigCap: dailyDigCapFor(doc),
        ladderCount: doc.ladderCount,
        torchFuel: doc.torchFuel,
        pickaxeLevel: doc.pickaxeLevel,
        torchLevel: doc.torchLevel,
        maxPickaxeLevel: MAX_PICKAXE_LEVEL,
        maxTorchLevel: MAX_TORCH_LEVEL,
        visibilityRadius: mineTorchRadiusFor(doc),
        revealedTiles: doc.dugTiles.map((t: any) => ({ x: t.x, y: t.y, hasOre: t.hasOre, status: t.status })),
        prices: {
            ladder: { cost: LADDER_COST, amount: LADDER_BATCH },
            torch: { cost: TORCH_COST, amount: TORCH_BATCH_FUEL },
            pickaxeUpgrade: PICKAXE_UPGRADE_COST,
            torchUpgrade: TORCH_UPGRADE_COST,
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

        const doc = await XenCasinoMineState.getState(userId);
        const result = await XenCasinoMineState.applyDig(userId, {
            direction,
            dailyDigCap: dailyDigCapFor(doc),
        });

        if (result.error === "no_digs_remaining") {
            return res.status(400).json({ status: false, message: "No digs remaining today" });
        }
        if (result.error === "no_ladders") {
            return res.status(400).json({ status: false, message: "No ladders left - buy more to descend" });
        }

        if (result.outcome !== MINE_OUTCOME.ORE) {
            const freshDoc = await XenCasinoMineState.getState(userId);
            return res.json({ status: true, data: { outcome: result.outcome, payout: 0, state: stateView(freshDoc) } });
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
            const freshDoc = await XenCasinoMineState.getState(userId);
            return res.json({
                status: true,
                data: { outcome: result.outcome, payout, balance: transferResult.toNewBalance, state: stateView(freshDoc) },
            });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    app.post("/api/casino/mine/buy-equipment", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { item } = req.body as { item: "ladder" | "torch" };
        const cost = item === "ladder" ? LADDER_COST : item === "torch" ? TORCH_COST : null;
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

            const amount = item === "ladder" ? LADDER_BATCH : TORCH_BATCH_FUEL;
            const doc = await XenCasinoMineState.addEquipment(userId, item, amount);

            return res.json({ status: true, data: { state: stateView(doc), balance: result.fromNewBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    app.post("/api/casino/mine/upgrade", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { upgrade } = req.body as { upgrade: "pickaxe" | "torch" };
        if (upgrade !== "pickaxe" && upgrade !== "torch") {
            return res.status(400).json({ status: false, message: "Invalid upgrade" });
        }
        const cost = upgrade === "pickaxe" ? PICKAXE_UPGRADE_COST : TORCH_UPGRADE_COST;
        const maxLevel = upgrade === "pickaxe" ? MAX_PICKAXE_LEVEL : MAX_TORCH_LEVEL;

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
                key: `mine-upgrade-${upgrade}-${userId}-${Date.now()}`,
                note: `mine_upgrade_${upgrade}`,
            });

            const newLevel = await XenCasinoMineState.upgrade(userId, upgrade, maxLevel);
            if (newLevel === null) {
                await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: resolved.account.accountId,
                    amount: cost.toFixed(10),
                    key: `mine-upgrade-refund-${upgrade}-${userId}-${Date.now()}`,
                    note: `mine_upgrade_${upgrade}_refund`,
                });
                return res.status(400).json({ status: false, message: "Already at max level" });
            }

            return res.json({ status: true, data: { level: newLevel, balance: result.fromNewBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

};
