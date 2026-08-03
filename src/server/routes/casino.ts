import express = require("express");
import { authenticateToken } from "../middleware/auth";
import { AuthenticatedRequest } from "../types/AuthenticatedRequest";
const { User } = require("../models/user");
const { XenCasinoUserState, XenCasinoActivity, dailyQuestDateKey } = require("../models/xenCasino");
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
import { rangeCutoff } from "../utils/statsRange";

// Non-gameplay XenCasinoActivity rows that must never surface on the player-facing
// leaderboard - daily quest rewards and admin grants are free cheddar, not skill/luck.
const NON_GAMEPLAY_ACTIVITY_MATCH = { game: { $not: /^quest-reward-/, $ne: "admin-grant" } };

interface LeaderboardPlayerRow {
    _id: string;
    totalWagered: number;
    totalPayout: number;
    roundsPlayed: number;
    netWinnings: number;
}

async function resolveLeaderboardUsers(userIds: string[]): Promise<Map<string, { username: string; avatar: string | null }>> {
    const users = await User.find({ _id: { $in: userIds } }, "username avatar").exec();
    const userMap = new Map<string, { username: string; avatar: string | null }>();
    for (const u of users) {
        userMap.set(String(u._id), { username: u.username, avatar: u.avatar || null });
    }
    return userMap;
}

