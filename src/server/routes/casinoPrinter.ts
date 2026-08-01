/**
 * Money Printer - one print run at a time, off an illicit computer rig. Payout multiplier
 * rises from *below* breakeven toward a peak the longer the run goes, then plateaus -
 * collecting immediately is a guaranteed loss, not free money. A separate raid-risk meter
 * carries real risk from the very first roll (never starts at 0%) and rises further the
 * longer it's been since the last bribe, seizing the run (parts cost lost, no payout) at
 * any periodic roll. Bribing resets that risk but costs more each time on the same run, so
 * stalling near peak by bribing indefinitely stops being profitable. There's no persistent
 * "level" to grind - every boost (the 3 required parts, plus an optional Machine Upgrade)
 * is bought fresh for that one run and gone once it ends. Raid-roll bookkeeping lives in
 * XenCasinoPrinterState (src/server/models/xenCasino.js); this route owns parts/bribe
 * economics, the payout-multiplier curve, and every money movement.
 */
import express = require("express");
import { authenticateToken } from "../middleware/auth";
import { AuthenticatedRequest } from "../types/AuthenticatedRequest";
const { User } = require("../models/user");
const { XenCasinoPrinterState, XenCasinoActivity, PRINTER_RISK_RAMP_MS, PRINTER_BASE_RAID_CHANCE, PRINTER_MAX_RAID_CHANCE } = require("../models/xenCasino");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../utils/weeabetsClient";
import { requireGameEnabled } from "../utils/casinoStatus";
import { recordCasinoRoundPlayed } from "../utils/dailyQuest";

const SLUG = "printer";
const BRIBE_COST = 3000; // cost of the first bribe on a run - each subsequent one costs more, see nextBribeCost
const BRIBE_COST_STEP = 0.75; // +75% of the base cost per prior bribe on this run
const START_MULTIPLIER = 0; // collecting the instant a run starts pays out nothing - not free money
const PEAK_MULTIPLIER = 4; // a run's baseline payout ceiling before parts scale it (see effectivePeakMultiplier)
const BASE_PEAK_DURATION_MS = 3 * 60 * 60 * 1000;
// Parts-driven caps so no combo (e.g. 3x the most reckless part) breaks the house edge
// outright or pays out near-instantly.
const MIN_PEAK_DURATION_MS = 20 * 60 * 1000;
const MAX_EFFECTIVE_PEAK_MULTIPLIER = 15;
// A single-use, optional 4th purchase alongside the 3 required parts - a pure rate boost
// with no raid cost, unlike parts which always trade some of one for the other. Bought
// fresh for that one run only, same as everything else here - there's no persistent
// "rig level" to grind toward.
const MACHINE_UPGRADE_COST = 15000;
const MACHINE_UPGRADE_RATE_BONUS = 0.5;

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
    "case-fan": { key: "case-fan", label: "Case Fan", cost: 1600, rateBonus: 0.1, raidBonus: 0.05, description: "Mild, dependable upgrade." },
    "ram-upgrade": { key: "ram-upgrade", label: "RAM Upgrade", cost: 2400, rateBonus: 0.25, raidBonus: 0.15, description: "Solid boost, moderate risk." },
    "turbo-fan": { key: "turbo-fan", label: "Turbo Fan", cost: 4000, rateBonus: 0.5, raidBonus: 0.4, description: "Strong boost, but loud - raid risk climbs." },
    "liquid-nitrogen": { key: "liquid-nitrogen", label: "Liquid Nitrogen Cooler", cost: 6400, rateBonus: 1.0, raidBonus: 0.9, description: "Huge boost, huge risk - the high-roller pick." },
    "silent-case": { key: "silent-case", label: "Silent Case", cost: 2000, rateBonus: -0.05, raidBonus: -0.35, description: "Much quieter, slightly slower." },

    // Utility parts — each is a singleton, no stacking. They change how risk/collection
    // work rather than adding raw rate or raid numbers. Count toward the 3-part limit.
    "whistleblower": { key: "whistleblower", label: "Whistleblower", cost: 2500, rateBonus: 0, raidBonus: 0, description: "Blocks the first raid hit — an inside tip you only get once." },
    "signal-jammer": { key: "signal-jammer", label: "Signal Jammer", cost: 3000, rateBonus: 0, raidBonus: 0, description: "Raid checks every 10 min instead of 5." },
    "forged-documents": { key: "forged-documents", label: "Forged Documents", cost: 3500, rateBonus: 0, raidBonus: 0, description: "Bribes cost 50% less this run." },
    "insurance": { key: "insurance", label: "Insurance Policy", cost: 4000, rateBonus: 0, raidBonus: 0, description: "If raided, refunds 50% of your parts cost." },
    "decoy-rig": { key: "decoy-rig", label: "Decoy Rig", cost: 4500, rateBonus: 0, raidBonus: 0, description: "If raided, lose only 50% of parts cost." },
};

