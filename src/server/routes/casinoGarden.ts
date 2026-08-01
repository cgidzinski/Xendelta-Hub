/**
 * Casino Garden - a 3x3 grid, one seed per square, growing in parallel. Each seed tier has
 * its own cost, watering amount, vermin/disease risk, and payout curve - so "different
 * plant, different game" rather than one economy with cosmetic reskins. Watering a square
 * is on a base 1-hour-per-square cooldown (GARDEN_WATER_COOLDOWN_MS), shorter once
 * bonemeal has been bought for that square (see effectiveWaterCooldownMs). There's no
 * penalty at all for the first 24h a square goes unwatered; past that, it loses one
 * delivered watering every hour until it's rewatered or runs out and dies. Unprotected
 * squares also roll a vermin (adds one more required watering) or disease (doubles the
 * daily decay rate — fungicide cures) chance once per cooldown tick, countered by
 * purchasable pesticide/fungicide - each is a shield that stays up through any number of
 * misses and is only consumed the moment it actually blocks a hit, not a one-shot that
 * expires on the very next check regardless.
 * Fertilizer instead shortens the remaining waterings needed; bonemeal speeds up every
 * watering cooldown on that square from then on. A square is ready once it's received
 * its required number of waterings. Harvest pays cost *
 * baseMultiplier * a random swing of +/- variance - the guaranteed baseline is the
 * tier's baseMultiplier, the variance is how much casino luck can move it either
 * direction. A dead square (from decay or disease) needs a paid cleanup before replanting.
 * Square lifecycle (cooldown, hazard tick loop, neglect decay, ready/dead transitions)
 * lives in XenCasinoGardenState (src/server/models/xenCasino.js); this route owns the
 * seed/item economics (snapshotted onto each square at plant time) and every money movement.
 */
import express = require("express");
import { authenticateToken } from "../middleware/auth";
import { AuthenticatedRequest } from "../types/AuthenticatedRequest";
const { User } = require("../models/user");
const {
    XenCasinoGardenState,
    XenCasinoActivity,
    GARDEN_WATER_COOLDOWN_MS,
    GARDEN_NEGLECT_GRACE_MS,
    effectiveWaterCooldownMs,
} = require("../models/xenCasino");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../utils/weeabetsClient";
import { requireGameEnabled } from "../utils/casinoStatus";
import { recordCasinoRoundPlayed } from "../utils/dailyQuest";

const SLUG = "garden";

interface SeedTier {
    key: string;
    label: string;
    cost: number;
    growDurationMs: number; // waterAmount * GARDEN_WATER_COOLDOWN_MS - "earliest possible" display only, waterCount is the real gate
    waterAmount: number; // total waterings required to mature (a vermin hit adds +1)
    verminChance: number; // per cooldown tick, while unprotected -— doubles decay rate (no longer kills)required waterings
    diseaseChance: number; // per cooldown tick, while unprotected - kills outright
    baseMultiplier: number; // guaranteed baseline of harvest payout = cost * baseMultiplier
    variance: number; // harvest payout swings +/- this fraction around the baseline
}

function seedTier(params: Omit<SeedTier, "growDurationMs">): SeedTier {
    return { ...params, growDurationMs: params.waterAmount * GARDEN_WATER_COOLDOWN_MS };
}

// Four genuinely different plants, not one economy reskinned four times:
//  - Sprout: cheap, low risk, few waterings needed, modest guaranteed-ish payout.
//  - Lucky Clover: mid cost/risk, the "luck" plant - widest variance of the bunch.
//  - Nightshade: cheap-ish but high-maintenance and high-risk (the highest vermin/disease
//    chance per check) - a strong base multiplier is the compensation.
//  - Golden Vine: the expensive slow-grower (most waterings needed), moderate risk,
//    biggest base multiplier and widest variance - the true high-roller plant.
export const SEED_TIERS: Record<string, SeedTier> = {
    sprout: seedTier({ key: "sprout", label: "Sprout", cost: 1000, waterAmount: 2, verminChance: 0.05, diseaseChance: 0.02, baseMultiplier: 1.3, variance: 0.3 }),
    clover: seedTier({ key: "clover", label: "Lucky Clover", cost: 4000, waterAmount: 4, verminChance: 0.08, diseaseChance: 0.03, baseMultiplier: 1.6, variance: 0.6 }),
    nightshade: seedTier({ key: "nightshade", label: "Nightshade", cost: 7000, waterAmount: 5, verminChance: 0.15, diseaseChance: 0.08, baseMultiplier: 2.2, variance: 0.4 }),
    "golden-vine": seedTier({ key: "golden-vine", label: "Golden Vine", cost: 16000, waterAmount: 10, verminChance: 0.1, diseaseChance: 0.05, baseMultiplier: 3.0, variance: 0.9 }),
};

// "fertilizer" and "bonemeal" are handled specially by XenCasinoGardenState.protect -
// fertilizer reduces waterAmount by 1 instead of blocking a hazard like pesticide/fungicide
// do, and bonemeal speeds up the square's watering cooldown from then on (25% - see
// GARDEN_BONEMEAL_GROWTH_BOOST in the model).
const PROTECTION_COST: Record<"pesticide" | "fungicide" | "fertilizer" | "bonemeal", number> = {
    pesticide: 600,
    fungicide: 800,
    fertilizer: 700,
    bonemeal: 1200,
};

