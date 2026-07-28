/**
 * Bootleg Still - one batch at a time. Payout multiplier rises from *below* breakeven
 * toward a peak the longer the batch runs, then plateaus - collecting immediately is a
 * guaranteed loss, not free money. A separate raid-risk meter carries real risk from the
 * very first roll (never starts at 0%) and rises further the longer it's been since the
 * last bribe, seizing the batch (ingredient cost lost, no payout) at any periodic roll.
 * Bribing resets that risk but costs more each time on the same batch, so stalling near
 * peak by bribing indefinitely stops being profitable. Raid-roll bookkeeping lives in
 * XenCasinoStillState (src/server/models/xenCasino.js); this route owns
 * ingredient/bribe/upgrade economics, the payout-multiplier curve, and every money movement.
 */
import express = require("express");
import { authenticateToken } from "../middleware/auth";
import { AuthenticatedRequest } from "../types/AuthenticatedRequest";
const { User } = require("../models/user");
const { XenCasinoStillState, XenCasinoActivity, STILL_RISK_RAMP_MS, STILL_BASE_RAID_CHANCE, STILL_MAX_RAID_CHANCE } = require("../models/xenCasino");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../utils/weeabetsClient";
import { requireGameEnabled } from "../utils/casinoStatus";

const SLUG = "still";
const MAX_STILL_LEVEL = 5;
const BRIBE_COST = 1500; // cost of the first bribe on a batch - each subsequent one costs more, see nextBribeCost
const BRIBE_COST_STEP = 0.75; // +75% of the base cost per prior bribe on this batch
const UPGRADE_BASE_COST = 10000; // cost of the first upgrade (level 1 -> 2) - each further level doubles it, see stillUpgradeCost
const START_MULTIPLIER = 0; // collecting the instant a batch starts pays out nothing - not free money
const PEAK_MULTIPLIER = 4; // a batch's baseline payout ceiling before ingredients scale it (see effectivePeakMultiplier)
// Higher still levels reach peak sooner and give raid rolls more grace after a bribe -
// "go deep on one still" progression instead of running parallel batches.
const BASE_PEAK_DURATION_MS = 3 * 60 * 60 * 1000;
const PEAK_DURATION_STEP_MS = 20 * 60 * 1000; // shaved off per still level above 1
// Ingredient-driven caps so no combo (e.g. 3x the most reckless ingredient) breaks the
// house edge outright or pays out near-instantly.
const MIN_PEAK_DURATION_MS = 20 * 60 * 1000;
const MAX_EFFECTIVE_PEAK_MULTIPLIER = 15;

function peakDurationForLevel(level: number): number {
    return Math.max(45 * 60 * 1000, BASE_PEAK_DURATION_MS - (level - 1) * PEAK_DURATION_STEP_MS);
}

interface StillIngredient {
    key: string;
    label: string;
    cost: number;
    rateBonus: number; // shortens time-to-peak AND raises the peak multiplier, both from this one number
    raidBonus: number; // scales the whole raid-risk curve (see stillRaidChance in xenCasino.js)
    description: string;
}

// Six ingredients spanning safe/slow to reckless/fast. Picking the same key more than
// once is valid (e.g. 3x Wormwood for an extreme build) - bonuses/costs just sum across
// however many of each were picked. Charcoal/Copper trade rate for real safety;
// Wormwood is the high-roller pick.
const STILL_INGREDIENTS: Record<string, StillIngredient> = {
    "corn-mash": { key: "corn-mash", label: "Corn Mash", cost: 800, rateBonus: 0.1, raidBonus: 0.05, description: "Mild, dependable baseline." },
    sugar: { key: "sugar", label: "Sugar", cost: 1200, rateBonus: 0.25, raidBonus: 0.15, description: "Solid boost, moderate risk." },
    "turbo-yeast": { key: "turbo-yeast", label: "Turbo Yeast", cost: 2000, rateBonus: 0.5, raidBonus: 0.4, description: "Strong boost, real risk." },
    wormwood: { key: "wormwood", label: "Wormwood", cost: 3200, rateBonus: 1.0, raidBonus: 0.9, description: "Huge boost, huge risk - the high-roller pick." },
    charcoal: { key: "charcoal", label: "Charcoal Filter", cost: 1000, rateBonus: -0.15, raidBonus: -0.3, description: "Slower and smaller, but much safer." },
    "copper-chips": { key: "copper-chips", label: "Copper Chips", cost: 1600, rateBonus: 0.05, raidBonus: -0.45, description: "Nearly pure safety, barely touches rate." },
};

// Doubles per level: 10000 -> 20000 -> 40000 -> 80000 for levels 1->2 through 4->5.
function stillUpgradeCost(currentLevel: number): number {
    return Math.round(UPGRADE_BASE_COST * Math.pow(2, currentLevel - 1));
}