// Each bribe on the same run costs more than the last, so babysitting a run to peak by
// bribing indefinitely eventually costs more than the extra payout is worth.
function nextBribeCost(run: any): number {
    const base = Math.round(BRIBE_COST * (1 + (run.bribeCount || 0) * BRIBE_COST_STEP));
    return run.hasForgedDocuments ? Math.round(base / 2) : base;
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
        // Full catalog entries (not just labels) so the client can render each installed
        // part as its own small "what this adds" card instead of a plain name chip.
        parts: partKeys.map((key) => PRINTER_PARTS[key]).filter(Boolean),
        usedMachineUpgrade: !!run.usedMachineUpgrade,
        machineUpgradeRateBonus: MACHINE_UPGRADE_RATE_BONUS,
        hasWhistleblower: !!run.hasWhistleblower,
        whistleblowerUsed: !run.hasWhistleblower && partKeys.includes("whistleblower"),
        hasSignalJammer: !!run.hasSignalJammer,
        hasForgedDocuments: !!run.hasForgedDocuments,
        hasInsurance: !!run.hasInsurance,
        hasDecoyRig: !!run.hasDecoyRig,
    };
}

module.exports = function (app: express.Application) {

    // Sweep stale printer runs every 5 minutes — if a run is abandoned (no activity for
    // ROUND_TTL_MS), clear it so the player can start a new one. No money moves here;
    // if the collect payout was already sent, the transfer's idempotency key prevents
    // double-payment. If it wasn't, the run simply forfeits.
    const PRINTER_ROUND_TTL_MS = 30 * 60 * 1000; // 30 minutes
    setInterval(() => {
        sweepStalePrinterRuns().catch((err: Error) => {
            console.error("printer: stale run sweep failed", err);
        });
    }, 5 * 60 * 1000).unref();

    async function sweepStalePrinterRuns() {
        const cutoff = new Date(Date.now() - PRINTER_ROUND_TTL_MS);
        const stale = await XenCasinoPrinterState.find({ "run.startedAt": { $lt: cutoff }, "run.raidedAt": null }).exec();
        for (const doc of stale) {
            if (!doc.run) continue;
            // The run has been sitting too long — clear it. If the player collected and the
            // payout transfer went through, the idempotency key guards against double-pay.
            // If they never collected, the run is forfeit.
            await XenCasinoPrinterState.clearRun(doc.userId);
        }
        if (stale.length > 0) {
            console.log(`printer: swept ${stale.length} stale run(s)`);
        }
    }

    app.get("/api/casino/printer", authenticateToken, async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const doc = await XenCasinoPrinterState.getState(userId);
        return res.json({
            status: true,
            data: {
                run: runView(doc.run),
                parts: Object.values(PRINTER_PARTS),
                // The run's own escalated cost while one is going (see runView.nextBribeCost)
                // - this base cost otherwise, for display before a run has even started.
                bribeCost: doc.run ? nextBribeCost(doc.run) : BRIBE_COST,
                machineUpgradeCost: MACHINE_UPGRADE_COST,
            },
        });
    });

    app.post("/api/casino/printer/start", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { partKeys, useMachineUpgrade } = req.body as { partKeys: string[]; useMachineUpgrade?: boolean };
        if (!Array.isArray(partKeys) || partKeys.length > 3 || partKeys.some((k) => !PRINTER_PARTS[k])) {
            return res.status(400).json({ status: false, message: "Pick up to 3 parts" });
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

            // Sum the 3 picks' cost/rateBonus/raidBonus (plus the optional Machine Upgrade,
            // a pure rate boost with no raid cost), then derive this run's own effective
            // curve - same rateScale both shortens time-to-peak and raises the peak
            // multiplier, both clamped so no combo breaks the house edge outright.
            const totalCost = parts.reduce((sum, p) => sum + p.cost, 0) + (useMachineUpgrade ? MACHINE_UPGRADE_COST : 0);
            const sumRate = parts.reduce((sum, p) => sum + p.rateBonus, 0) + (useMachineUpgrade ? MACHINE_UPGRADE_RATE_BONUS : 0);
            const sumRaid = parts.reduce((sum, p) => sum + p.raidBonus, 0);
            const rateScale = Math.max(0.1, 1 + sumRate);
            const raidScale = Math.max(0, 1 + sumRaid);
            const effectivePeakDurationMs = Math.max(MIN_PEAK_DURATION_MS, BASE_PEAK_DURATION_MS / rateScale);
            const effectivePeakMultiplier = Math.min(MAX_EFFECTIVE_PEAK_MULTIPLIER, PEAK_MULTIPLIER * rateScale);

            // A run with 0 parts and no Machine Upgrade (the "stock rig") costs nothing to
            // start - skip the transfer(s) entirely rather than round-tripping a $0 amount.
            const xenCasinoAccountId = await getXenCasinoAccountId();
            const result = totalCost > 0
                ? await transfer({
                    fromAccountId: resolved.account.accountId,
                    toAccountId: xenCasinoAccountId,
                    amount: totalCost.toFixed(10),
                    key: `printer-start-${userId}-${Date.now()}`,
                    note: "printer_start",
                })
                : { fromNewBalance: resolved.account.balance };

            const run = await XenCasinoPrinterState.startRun(
                userId,
                totalCost,
                effectivePeakDurationMs,
                effectivePeakMultiplier,
                raidScale,
                partKeys,
                !!useMachineUpgrade
            );
            if (!run) {
                if (totalCost > 0) {
                    await transfer({
                        fromAccountId: xenCasinoAccountId,
                        toAccountId: resolved.account.accountId,
                        amount: totalCost.toFixed(10),
                        key: `printer-start-refund-${userId}-${Date.now()}`,
                        note: "printer_start_refund",
                    });
                }
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

        // Read the doc directly — don't call getState (which calls resolvePrinterRun and
        // could raid the run mid-collect, turning a payout into 0). We only check whether
        // the run was *already* raided before the player clicked Collect.
        const doc = await XenCasinoPrinterState.findOne({ userId }).exec();
        const run = doc?.run ?? null;
        if (!run) {
            return res.status(400).json({ status: false, message: "No print run going" });
        }

        if (run.raidedAt) {
            // Insurance Policy / Decoy Rig — refund 50% of parts cost if either is equipped.
            const refundPercent = (run.hasInsurance || run.hasDecoyRig) ? 0.5 : 0;
            let balance: string | undefined;
            if (refundPercent > 0) {
                try {
                    const resolved = await resolveUserAccount(user);
                    if (resolved.linked && resolved.account) {
                        const refundAmount = Math.round(run.partsCost * refundPercent);
                        const xenCasinoAccountId = await getXenCasinoAccountId();
                        const refundResult = await transfer({
                            fromAccountId: xenCasinoAccountId,
                            toAccountId: resolved.account.accountId,
                            amount: refundAmount.toFixed(10),
                            key: `printer-refund-${userId}-${new Date(run.startedAt).getTime()}`,
                            note: "printer_raid_refund",
                        });
                        balance = refundResult.toNewBalance;
                    }
                } catch {
                    // Refund failed — still clear the run, don't block on it.
                }
            }
            await XenCasinoPrinterState.clearRun(userId);
            const activityPayout = refundPercent > 0 ? Math.round(run.partsCost * refundPercent) : 0;
            await recordCasinoRoundPlayed(userId, { game: SLUG, wager: 0, payout: activityPayout });
            return res.json({ status: true, data: { raided: true, payout: activityPayout, balance } });
        }

        const payout = Math.round(run.partsCost * currentMultiplier(run, new Date()));

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
                key: `printer-collect-${userId}-${new Date(run.startedAt).getTime()}`,
                note: "printer_collect",
            });

            await XenCasinoPrinterState.clearRun(userId);
            await recordCasinoRoundPlayed(userId, { game: SLUG, wager: 0, payout });

            return res.json({ status: true, data: { raided: false, payout, balance: result.toNewBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

};
