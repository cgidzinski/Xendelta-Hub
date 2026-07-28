/**
 * Money Printer - one print run at a time, off an illicit computer rig. Payout multiplier
 * rises from *below* breakeven toward a peak the longer the run goes, then plateaus -
 * collecting immediately is a guaranteed loss, not free money. A separate raid-risk meter
 * carries real risk from the very first roll (never starts at 0%) and rises further the
 * longer it's been since the last bribe, seizing the run (parts cost lost, no payout) at
 * any periodic roll. Bribing resets that risk but costs more each time on the same run, so
 * stalling near peak by bribing indefinitely stops being profitable. Raid-roll bookkeeping
 * lives in XenCasinoPrinterState (src/server/models/xenCasino.js); this route owns
 * parts/bribe/upgrade economics, the payout-multiplier curve, and every money movement.
 */
import express = require("express");
import { authenticateToken } from "../middleware/auth";
import { AuthenticatedRequest } from "../types/AuthenticatedRequest";
const { User } = require("../models/user");
const { XenCasinoPrinterState, XenCasinoActivity, PRINTER_RISK_RAMP_MS, PRINTER_BASE_RAID_CHANCE, PRINTER_MAX_RAID_CHANCE } = require("../models/xenCasino");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../utils/weeabetsClient";
import { requireGameEnabled } from "../utils/casinoStatus";

const SLUG = "printer";
const MAX_RIG_LEVEL = 5;
const BRIBE_COST = 1500; // cost of the first bribe on a run - each subsequent one costs more, see nextBribeCost
const BRIBE_COST_STEP = 0.75; // +75% of the base cost per prior bribe on this run
const UPGRADE_BASE_COST = 10000; // cost of the first upgrade (level 1 -> 2) - each further level doubles it, see rigUpgradeCost
const START_MULTIPLIER = 0; // collecting the instant a run starts pays out nothing - not free money
const PEAK_MULTIPLIER = 4; // a run's baseline payout ceiling before parts scale it (see effectivePeakMultiplier)
// Higher rig levels reach peak sooner and give raid rolls more grace after a bribe -
// "go deep on one rig" progression instead of running parallel print runs.
const BASE_PEAK_DURATION_MS = 3 * 60 * 60 * 1000;
const PEAK_DURATION_STEP_MS = 20 * 60 * 1000; // shaved off per rig level above 1
// Parts-driven caps so no combo (e.g. 3x the most reckless part) breaks the house edge
// outright or pays out near-instantly.
const MIN_PEAK_DURATION_MS = 20 * 60 * 1000;
const MAX_EFFECTIVE_PEAK_MULTIPLIER = 15;

function peakDurationForLevel(level: number): number {
    return Math.max(45 * 60 * 1000, BASE_PEAK_DURATION_MS - (level - 1) * PEAK_DURATION_STEP_MS);
}

interface PrinterPart {
    key: string;
    label: string;
    cost: number;
    rateBonus: number; // shortens time-to-peak AND raises the peak multiplier, both from this one number
    raidBonus: number; // scales the whole raid-risk curve (see printerRaidChance in xenCasino.js)
    description: string;
}

// Six parts spanning quiet/slow to loud/fast. Installing the same part more than once is
// valid (e.g. 3x Liquid Nitrogen Cooler for an extreme build) - bonuses/costs just sum
// across however many of each were picked. Silent Case/Faraday Cage trade rate for real
// stealth; Liquid Nitrogen Cooler is the reckless high-roller pick. Every part is an
// upgrade to the base rig - there's no "stock" option.
const PRINTER_PARTS: Record<string, PrinterPart> = {
    "case-fan": { key: "case-fan", label: "Case Fan", cost: 800, rateBonus: 0.1, raidBonus: 0.05, description: "Mild, dependable upgrade." },
    "ram-upgrade": { key: "ram-upgrade", label: "RAM Upgrade", cost: 1200, rateBonus: 0.25, raidBonus: 0.15, description: "Solid boost, moderate risk." },
    "turbo-fan": { key: "turbo-fan", label: "Turbo Fan", cost: 2000, rateBonus: 0.5, raidBonus: 0.4, description: "Strong boost, but loud - raid risk climbs." },
    "liquid-nitrogen": { key: "liquid-nitrogen", label: "Liquid Nitrogen Cooler", cost: 3200, rateBonus: 1.0, raidBonus: 0.9, description: "Huge boost, huge risk - the high-roller pick." },
    "silent-case": { key: "silent-case", label: "Silent Case", cost: 1000, rateBonus: -0.15, raidBonus: -0.3, description: "Slower and smaller, but much quieter." },
    "faraday-cage": { key: "faraday-cage", label: "Faraday Cage", cost: 1600, rateBonus: 0.05, raidBonus: -0.45, description: "Nearly pure stealth, barely touches rate." },
};

