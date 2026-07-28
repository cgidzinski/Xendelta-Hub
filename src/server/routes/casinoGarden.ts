/**
 * Casino Garden - a 3x3 grid, one seed per square, growing in parallel. Water daily or a
 * square dies; unprotected growing squares roll a small daily vermin (delays harvest) or
 * disease (kills) chance, countered by purchasable pesticide/fungicide. Harvest pays a
 * random multiplier on the seed's base value, same "casino luck" spirit as the other games.
 * Square lifecycle (watering deadline, hazard rolls, ready/dead transitions) lives in
 * XenCasinoGardenState (src/server/models/xenCasino.js); this route owns the seed/item
 * economics and every money movement.
 */
import express = require("express");
import { authenticateToken } from "../middleware/auth";
import { AuthenticatedRequest } from "../types/AuthenticatedRequest";
const { User } = require("../models/user");
const { XenCasinoGardenState } = require("../models/xenCasino");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../utils/weeabetsClient";
import { requireGameEnabled } from "../utils/casinoStatus";

const SLUG = "garden";

interface SeedTier {
    key: string;
    label: string;
    cost: number;
    growDurationMs: number;
    payoutMultiplierRange: [number, number]; // harvest payout = cost * random-in-range
}

// Pricier/slower seeds pay off in a wider (and higher) multiplier range - a golden-vine
// harvest can be a big win or barely break even, matching the rest of XenCasino's variance.
export const SEED_TIERS: Record<string, SeedTier> = {
    sprout: { key: "sprout", label: "Sprout", cost: 500, growDurationMs: 2 * 60 * 60 * 1000, payoutMultiplierRange: [1.1, 2] },
    clover: { key: "clover", label: "Lucky Clover", cost: 2000, growDurationMs: 6 * 60 * 60 * 1000, payoutMultiplierRange: [1, 3] },
    "golden-vine": { key: "golden-vine", label: "Golden Vine", cost: 8000, growDurationMs: 18 * 60 * 60 * 1000, payoutMultiplierRange: [0.5, 6] },
};

const PROTECTION_COST: Record<"pesticide" | "fungicide", number> = {
    pesticide: 300,
    fungicide: 400,
};

function squareView(square: any) {
    return {
        squareId: square.squareId,
        seedType: square.seedType,
        seedLabel: square.seedType ? SEED_TIERS[square.seedType]?.label : null,
        plantedAt: square.plantedAt,
        readyAt: square.readyAt,
        lastWateredAt: square.lastWateredAt,
        protection: square.protection,
        status: square.status,
    };
}

module.exports = function (app: express.Application) {

    app.get("/api/casino/garden", authenticateToken, async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const doc = await XenCasinoGardenState.getState(userId);
        return res.json({
            status: true,
            data: { squares: doc.squares.map(squareView), seedTiers: Object.values(SEED_TIERS), protectionCost: PROTECTION_COST },
        });
    });

    app.post("/api/casino/garden/plant", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { squareId, seedType } = req.body as { squareId: number; seedType: string };
        const tier = SEED_TIERS[seedType];
        if (!tier || typeof squareId !== "number") {
            return res.status(400).json({ status: false, message: "Invalid seed or square" });
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
                amount: tier.cost.toFixed(10),
                key: `garden-plant-${userId}-${squareId}-${Date.now()}`,
                note: `garden_plant_${seedType}`,
            });

            const square = await XenCasinoGardenState.plant(userId, squareId, seedType, tier.growDurationMs);
            if (!square) {
                // Debit already went through and the square turned out unavailable (raced
                // with another plant on the same square) - refund immediately rather than
                // leaving the player short with nothing planted.
                await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: resolved.account.accountId,
                    amount: tier.cost.toFixed(10),
                    key: `garden-plant-refund-${userId}-${squareId}-${Date.now()}`,
                    note: "garden_plant_refund",
                });
                return res.status(400).json({ status: false, message: "Square is not available" });
            }

            return res.json({ status: true, data: { square: squareView(square), balance: result.fromNewBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    app.post("/api/casino/garden/water", authenticateToken, async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { squareId } = req.body as { squareId: number };
        const square = await XenCasinoGardenState.water(userId, squareId);
        if (!square) {
            return res.status(400).json({ status: false, message: "Nothing to water here" });
        }
        return res.json({ status: true, data: { square: squareView(square) } });
    });

    app.post("/api/casino/garden/protect", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { squareId, item } = req.body as { squareId: number; item: "pesticide" | "fungicide" };
        const cost = PROTECTION_COST[item];
        if (!cost) {
            return res.status(400).json({ status: false, message: "Invalid protection item" });
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
                key: `garden-protect-${userId}-${squareId}-${item}-${Date.now()}`,
                note: `garden_protect_${item}`,
            });

            const square = await XenCasinoGardenState.protect(userId, squareId, item);
            if (!square) {
                await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: resolved.account.accountId,
                    amount: cost.toFixed(10),
                    key: `garden-protect-refund-${userId}-${squareId}-${item}-${Date.now()}`,
                    note: "garden_protect_refund",
                });
                return res.status(400).json({ status: false, message: "Nothing growing here to protect" });
            }

            return res.json({ status: true, data: { square: squareView(square), balance: result.fromNewBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    app.post("/api/casino/garden/harvest", authenticateToken, async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { squareId } = req.body as { squareId: number };

        const user = await User.findById(userId).exec();
        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }

        const doc = await XenCasinoGardenState.getState(userId);
        const square = doc.squares.find((s: any) => s.squareId === squareId);
        if (!square || square.status !== "ready") {
            return res.status(400).json({ status: false, message: "Nothing ready to harvest here" });
        }
        const tier = SEED_TIERS[square.seedType];
        const [minMult, maxMult] = tier.payoutMultiplierRange;
        const payout = Math.round(tier.cost * (minMult + Math.random() * (maxMult - minMult)));

        try {
            const resolved = await resolveUserAccount(user);
            if (!resolved.linked || !resolved.account) {
                return res.status(400).json({ status: false, message: "Link your Discord account to play" });
            }

            const xenCasinoAccountId = await getXenCasinoAccountId();
            const result = await transfer({
                fromAccountId: xenCasinoAccountId,
                toAccountId: resolved.account.accountId,
                amount: payout.toFixed(10),
                key: `garden-harvest-${userId}-${squareId}-${new Date(square.plantedAt).getTime()}`,
                note: `garden_harvest_${square.seedType}`,
            });

            await XenCasinoGardenState.clearHarvestedSquare(userId, squareId);

            return res.json({ status: true, data: { payout, balance: result.toNewBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    app.post("/api/casino/garden/clear", authenticateToken, async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { squareId } = req.body as { squareId: number };
        const square = await XenCasinoGardenState.clearDeadSquare(userId, squareId);
        if (!square) {
            return res.status(400).json({ status: false, message: "Nothing dead to clear here" });
        }
        return res.json({ status: true, data: { square: squareView(square) } });
    });

};