// Flat cheddar (display-unit) rewards for daily quests — defined here for the claim
// endpoint; the model also has them in DAILY_QUEST_DEFINITIONS for the GET endpoint.
const DAILY_QUEST_REWARDS: Record<string, number> = {
    "unique-games": 10000,
    "rounds-10": 10000,
    "rounds-20": 50000,
};

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

    // Four "hall of fame" top-3 boards sourced entirely from the local XenCasinoActivity
    // collection (never the external Weeabets ledger - this is read-only reporting over
    // rounds already recorded locally, same source as admin's /player-stats). Open to any
    // logged-in player, not admin-gated - everyone in the friend group can see everyone
    // else's stats. Quest rewards and admin grants are excluded everywhere below since
    // they're free cheddar, not something anyone actually won at a game.
    app.get("/api/casino/leaderboard", authenticateToken, async function (req: express.Request, res: express.Response) {
        try {
            const range = (req.query.range as string) || "all";
            const cutoff = rangeCutoff(range);

            const match: Record<string, unknown> = { ...NON_GAMEPLAY_ACTIVITY_MATCH };
            if (cutoff) {
                match.createdAt = { $gte: cutoff };
            }

            // netWinnings is intentionally payout-minus-wager (positive = the player is up) -
            // the OPPOSITE sign convention from admin/casino.ts's player-stats `net`, which is
            // house-centric (wager-minus-payout, positive = house profit). Do not swap these.
            const facetResult = await XenCasinoActivity.aggregate([
                { $match: match },
                { $group: { _id: "$userId", totalWagered: { $sum: "$wager" }, totalPayout: { $sum: "$payout" }, roundsPlayed: { $sum: 1 } } },
                { $addFields: { netWinnings: { $subtract: ["$totalPayout", "$totalWagered"] } } },
                {
                    $facet: {
                        netWinners: [{ $sort: { netWinnings: -1 } }, { $limit: 3 }],
                        netLosers: [{ $sort: { netWinnings: 1 } }, { $limit: 3 }],
                        mostRounds: [{ $sort: { roundsPlayed: -1 } }, { $limit: 3 }],
                    },
                },
            ]).exec();

            // Biggest single-round wins - hall-of-fame moments, not per-player totals, so the
            // same player can appear more than once if they had multiple huge rounds. Queried
            // separately from the raw (ungrouped) activity rows.
            const biggestWinRows = await XenCasinoActivity.aggregate([
                { $match: match },
                { $addFields: { roundNet: { $subtract: ["$payout", "$wager"] } } },
                { $sort: { roundNet: -1 } },
                { $limit: 3 },
                { $project: { _id: 0, userId: 1, game: 1, roundNet: 1, createdAt: 1 } },
            ]).exec();

            const facet = facetResult[0] || { netWinners: [], netLosers: [], mostRounds: [] };
            const allUserIds = [
                ...facet.netWinners.map((r: LeaderboardPlayerRow) => r._id),
                ...facet.netLosers.map((r: LeaderboardPlayerRow) => r._id),
                ...facet.mostRounds.map((r: LeaderboardPlayerRow) => r._id),
                ...biggestWinRows.map((r: any) => r.userId),
            ];
            const userMap = await resolveLeaderboardUsers([...new Set(allUserIds)]);

            const formatPlayerRow = (r: LeaderboardPlayerRow, rank: number) => {
                const info = userMap.get(r._id);
                return {
                    rank,
                    userId: r._id,
                    username: info ? info.username : "Unknown",
                    avatar: info ? info.avatar : null,
                    netWinnings: r.netWinnings.toFixed(2),
                    totalWagered: r.totalWagered.toFixed(2),
                    roundsPlayed: r.roundsPlayed,
                };
            };

            const biggestWins = biggestWinRows.map((r: any, i: number) => {
                const info = userMap.get(r.userId);
                return {
                    rank: i + 1,
                    userId: r.userId,
                    username: info ? info.username : "Unknown",
                    avatar: info ? info.avatar : null,
                    game: r.game,
                    amount: r.roundNet.toFixed(2),
                    createdAt: r.createdAt,
                };
            });

            return res.json({
                status: true,
                data: {
                    range,
                    netWinners: facet.netWinners.map((r: LeaderboardPlayerRow, i: number) => formatPlayerRow(r, i + 1)),
                    netLosers: facet.netLosers.map((r: LeaderboardPlayerRow, i: number) => formatPlayerRow(r, i + 1)),
                    mostRounds: facet.mostRounds.map((r: LeaderboardPlayerRow, i: number) => formatPlayerRow(r, i + 1)),
                    biggestWins,
                },
            });
        } catch (err) {
            return res.status(500).json({ status: false, message: (err as Error).message });
        }
    });

    // Today's daily quests — three independent challenges: play 5 different games (10k),
    // play 10 rounds (10k), and play 20 rounds (50k). Progress resets lazily at UTC midnight.
    app.get("/api/casino/daily-quest", authenticateToken, async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const quests = await XenCasinoUserState.getDailyQuestStatus(userId);
        return res.json({ status: true, data: { quests } });
    });

    app.post("/api/casino/daily-quest/claim", authenticateToken, async function (req: express.Request, res: express.Response) {
        const { key } = req.body as { key?: string };
        if (!key || !DAILY_QUEST_REWARDS[key]) {
            return res.status(400).json({ status: false, message: "Invalid quest key" });
        }
        const reward = DAILY_QUEST_REWARDS[key];

        const userId = String((req as AuthenticatedRequest).user!._id);
        const user = await User.findById(userId).exec();
        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }

        try {
            const quests = await XenCasinoUserState.getDailyQuestStatus(userId);
            const quest = quests.find((q: any) => q.key === key);
            if (!quest || !quest.canClaim) {
                return res.status(400).json({ status: false, message: "Quest not ready to claim" });
            }

            const resolved = await resolveUserAccount(user);
            if (!resolved.linked || !resolved.account) {
                return res.status(400).json({ status: false, message: "Link your Discord account to play" });
            }

            const date = dailyQuestDateKey();
            const xenCasinoAccountId = await getXenCasinoAccountId();
            const result = await transfer({
                fromAccountId: xenCasinoAccountId,
                toAccountId: resolved.account.accountId,
                amount: reward.toFixed(10),
                key: `xdq-${userId}-${date}-${key}`,
                note: `daily_quest_reward_${key}`,
            });

            await XenCasinoUserState.markDailyQuestClaimed(userId, date, key);
            await XenCasinoActivity.record({ userId, game: `quest-reward-${key}`, wager: 0, payout: reward });

            return res.json({ status: true, data: { balance: result.toNewBalance, key, reward } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

};