// Doubles per level: 10000 -> 20000 -> 40000 -> 80000 for levels 1->2 through 4->5.
function rigUpgradeCost(currentLevel: number): number {
    return Math.round(UPGRADE_BASE_COST * Math.pow(2, currentLevel - 1));
}

// Each bribe on the same run costs more than the last, so babysitting a run to peak by
// bribing indefinitely eventually costs more than the extra payout is worth.
function nextBribeCost(run: any): number {
    return Math.round(BRIBE_COST * (1 + (run.bribeCount || 0) * BRIBE_COST_STEP));
}

// Rises linearly from START_MULTIPLIER (a real loss if collected instantly) to this run's
// own `peakMultiplier` (already parts-scaled and clamped at start time - see the /start
// handler) at peakAt, then plateaus - pure function of stored timestamps, never itself
// stored. Falls back to the global PEAK_MULTIPLIER for any run that predates parts.
function currentMultiplier(run: any, now: Date): number {
    const peakMultiplier = run.peakMultiplier ?? PEAK_MULTIPLIER;
    const started = new Date(run.startedAt).getTime();
    const peak = new Date(run.peakAt).getTime();
    const total = peak - started;
    if (total <= 0) {
        return peakMultiplier;
    }
    const t = Math.min(1, Math.max(0, (now.getTime() - started) / total));
    return START_MULTIPLIER + (peakMultiplier - START_MULTIPLIER) * t;
}

// Mirrors printerRaidChance() in the model exactly (same constants and raidMultiplier
// scaling, imported/read rather than duplicated) so this is the real number the next
// raid roll is drawn against, not an approximation of it.
function raidRiskPercent(run: any, now: Date): number {
    const since = now.getTime() - new Date(run.lastBribeAt || run.startedAt).getTime();
    const ramped = PRINTER_BASE_RAID_CHANCE + (since / PRINTER_RISK_RAMP_MS) * (PRINTER_MAX_RAID_CHANCE - PRINTER_BASE_RAID_CHANCE);
    return Math.min(PRINTER_MAX_RAID_CHANCE, ramped * (run.raidMultiplier ?? 1));
}

function runView(run: any) {
    if (!run) {
        return null;
    }
    const now = new Date();
    const partKeys: string[] = run.partKeys || [];
    return {
        startedAt: run.startedAt,
        partsCost: run.partsCost,
        peakAt: run.peakAt,
        lastBribeAt: run.lastBribeAt,
        bribeCount: run.bribeCount || 0,
        nextBribeCost: nextBribeCost(run),
        raided: !!run.raidedAt,
        currentMultiplier: run.raidedAt ? 0 : Number(currentMultiplier(run, now).toFixed(3)),
        raidRiskPercent: run.raidedAt ? 0 : Number((raidRiskPercent(run, now) * 100).toFixed(1)),
        peakMultiplier: run.peakMultiplier ?? PEAK_MULTIPLIER,
        parts: partKeys.map((key) => PRINTER_PARTS[key]?.label || key),
    };
}

