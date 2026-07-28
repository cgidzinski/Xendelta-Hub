/**
 * Casino Garden - a 3x3 grid, one seed per square, growing in parallel. Each seed tier has
 * its own cost, grow time, watering frequency, vermin/disease risk, and payout curve - so
 * "different plant, different game" rather than one economy with cosmetic reskins. A
 * square dies if it misses a full watering interval; unprotected squares also roll a
 * vermin (delays harvest) or disease (kills) chance once per watering interval, countered
 * by purchasable pesticide/fungicide. Harvest pays cost * baseMultiplier * a random swing
 * of +/- variance - the guaranteed baseline is the tier's baseMultiplier, the variance is
 * how much casino luck can move it either direction.
 * Square lifecycle (watering deadline, hazard tick loop, ready/dead transitions) lives in
 * XenCasinoGardenState (src/server/models/xenCasino.js); this route owns the seed/item
 * economics (snapshotted onto each square at plant time) and every money movement.
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
    waterIntervalMs: number; // must be watered at least this often (a missed full interval kills it)
    verminChance: number; // per watering-interval tick, while unprotected - delays harvest
    diseaseChance: number; // per watering-interval tick, while unprotected - kills outright
    verminDelayMs: number; // how much a vermin hit pushes readyAt back
    baseMultiplier: number; // guaranteed baseline of harvest payout = cost * baseMultiplier
    variance: number; // harvest payout swings +/- this fraction around the baseline
}

// Four genuinely different plants, not one economy reskinned four times:
//  - Sprout: cheap, low risk, low-maintenance, modest guaranteed-ish payout.
//  - Lucky Clover: mid cost/risk, the "luck" plant - widest variance of the bunch.
//  - Nightshade: cheap-ish but high-maintenance and high-risk (short watering window,
//    the highest vermin/disease chance) - a strong base multiplier is the compensation.
//  - Golden Vine: the expensive slow-grower, moderate risk, biggest base multiplier and
//    widest variance - the true high-roller plant.
export const SEED_TIERS: Record<string, SeedTier> = {
    sprout: {
        key: "sprout",
        label: "Sprout",
        cost: 500,
        growDurationMs: 2 * 60 * 60 * 1000,
        waterIntervalMs: 60 * 60 * 1000,
        verminChance: 0.05,
        diseaseChance: 0.02,
        verminDelayMs: 20 * 60 * 1000,
        baseMultiplier: 1.3,
        variance: 0.3,
    },
    clover: {
        key: "clover",
        label: "Lucky Clover",
        cost: 2000,
        growDurationMs: 6 * 60 * 60 * 1000,
        waterIntervalMs: 2 * 60 * 60 * 1000,
        verminChance: 0.08,
        diseaseChance: 0.03,
        verminDelayMs: 45 * 60 * 1000,
        baseMultiplier: 1.6,
        variance: 0.6,
    },
    nightshade: {
        key: "nightshade",
        label: "Nightshade",
        cost: 3500,
        growDurationMs: 8 * 60 * 60 * 1000,
        waterIntervalMs: 90 * 60 * 1000,
        verminChance: 0.15,
        diseaseChance: 0.08,
        verminDelayMs: 60 * 60 * 1000,
        baseMultiplier: 2.2,
        variance: 0.4,
    },
    "golden-vine": {
        key: "golden-vine",
        label: "Golden Vine",
        cost: 8000,
        growDurationMs: 18 * 60 * 60 * 1000,
        waterIntervalMs: 3 * 60 * 60 * 1000,
        verminChance: 0.1,
        diseaseChance: 0.05,
        verminDelayMs: 2 * 60 * 60 * 1000,
        baseMultiplier: 3.0,
        variance: 0.9,
    },
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
        waterIntervalMs: square.waterIntervalMs,
        cost: square.cost,
        baseMultiplier: square.baseMultiplier,
        variance: square.variance,
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

            const square = await XenCasinoGardenState.plant(userId, squareId, seedType, tier);
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
        // Uses the square's own snapshotted cost/baseMultiplier/variance (set at plant
        // time), not a fresh SEED_TIERS lookup - a tier rebalance after planting never
        // changes what an already-growing crop pays out.
        const swing = (Math.random() * 2 - 1) * square.variance; // +/- variance around the baseline
        const payout = Math.round(square.cost * square.baseMultiplier * (1 + swing));

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