// Charged to clear out a dead plot (from decay) before it can be replanted.
const GARDEN_CLEANUP_FEE = 1000;

// Idempotency keys are capped at 64 chars by the transfer API - "fertilizer" pushed the
// protect key over that limit, so every item gets a short form just for the key string.
const PROTECT_KEY_ABBR: Record<"pesticide" | "fungicide" | "fertilizer" | "bonemeal", string> = {
    pesticide: "pest",
    fungicide: "fung",
    fertilizer: "fert",
    bonemeal: "bone",
};

function squareView(square: any) {
    return {
        squareId: square.squareId,
        seedType: square.seedType,
        seedLabel: square.seedType ? SEED_TIERS[square.seedType]?.label : null,
        plantedAt: square.plantedAt,
        readyAt: square.readyAt,
        lastWateredAt: square.lastWateredAt,
        waterAmount: square.waterAmount,
        waterCount: square.waterCount,
        verminHits: square.verminHits,
        // Per-square, not the global base - shorter than GARDEN_WATER_COOLDOWN_MS once
        // bonemeal has been applied to this crop.
        waterCooldownMs: effectiveWaterCooldownMs(square),
        cost: square.cost,
        baseMultiplier: square.baseMultiplier,
        variance: square.variance,
        verminChance: square.verminChance,
        diseaseChance: square.diseaseChance,
        diseased: square.diseased,
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
            data: {
                squares: doc.squares.map(squareView),
                seedTiers: Object.values(SEED_TIERS),
                protectionCost: PROTECTION_COST,
                waterCooldownMs: GARDEN_WATER_COOLDOWN_MS,
                neglectGraceMs: GARDEN_NEGLECT_GRACE_MS,
                cleanupFee: GARDEN_CLEANUP_FEE,
            },
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

            await XenCasinoActivity.record({ game: SLUG, userId, wager: tier.cost, payout: 0 });

            return res.json({ status: true, data: { square: squareView(square), balance: result.fromNewBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    app.post("/api/casino/garden/water", authenticateToken, async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { squareId } = req.body as { squareId: number };

        const state = await XenCasinoGardenState.getState(userId);
        const before = state.squares.find((s: any) => s.squareId === squareId);
        if (before && before.status === "growing" && before.lastWateredAt) {
            const cooldownMs = effectiveWaterCooldownMs(before);
            const msSinceWatered = Date.now() - new Date(before.lastWateredAt).getTime();
            if (msSinceWatered < cooldownMs) {
                return res.status(400).json({
                    status: false,
                    message: `Still on cooldown - wait ${Math.ceil((cooldownMs - msSinceWatered) / 60000)}m before watering again`,
                });
            }
        }

        const square = await XenCasinoGardenState.water(userId, squareId);
        if (!square) {
            return res.status(400).json({ status: false, message: "Nothing to water here" });
        }
        return res.json({ status: true, data: { square: squareView(square) } });
    });

    app.post("/api/casino/garden/protect", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { squareId, item } = req.body as { squareId: number; item: "pesticide" | "fungicide" | "fertilizer" | "bonemeal" };
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
                key: `garden-protect-${userId}-${squareId}-${PROTECT_KEY_ABBR[item]}-${Date.now()}`,
                note: `garden_protect_${item}`,
            });

            const square = await XenCasinoGardenState.protect(userId, squareId, item);
            if (!square) {
                await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: resolved.account.accountId,
                    amount: cost.toFixed(10),
                    key: `garden-protect-rf-${userId}-${squareId}-${PROTECT_KEY_ABBR[item]}-${Date.now()}`,
                    note: "garden_protect_refund",
                });
                return res.status(400).json({ status: false, message: "Nothing growing here to protect" });
            }

            await XenCasinoActivity.record({ game: SLUG, userId, wager: cost, payout: 0 });

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
            await recordCasinoRoundPlayed(userId, { game: SLUG, wager: 0, payout });

            return res.json({ status: true, data: { payout, balance: result.toNewBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    app.post("/api/casino/garden/clear", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { squareId } = req.body as { squareId: number };

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
                amount: GARDEN_CLEANUP_FEE.toFixed(10),
                key: `garden-clear-${userId}-${squareId}-${Date.now()}`,
                note: "garden_clear_dead",
            });

            const square = await XenCasinoGardenState.clearDeadSquare(userId, squareId);
            if (!square) {
                await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: resolved.account.accountId,
                    amount: GARDEN_CLEANUP_FEE.toFixed(10),
                    key: `garden-clear-refund-${userId}-${squareId}-${Date.now()}`,
                    note: "garden_clear_refund",
                });
                return res.status(400).json({ status: false, message: "Nothing dead to clear here" });
            }

            await XenCasinoActivity.record({ game: SLUG, userId, wager: GARDEN_CLEANUP_FEE, payout: 0 });

            return res.json({ status: true, data: { square: squareView(square), balance: result.fromNewBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

};
