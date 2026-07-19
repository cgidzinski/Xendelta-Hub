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
} from "../utils/weeabetsClient";
import { XENCASINO_DISCORD_ID } from "../config/weeabets";

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
        const limit = req.query.limit ? Number(req.query.limit) : undefined;
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

    // -------- Stats --------

    // Maps a game slug to its human-readable label. Mirrors the client-side
    // CASINO_GAMES_REGISTRY so the stats response is self-contained.
    var GAME_LABELS: Record<string, string> = {
        "easy-spin": "Easy Spin",
        "spinmania": "Spinmania",
        "kitty-scratch": "Kitty Scratch",
        "crossword": "Crossword",
        "plinko": "Plinko",
        "pachinko": "Pachinko",
    };

    // Notes ending in one of these suffixes are game-round entries; everything else
    // (daily_quest_reward, etc.) is excluded from stats aggregation.
    var GAME_NOTE_SUFFIXES = ["_wager", "_win", "_jackpot"];

    // Notes on ledger entries whose slug matches our known game list — "the house took
    // money from a player" is a credit (loss from the player's perspective); "the house
    // paid a player" is a debit (win). The parenthetical note field suffix tells us
    // which kind of round it was.
    function parseGameNote(note: string): { slug: string; isWin: boolean } | null {
        for (var i = 0; i < GAME_NOTE_SUFFIXES.length; i++) {
            var suffix = GAME_NOTE_SUFFIXES[i];
            if (note.endsWith(suffix)) {
                var slug = note.slice(0, note.length - suffix.length);
                if (GAME_LABELS[slug]) {
                    return { slug: slug, isWin: suffix !== "_wager" };
                }
            }
        }
        return null;
    }

    // Global (house-level) win/loss stats per game, derived from the Weeabets ledger.
    // Accepts ?range=today|week|all (default: all).  Paginates through ledger entries
    // up to a safety cap so "all" doesn't grow unbounded.
    app.get("/api/casino/stats", authenticateToken, async function (req: express.Request, res: express.Response) {
        try {
            var range = (req.query.range as string) || "all";
            var MAX_PAGES = range === "all" ? 10 : 2; // 500 / 100 entries per page
            var PAGE_SIZE = 500;

            var now = new Date();
            var cutoff: Date | null = null;
            if (range === "today") {
                cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            } else if (range === "week") {
                cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 7 * 24 * 60 * 60 * 1000);
            }

            // Per-game aggregates keyed by slug.
            var games = new Map<string, { winAmount: number; lossAmount: number; roundsPlayed: number }>();
            var beforeId: number | undefined;
            var page = 0;
            var done = false;

            while (page < MAX_PAGES && !done) {
                var entries = await getLedger({ limit: PAGE_SIZE, beforeId: beforeId });
                if (entries.length === 0) break;

                for (var i = 0; i < entries.length; i++) {
                    var entry = entries[i];

                    // Stop early when we've passed the cutoff date (ledger is
                    // reverse-chronological so entries only get older as we page).
                    if (cutoff) {
                        var entryDate = new Date(entry.createdAt);
                        if (entryDate < cutoff) {
                            done = true;
                            break;
                        }
                    }

                    var parsed = parseGameNote(entry.note);
                    if (!parsed) continue;

                    var amount = parseFloat(entry.amount);
                    if (isNaN(amount)) continue;

                    var agg = games.get(parsed.slug);
                    if (!agg) {
                        agg = { winAmount: 0, lossAmount: 0, roundsPlayed: 0 };
                        games.set(parsed.slug, agg);
                    }

                    if (parsed.isWin) {
                        agg.winAmount += amount;
                    } else {
                        agg.lossAmount += amount;
                        agg.roundsPlayed += 1;
                    }
                }

                if (!done && entries.length === PAGE_SIZE) {
                    beforeId = entries[entries.length - 1].id;
                } else {
                    done = true;
                }
                page++;
            }

            // Serialize to the shape the client expects, sorted by the registry order.
            var result = Array.from(games.entries())
                .map(function (kv) {
                    return {
                        slug: kv[0],
                        label: GAME_LABELS[kv[0]] || kv[0],
                        winAmount: kv[1].winAmount.toFixed(2),
                        lossAmount: kv[1].lossAmount.toFixed(2),
                        roundsPlayed: kv[1].roundsPlayed,
                    };
                })
                .sort(function (a, b) {
                    var order = Object.keys(GAME_LABELS);
                    return order.indexOf(a.slug) - order.indexOf(b.slug);
                });

            return res.json({ status: true, data: { range: range, games: result } });
        } catch (err) {
            var status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });
};