// Each bribe on the same batch costs more than the last, so babysitting a batch to peak
// by bribing indefinitely eventually costs more than the extra payout is worth.
function nextBribeCost(batch: any): number {
    return Math.round(BRIBE_COST * (1 + (batch.bribeCount || 0) * BRIBE_COST_STEP));
}

// Rises linearly from START_MULTIPLIER (a real loss if collected instantly) to this
// batch's own `peakMultiplier` (already ingredient-scaled and clamped at start time -
// see the /start handler) at peakAt, then plateaus - pure function of stored
// timestamps, never itself stored. Falls back to the global PEAK_MULTIPLIER for any
// batch that predates ingredients.
function currentMultiplier(batch: any, now: Date): number {
    const peakMultiplier = batch.peakMultiplier ?? PEAK_MULTIPLIER;
    const started = new Date(batch.startedAt).getTime();
    const peak = new Date(batch.peakAt).getTime();
    const total = peak - started;
    if (total <= 0) {
        return peakMultiplier;
    }
    const t = Math.min(1, Math.max(0, (now.getTime() - started) / total));
    return START_MULTIPLIER + (peakMultiplier - START_MULTIPLIER) * t;
}

// Mirrors stillRaidChance() in the model exactly (same constants and raidMultiplier
// scaling, imported/read rather than duplicated) so this is the real number the next
// raid roll is drawn against, not an approximation of it.
function raidRiskPercent(batch: any, now: Date): number {
    const since = now.getTime() - new Date(batch.lastBribeAt || batch.startedAt).getTime();
    const ramped = STILL_BASE_RAID_CHANCE + (since / STILL_RISK_RAMP_MS) * (STILL_MAX_RAID_CHANCE - STILL_BASE_RAID_CHANCE);
    return Math.min(STILL_MAX_RAID_CHANCE, ramped * (batch.raidMultiplier ?? 1));
}

function batchView(batch: any) {
    if (!batch) {
        return null;
    }
    const now = new Date();
    const ingredientKeys: string[] = batch.ingredientKeys || [];
    return {
        startedAt: batch.startedAt,
        ingredientCost: batch.ingredientCost,
        peakAt: batch.peakAt,
        lastBribeAt: batch.lastBribeAt,
        bribeCount: batch.bribeCount || 0,
        nextBribeCost: nextBribeCost(batch),
        raided: !!batch.raidedAt,
        currentMultiplier: batch.raidedAt ? 0 : Number(currentMultiplier(batch, now).toFixed(3)),
        raidRiskPercent: batch.raidedAt ? 0 : Number((raidRiskPercent(batch, now) * 100).toFixed(1)),
        peakMultiplier: batch.peakMultiplier ?? PEAK_MULTIPLIER,
        ingredients: ingredientKeys.map((key) => STILL_INGREDIENTS[key]?.label || key),
    };
}

