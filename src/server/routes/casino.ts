import express = require("express");
import { authenticateToken } from "../middleware/auth";
import { AuthenticatedRequest } from "../types/AuthenticatedRequest";
const { User } = require("../models/user");
const { XenCasinoUserState, dailyQuestDateKey } = require("../models/xenCasino");
import {
    resolveUserAccount,
    getAccount,
    getLedger,
    transfer,
    getXenCasinoAccountId,
    WeeabetsUnavailable,
    WeeabetsTransferError,
    MAX_LEDGER_LIMIT,
} from "../utils/weeabetsClient";
import { XENCASINO_DISCORD_ID } from "../config/weeabets";
import { getCasinoStatus } from "../utils/casinoStatus";

// Flat cheddar (display-unit) reward for completing the daily quest - tunable.
const DAILY_QUEST_REWARD = 10000;

module.exports = function (app: express.Application) {

    // The house's own live balance - fetched fresh each call (not the cached account-id
    // lookup `getXenCasinoAccountId` uses) since the balance itself changes constantly.
    app.get("/api/casino/house-balance", authenticateToken, async function (_req: express.Request, res: express.Response) {
        try {
            const account = await getAccount(XENCASINO_DISCORD_ID);
            if (!account) {
                return res.status(503).json({ status: false, message: "XenCasino account not found on Weeabets" });
            }
            return res.json({ status: true, data: { balance: account.balance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    // Whether the casino as a whole (and which individual games) are open right now - combines
    // the admin's manual toggle with the live bank-balance auto-close check. Polled by the
    // client to show the "closed" overlay / gray out disabled games.
    app.get("/api/casino/status", authenticateToken, async function (_req: express.Request, res: express.Response) {
        try {
            const status = await getCasinoStatus();
            return res.json({ status: true, data: status });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    // Live Weeabets balance for the current user, or {linked:false} if Discord isn't linked.
    app.get("/api/casino/balance", authenticateToken, async function (req: express.Request, res: express.Response) {
        const userId = (req as AuthenticatedRequest).user!._id;
        const user = await User.findById(userId).exec();
        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }

        try {
            const resolved = await resolveUserAccount(user);
            if (!resolved.linked) {
                return res.json({ status: true, data: { linked: false, balance: null } });
            }
            return res.json({
                status: true,
                data: { linked: true, balance: resolved.account?.balance ?? null },
            });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    // Every movement in/out of the XenCasino account, enriched with local display names
    // where the counterparty is a known Xendelta-Hub user (matched via weeabetsAccountId).
    app.get("/api/casino/ledger", authenticateToken, async function (req: express.Request, res: express.Response) {
        const limit = req.query.limit ? Math.min(Number(req.query.limit), MAX_LEDGER_LIMIT) : undefined;
        const beforeId = req.query.before_id ? Number(req.query.before_id) : undefined;

        try {
            const entries = await getLedger({ limit, beforeId });
            const accountIds = [...new Set(entries.map((e) => e.counterpartyId))];
            const localUsers = await User.find({ weeabetsAccountId: { $in: accountIds } }).exec();
            const nameByAccountId = new Map<number, string>(
                localUsers.map((u: any) => [u.weeabetsAccountId, u.username || u.name || `Account #${u.weeabetsAccountId}`])
            );
            const enriched = entries.map((e) => ({
                ...e,
                displayName: nameByAccountId.get(e.counterpartyId) || `Account #${e.counterpartyId}`,
            }));
            return res.json({ status: true, data: { entries: enriched } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    // Today's "play N casino rounds" progress - resets lazily the moment the stored date
    // no longer matches today (UTC), no cron job involved.
    app.get("/api/casino/daily-quest", authenticateToken, async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const questStatus = await XenCasinoUserState.getDailyQuestStatus(userId);
        return res.json({ status: true, data: { ...questStatus, reward: DAILY_QUEST_REWARD } });
    });

    app.post("/api/casino/daily-quest/claim", authenticateToken, async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const user = await User.findById(userId).exec();
        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }

        try {
            const questStatus = await XenCasinoUserState.getDailyQuestStatus(userId);
            if (!questStatus.canClaim) {
                return res.status(400).json({ status: false, message: "Daily quest not ready to claim" });
            }

            const resolved = await resolveUserAccount(user);
            if (!resolved.linked || !resolved.account) {
                return res.status(400).json({ status: false, message: "Link your Discord account to play" });
            }

            // Idempotency key is derived from userId+date (not a random id) so a
            // concurrent/duplicate claim can never pay out twice, regardless of any race
            // on the local `claimed` flag below.
            const date = dailyQuestDateKey();
            const xenCasinoAccountId = await getXenCasinoAccountId();
            const result = await transfer({
                fromAccountId: xenCasinoAccountId,
                toAccountId: resolved.account.accountId,
                amount: DAILY_QUEST_REWARD.toFixed(10),
                key: `xendelta-daily-quest-${userId}-${date}`,
                note: "daily_quest_reward",
            });

            // Only recorded after the transfer actually succeeds - if it fails, the quest
            // stays claimable and the next attempt just replays the same idempotent key.
            await XenCasinoUserState.markDailyQuestClaimed(userId, date);

            return res.json({ status: true, data: { balance: result.toNewBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

};