module.exports = function (app: express.Application) {

    app.get("/api/casino/printer", authenticateToken, async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const doc = await XenCasinoPrinterState.getState(userId);
        return res.json({
            status: true,
            data: {
                rigLevel: doc.rigLevel,
                maxRigLevel: MAX_RIG_LEVEL,
                run: runView(doc.run),
                parts: Object.values(PRINTER_PARTS),
                // The run's own escalated cost while one is going (see runView.nextBribeCost)
                // - this base cost otherwise, for display before a run has even started.
                bribeCost: doc.run ? nextBribeCost(doc.run) : BRIBE_COST,
                upgradeCost: rigUpgradeCost(doc.rigLevel),
            },
        });
    });

    app.post("/api/casino/printer/start", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { partKeys } = req.body as { partKeys: string[] };
        if (!Array.isArray(partKeys) || partKeys.length !== 3 || partKeys.some((k) => !PRINTER_PARTS[k])) {
            return res.status(400).json({ status: false, message: "Pick exactly 3 parts" });
        }
        const parts = partKeys.map((k) => PRINTER_PARTS[k]);

        const user = await User.findById(userId).exec();
        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }

        try {
            const resolved = await resolveUserAccount(user);
            if (!resolved.linked || !resolved.account) {
                return res.status(400).json({ status: false, message: "Link your Discord account to play" });
            }

            const state = await XenCasinoPrinterState.getState(userId);
            if (state.run) {
                return res.status(400).json({ status: false, message: "A print run is already going" });
            }

            // Sum the 3 picks' cost/rateBonus/raidBonus, then derive this run's own
            // effective curve - same rateScale both shortens time-to-peak and raises the
            // peak multiplier, both clamped so no combo breaks the house edge outright.
            const totalCost = parts.reduce((sum, p) => sum + p.cost, 0);
            const sumRate = parts.reduce((sum, p) => sum + p.rateBonus, 0);
            const sumRaid = parts.reduce((sum, p) => sum + p.raidBonus, 0);
            const rateScale = Math.max(0.1, 1 + sumRate);
            const raidScale = Math.max(0, 1 + sumRaid);
            const effectivePeakDurationMs = Math.max(MIN_PEAK_DURATION_MS, peakDurationForLevel(state.rigLevel) / rateScale);
            const effectivePeakMultiplier = Math.min(MAX_EFFECTIVE_PEAK_MULTIPLIER, PEAK_MULTIPLIER * rateScale);

            const xenCasinoAccountId = await getXenCasinoAccountId();
            const result = await transfer({
                fromAccountId: resolved.account.accountId,
                toAccountId: xenCasinoAccountId,
                amount: totalCost.toFixed(10),
                key: `printer-start-${userId}-${Date.now()}`,
                note: "printer_start",
            });

            const run = await XenCasinoPrinterState.startRun(
                userId,
                totalCost,
                effectivePeakDurationMs,
                effectivePeakMultiplier,
                raidScale,
                partKeys
            );
            if (!run) {
                await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: resolved.account.accountId,
                    amount: totalCost.toFixed(10),
                    key: `printer-start-refund-${userId}-${Date.now()}`,
                    note: "printer_start_refund",
                });
                return res.status(400).json({ status: false, message: "A print run is already going" });
            }

            await XenCasinoActivity.record({ game: SLUG, userId, wager: totalCost, payout: 0 });

            return res.json({ status: true, data: { run: runView(run), balance: result.fromNewBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    app.post("/api/casino/printer/bribe", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
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

            const state = await XenCasinoPrinterState.getState(userId);
            if (!state.run || state.run.raidedAt) {
                return res.status(400).json({ status: false, message: "No print run to bribe for" });
            }
            const cost = nextBribeCost(state.run);

            const xenCasinoAccountId = await getXenCasinoAccountId();
            const result = await transfer({
                fromAccountId: resolved.account.accountId,
                toAccountId: xenCasinoAccountId,
                amount: cost.toFixed(10),
                key: `printer-bribe-${userId}-${Date.now()}`,
                note: "printer_bribe",
            });

            const run = await XenCasinoPrinterState.bribe(userId);
            if (!run) {
                await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: resolved.account.accountId,
                    amount: cost.toFixed(10),
                    key: `printer-bribe-refund-${userId}-${Date.now()}`,
                    note: "printer_bribe_refund",
                });
                return res.status(400).json({ status: false, message: "No print run to bribe for" });
            }

            await XenCasinoActivity.record({ game: SLUG, userId, wager: cost, payout: 0 });

            return res.json({ status: true, data: { run: runView(run), balance: result.fromNewBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    app.post("/api/casino/printer/collect", authenticateToken, async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const user = await User.findById(userId).exec();
        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }

        const state = await XenCasinoPrinterState.getState(userId);
        if (!state.run) {
            return res.status(400).json({ status: false, message: "No print run going" });
        }

        if (state.run.raidedAt) {
            await XenCasinoPrinterState.clearRun(userId);
            return res.json({ status: true, data: { raided: true, payout: 0 } });
        }

        const payout = Math.round(state.run.partsCost * currentMultiplier(state.run, new Date()));

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
                key: `printer-collect-${userId}-${new Date(state.run.startedAt).getTime()}`,
                note: "printer_collect",
            });

            await XenCasinoPrinterState.clearRun(userId);
            await XenCasinoActivity.record({ game: SLUG, userId, wager: 0, payout });

            return res.json({ status: true, data: { raided: false, payout, balance: result.toNewBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    app.post("/api/casino/printer/upgrade", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
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

            const state = await XenCasinoPrinterState.getState(userId);
            if (state.rigLevel >= MAX_RIG_LEVEL) {
                return res.status(400).json({ status: false, message: "Rig is already at max level" });
            }
            const cost = rigUpgradeCost(state.rigLevel);

            const xenCasinoAccountId = await getXenCasinoAccountId();
            const result = await transfer({
                fromAccountId: resolved.account.accountId,
                toAccountId: xenCasinoAccountId,
                amount: cost.toFixed(10),
                key: `printer-upgrade-${userId}-${Date.now()}`,
                note: "printer_upgrade",
            });

            const newLevel = await XenCasinoPrinterState.upgrade(userId, MAX_RIG_LEVEL);
            if (newLevel === null) {
                await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: resolved.account.accountId,
                    amount: cost.toFixed(10),
                    key: `printer-upgrade-refund-${userId}-${Date.now()}`,
                    note: "printer_upgrade_refund",
                });
                return res.status(400).json({ status: false, message: "Rig is already at max level" });
            }

            await XenCasinoActivity.record({ game: SLUG, userId, wager: cost, payout: 0 });

            return res.json({ status: true, data: { rigLevel: newLevel, balance: result.fromNewBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

};