module.exports = function (app: express.Application) {

    app.get("/api/casino/still", authenticateToken, async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const doc = await XenCasinoStillState.getState(userId);
        return res.json({
            status: true,
            data: {
                stillLevel: doc.stillLevel,
                maxStillLevel: MAX_STILL_LEVEL,
                batch: batchView(doc.batch),
                ingredients: Object.values(STILL_INGREDIENTS),
                // The batch's own escalated cost while one is running (see batchView.nextBribeCost)
                // - this base cost otherwise, for display before a batch has even started.
                bribeCost: doc.batch ? nextBribeCost(doc.batch) : BRIBE_COST,
                upgradeCost: stillUpgradeCost(doc.stillLevel),
            },
        });
    });

    app.post("/api/casino/still/start", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { ingredientKeys } = req.body as { ingredientKeys: string[] };
        if (!Array.isArray(ingredientKeys) || ingredientKeys.length !== 3 || ingredientKeys.some((k) => !STILL_INGREDIENTS[k])) {
            return res.status(400).json({ status: false, message: "Pick exactly 3 ingredients" });
        }
        const ingredients = ingredientKeys.map((k) => STILL_INGREDIENTS[k]);

        const user = await User.findById(userId).exec();
        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }

        try {
            const resolved = await resolveUserAccount(user);
            if (!resolved.linked || !resolved.account) {
                return res.status(400).json({ status: false, message: "Link your Discord account to play" });
            }

            const state = await XenCasinoStillState.getState(userId);
            if (state.batch) {
                return res.status(400).json({ status: false, message: "A batch is already running" });
            }

            // Sum the 3 picks' cost/rateBonus/raidBonus, then derive this batch's own
            // effective curve - same rateScale both shortens time-to-peak and raises the
            // peak multiplier, both clamped so no combo breaks the house edge outright.
            const totalCost = ingredients.reduce((sum, i) => sum + i.cost, 0);
            const sumRate = ingredients.reduce((sum, i) => sum + i.rateBonus, 0);
            const sumRaid = ingredients.reduce((sum, i) => sum + i.raidBonus, 0);
            const rateScale = Math.max(0.1, 1 + sumRate);
            const raidScale = Math.max(0, 1 + sumRaid);
            const effectivePeakDurationMs = Math.max(MIN_PEAK_DURATION_MS, peakDurationForLevel(state.stillLevel) / rateScale);
            const effectivePeakMultiplier = Math.min(MAX_EFFECTIVE_PEAK_MULTIPLIER, PEAK_MULTIPLIER * rateScale);

            const xenCasinoAccountId = await getXenCasinoAccountId();
            const result = await transfer({
                fromAccountId: resolved.account.accountId,
                toAccountId: xenCasinoAccountId,
                amount: totalCost.toFixed(10),
                key: `still-start-${userId}-${Date.now()}`,
                note: "still_start",
            });

            const batch = await XenCasinoStillState.startBatch(
                userId,
                totalCost,
                effectivePeakDurationMs,
                effectivePeakMultiplier,
                raidScale,
                ingredientKeys
            );
            if (!batch) {
                await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: resolved.account.accountId,
                    amount: totalCost.toFixed(10),
                    key: `still-start-refund-${userId}-${Date.now()}`,
                    note: "still_start_refund",
                });
                return res.status(400).json({ status: false, message: "A batch is already running" });
            }

            await XenCasinoActivity.record({ game: SLUG, userId, wager: totalCost, payout: 0 });

            return res.json({ status: true, data: { batch: batchView(batch), balance: result.fromNewBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    app.post("/api/casino/still/bribe", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
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

            const state = await XenCasinoStillState.getState(userId);
            if (!state.batch || state.batch.raidedAt) {
                return res.status(400).json({ status: false, message: "No batch to bribe for" });
            }
            const cost = nextBribeCost(state.batch);

            const xenCasinoAccountId = await getXenCasinoAccountId();
            const result = await transfer({
                fromAccountId: resolved.account.accountId,
                toAccountId: xenCasinoAccountId,
                amount: cost.toFixed(10),
                key: `still-bribe-${userId}-${Date.now()}`,
                note: "still_bribe",
            });

            const batch = await XenCasinoStillState.bribe(userId);
            if (!batch) {
                await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: resolved.account.accountId,
                    amount: cost.toFixed(10),
                    key: `still-bribe-refund-${userId}-${Date.now()}`,
                    note: "still_bribe_refund",
                });
                return res.status(400).json({ status: false, message: "No batch to bribe for" });
            }

            await XenCasinoActivity.record({ game: SLUG, userId, wager: cost, payout: 0 });

            return res.json({ status: true, data: { batch: batchView(batch), balance: result.fromNewBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    app.post("/api/casino/still/collect", authenticateToken, async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const user = await User.findById(userId).exec();
        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }

        const state = await XenCasinoStillState.getState(userId);
        if (!state.batch) {
            return res.status(400).json({ status: false, message: "No batch running" });
        }

        if (state.batch.raidedAt) {
            await XenCasinoStillState.clearBatch(userId);
            return res.json({ status: true, data: { raided: true, payout: 0 } });
        }

        const payout = Math.round(state.batch.ingredientCost * currentMultiplier(state.batch, new Date()));

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
                key: `still-collect-${userId}-${new Date(state.batch.startedAt).getTime()}`,
                note: "still_collect",
            });

            await XenCasinoStillState.clearBatch(userId);
            await XenCasinoActivity.record({ game: SLUG, userId, wager: 0, payout });

            return res.json({ status: true, data: { raided: false, payout, balance: result.toNewBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    app.post("/api/casino/still/upgrade", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
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

            const state = await XenCasinoStillState.getState(userId);
            if (state.stillLevel >= MAX_STILL_LEVEL) {
                return res.status(400).json({ status: false, message: "Still is already at max level" });
            }
            const cost = stillUpgradeCost(state.stillLevel);

            const xenCasinoAccountId = await getXenCasinoAccountId();
            const result = await transfer({
                fromAccountId: resolved.account.accountId,
                toAccountId: xenCasinoAccountId,
                amount: cost.toFixed(10),
                key: `still-upgrade-${userId}-${Date.now()}`,
                note: "still_upgrade",
            });

            const newLevel = await XenCasinoStillState.upgrade(userId, MAX_STILL_LEVEL);
            if (newLevel === null) {
                await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: resolved.account.accountId,
                    amount: cost.toFixed(10),
                    key: `still-upgrade-refund-${userId}-${Date.now()}`,
                    note: "still_upgrade_refund",
                });
                return res.status(400).json({ status: false, message: "Still is already at max level" });
            }

            await XenCasinoActivity.record({ game: SLUG, userId, wager: cost, payout: 0 });

            return res.json({ status: true, data: { stillLevel: newLevel, balance: result.fromNewBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

};
