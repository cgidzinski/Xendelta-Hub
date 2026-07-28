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
const INGREDIENT_COST = 5000;
const BRIBE_COST = 1500; // cost of the first bribe on a batch - each subsequent one costs more, see nextBribeCost
const BRIBE_COST_STEP = 0.75; // +75% of the base cost per prior bribe on this batch
const UPGRADE_BASE_COST = 10000; // cost of the first upgrade (level 1 -> 2) - each further level doubles it, see stillUpgradeCost
const START_MULTIPLIER = 0; // collecting the instant a batch starts pays out nothing - not free money
const PEAK_MULTIPLIER = 4; // batch payout plateaus at ingredientCost * this, once peakAt passes
// Higher still levels reach peak sooner and give raid rolls more grace after a bribe -
// "go deep on one still" progression instead of running parallel batches.
const BASE_PEAK_DURATION_MS = 3 * 60 * 60 * 1000;
const PEAK_DURATION_STEP_MS = 20 * 60 * 1000; // shaved off per still level above 1

function peakDurationForLevel(level: number): number {
    return Math.max(45 * 60 * 1000, BASE_PEAK_DURATION_MS - (level - 1) * PEAK_DURATION_STEP_MS);
}

// Doubles per level: 10000 -> 20000 -> 40000 -> 80000 for levels 1->2 through 4->5.
function stillUpgradeCost(currentLevel: number): number {
    return Math.round(UPGRADE_BASE_COST * Math.pow(2, currentLevel - 1));
}

// Each bribe on the same batch costs more than the last, so babysitting a batch to peak
// by bribing indefinitely eventually costs more than the extra payout is worth.
function nextBribeCost(batch: any): number {
    return Math.round(BRIBE_COST * (1 + (batch.bribeCount || 0) * BRIBE_COST_STEP));
}

// Rises linearly from START_MULTIPLIER (a real loss if collected instantly) to
// PEAK_MULTIPLIER at peakAt, then plateaus - pure function of stored timestamps, never
// itself stored.
function currentMultiplier(batch: any, now: Date): number {
    const started = new Date(batch.startedAt).getTime();
    const peak = new Date(batch.peakAt).getTime();
    const total = peak - started;
    if (total <= 0) {
        return PEAK_MULTIPLIER;
    }
    const t = Math.min(1, Math.max(0, (now.getTime() - started) / total));
    return START_MULTIPLIER + (PEAK_MULTIPLIER - START_MULTIPLIER) * t;
}

// Mirrors stillRaidChance() in the model exactly (same constants, imported rather than
// duplicated) so this is the real number the next raid roll is drawn against, not an
// approximation of it.
function raidRiskPercent(batch: any, now: Date): number {
    const since = now.getTime() - new Date(batch.lastBribeAt || batch.startedAt).getTime();
    const ramped = STILL_BASE_RAID_CHANCE + (since / STILL_RISK_RAMP_MS) * (STILL_MAX_RAID_CHANCE - STILL_BASE_RAID_CHANCE);
    return Math.min(STILL_MAX_RAID_CHANCE, ramped);
}

function batchView(batch: any) {
    if (!batch) {
        return null;
    }
    const now = new Date();
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
                ingredientCost: INGREDIENT_COST,
                // The batch's own escalated cost while one is running (see batchView.nextBribeCost)
                // - this base cost otherwise, for display before a batch has even started.
                bribeCost: doc.batch ? nextBribeCost(doc.batch) : BRIBE_COST,
                upgradeCost: stillUpgradeCost(doc.stillLevel),
            },
        });
    });

    app.post("/api/casino/still/start", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
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
            if (state.batch) {
                return res.status(400).json({ status: false, message: "A batch is already running" });
            }

            const xenCasinoAccountId = await getXenCasinoAccountId();
            const result = await transfer({
                fromAccountId: resolved.account.accountId,
                toAccountId: xenCasinoAccountId,
                amount: INGREDIENT_COST.toFixed(10),
                key: `still-start-${userId}-${Date.now()}`,
                note: "still_start",
            });

            const batch = await XenCasinoStillState.startBatch(userId, INGREDIENT_COST, peakDurationForLevel(state.stillLevel));
            if (!batch) {
                await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: resolved.account.accountId,
                    amount: INGREDIENT_COST.toFixed(10),
                    key: `still-start-refund-${userId}-${Date.now()}`,
                    note: "still_start_refund",
                });
                return res.status(400).json({ status: false, message: "A batch is already running" });
            }

            await XenCasinoActivity.record({ game: SLUG, userId, wager: INGREDIENT_COST, payout: 0 });

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
