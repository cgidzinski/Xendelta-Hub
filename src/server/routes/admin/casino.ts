import express = require("express");
import { authenticateToken } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/admin";
import { getAccount, resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../../utils/weeabetsClient";
import { XENCASINO_DISCORD_ID } from "../../config/weeabets";
import { getCasinoStatus } from "../../utils/casinoStatus";
import { AuthenticatedRequest } from "../../types/AuthenticatedRequest";
import { randomUUID } from "crypto";
const { XenCasino, XenCasinoActivity } = require("../../models/xenCasino");
const { User } = require("../../models/user");

// Mirrors the client-side CASINO_GAMES_REGISTRY order - stats are returned in this
// order so the admin table is deterministic.
var GAME_LABELS: Record<string, string> = {
    "easy-spin": "Easy Spin",
    "spinmania": "Spinmania",
    "kitty-scratch": "Kitty Scratch",
    "crossword": "Crossword",
    "plinko": "Plinko",
    "pachinko": "Pachinko",
    "memory": "Memory",
    "garden": "Casino Garden",
    "still": "Bootleg Still",
    "mine": "Chip Mine",
};

// Which games have progressive jackpots. Scratch tickets and Plinko do not - they
// show "—" in the jackpot column.
var JACKPOT_MACHINES = ["easy-spin", "spinmania"];
var PACHINKO_SLUG = "pachinko";

module.exports = function (app: express.Application) {

    // Per-game win/loss/round counts aggregated from the local XenCasinoActivity collection
    // (one row per settled round, written by recordCasinoRoundPlayed - see dailyQuest.ts),
    // plus current jackpot pool values from the XenCasino singleton. Always returns all 6
    // registered games (zero-filled when there's no recorded activity for a game).
    app.get("/api/admin/casino/stats", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
        try {
            var range = (req.query.range as string) || "all";

            var now = new Date();
            var cutoff: Date | null = null;
            if (range === "today") {
                cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            } else if (range === "week") {
                cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 7 * 24 * 60 * 60 * 1000);
            }

            var match: Record<string, unknown> = {};
            if (cutoff) {
                match.createdAt = { $gte: cutoff };
            }

            var rows = await XenCasinoActivity.aggregate([
                { $match: match },
                { $group: { _id: "$game", winAmount: { $sum: "$payout" }, lossAmount: { $sum: "$wager" }, roundsPlayed: { $sum: 1 } } },
            ]).exec();

            var games = new Map<string, { winAmount: number; lossAmount: number; roundsPlayed: number }>();
            for (var i = 0; i < rows.length; i++) {
                games.set(rows[i]._id, { winAmount: rows[i].winAmount, lossAmount: rows[i].lossAmount, roundsPlayed: rows[i].roundsPlayed });
            }

            // Fetch jackpot pools from the singleton.
            var casinoState = await XenCasino.getSingleton();
            var jackpots: Record<string, number> = {};
            for (var j = 0; j < JACKPOT_MACHINES.length; j++) {
                var machine = JACKPOT_MACHINES[j];
                var raw = casinoState.slotsJackpotPools.get(machine);
                jackpots[machine] = raw === undefined || raw === null ? 0 : raw;
            }
            jackpots[PACHINKO_SLUG] = casinoState.pachinkoJackpotPool || 0;

            // Build result: every registered game, zero-filled when there's no ledger
            // activity. Sorted in GAME_LABELS key order (matches the registry).
            var slugs = Object.keys(GAME_LABELS);
            var result = slugs.map(function (slug) {
                var agg = games.get(slug);
                return {
                    slug: slug,
                    label: GAME_LABELS[slug],
                    winAmount: (agg ? agg.winAmount : 0).toFixed(2),
                    lossAmount: (agg ? agg.lossAmount : 0).toFixed(2),
                    roundsPlayed: agg ? agg.roundsPlayed : 0,
                    jackpotPool: jackpots[slug] !== undefined ? jackpots[slug] : null,
                };
            });

            return res.json({ status: true, data: { range: range, games: result, jackpots: jackpots } });
        } catch (err) {
            return res.status(500).json({ status: false, message: (err as Error).message });
        }
    });

    // Resets every progressive jackpot (all slot machines plus Pachinko) back to its seed
    // value. All current jackpot machines seed at 0 (see JACKPOT_SEED in pachinkoPayouts.ts
    // and each slot machine's jackpotSeed config), so this always resets to 0 rather than
    // looking up each machine's individual seed.
    app.post("/api/admin/casino/jackpots/clear", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
        try {
            for (var j = 0; j < JACKPOT_MACHINES.length; j++) {
                await XenCasino.resetJackpotPool(JACKPOT_MACHINES[j], 0);
            }
            await XenCasino.resetPachinkoJackpotPool(0);

            return res.json({ status: true });
        } catch (err) {
            return res.status(500).json({ status: false, message: (err as Error).message });
        }
    });

    // Wipes every recorded round from XenCasinoActivity - the local collection admin
    // stats/daily-stats aggregate over (see the two GET routes above). Purely a reporting
    // reset: it never touches jackpot pools, the live Weeabets balance, or any in-flight
    // XenCasinoRound, so it can't affect real money or an active game.
    app.post("/api/admin/casino/stats/clear", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
        try {
            await XenCasinoActivity.clearAll();
            return res.json({ status: true });
        } catch (err) {
            return res.status(500).json({ status: false, message: (err as Error).message });
        }
    });

    // Daily breakdown for charts: per-day amount in, amount out, net, rounds played,
    // and end-of-day house balance (derived backwards from the current live balance).
    // amountIn/amountOut/roundsPlayed come from the local XenCasinoActivity collection - only
    // actual game rounds are recorded there (not daily-quest reward claims), so the per-day
    // net/balance here reflects wager/payout activity only, not quest-reward money movement.
    app.get("/api/admin/casino/daily-stats", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
        try {
            var days = Math.min(Math.max(parseInt(req.query.days as string) || 5, 1), 30);

            var now = new Date();
            var cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * 24 * 60 * 60 * 1000);

            var dayMap = new Map<string, { amountIn: number; amountOut: number; roundsPlayed: number }>();

            // Seed all days so zero-activity days still appear.
            for (var d = 0; d < days; d++) {
                var date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - d * 24 * 60 * 60 * 1000);
                var key = date.toISOString().slice(0, 10);
                dayMap.set(key, { amountIn: 0, amountOut: 0, roundsPlayed: 0 });
            }

            var rows = await XenCasinoActivity.aggregate([
                { $match: { createdAt: { $gte: cutoff } } },
                {
                    $group: {
                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: "UTC" } },
                        amountIn: { $sum: "$wager" },
                        amountOut: { $sum: "$payout" },
                        roundsPlayed: { $sum: 1 },
                    },
                },
            ]).exec();

            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                if (dayMap.has(row._id)) {
                    dayMap.set(row._id, { amountIn: row.amountIn, amountOut: row.amountOut, roundsPlayed: row.roundsPlayed });
                }
            }

            // Current live house balance.
            var houseAccount = await getAccount(XENCASINO_DISCORD_ID);
            var currentBalance = houseAccount ? parseFloat(houseAccount.balance) : 0;

            // Build sorted array, then compute end-of-day balances backwards.
            var sortedKeys = Array.from(dayMap.keys()).sort();
            var dailyRows: { date: string; balance: number; amountIn: number; amountOut: number; net: number; roundsPlayed: number }[] = [];

            for (var k = 0; k < sortedKeys.length; k++) {
                var dk = sortedKeys[k];
                var agg = dayMap.get(dk)!;
                dailyRows.push({
                    date: dk,
                    balance: 0,
                    amountIn: agg.amountIn,
                    amountOut: agg.amountOut,
                    net: agg.amountIn - agg.amountOut,
                    roundsPlayed: agg.roundsPlayed,
                });
            }

            var runningBalance = currentBalance;
            for (var r = dailyRows.length - 1; r >= 0; r--) {
                dailyRows[r].balance = runningBalance;
                runningBalance -= dailyRows[r].net;
            }

            return res.json({ status: true, data: { days: dailyRows } });
        } catch (err) {
            var status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    // Every registered game plus its enabled/disabled state, alongside the current
    // casino-wide open/closed status - the admin "Casino Controls" panel renders entirely
    // off this one call.
    app.get("/api/admin/casino/games", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
        try {
            var casinoState = await XenCasino.getSingleton();
            var slugs = Object.keys(GAME_LABELS);
            var games = slugs.map(function (slug) {
                return {
                    slug: slug,
                    label: GAME_LABELS[slug],
                    disabled: !!casinoState.disabledGames.get(slug),
                };
            });
            var casinoStatus = await getCasinoStatus();

            return res.json({ status: true, data: { games: games, casino: casinoStatus } });
        } catch (err) {
            var status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    // Enables/disables a single game - only blocks that game's wager-starting route
    // (see requireGameEnabled usage in each casinoGames route file); in-progress rounds
    // for that game can still resume/cash out normally.
    app.post("/api/admin/casino/games/:slug/toggle", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
        try {
            var slug = req.params.slug;
            if (!GAME_LABELS[slug]) {
                return res.status(404).json({ status: false, message: "Unknown game" });
            }
            var disabled = !!req.body.disabled;
            await XenCasino.setGameDisabled(slug, disabled);
            return res.json({ status: true, data: { slug: slug, disabled: disabled } });
        } catch (err) {
            return res.status(500).json({ status: false, message: (err as Error).message });
        }
    });

    // Whole-casino manual kill switch - combined with the live bank-balance auto-close check
    // in getCasinoStatus(). Reopening here clears the manual flag, but the casino stays
    // computed-closed if the bank is still under CASINO_MIN_BANK_BALANCE.
    app.post("/api/admin/casino/toggle-open", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
        try {
            var open = !!req.body.open;
            await XenCasino.setManuallyClosed(!open);
            var casinoStatus = await getCasinoStatus();
            return res.json({ status: true, data: casinoStatus });
        } catch (err) {
            return res.status(500).json({ status: false, message: (err as Error).message });
        }
    });

    // Recipient picker data source for "Send Cheddar" - every user with an active Discord
    // link (the only ones a Weeabets account can be resolved for). Pure Mongo projection,
    // no external calls, so it's cheap to load on every visit to this page.
    app.get("/api/admin/casino/discord-users", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
        try {
            const users = await User.find(
                { "authProviders.provider": "discord", "authProviders.isActive": true },
                "username avatar authProviders"
            ).exec();
            const result = users
                .map((u: any) => {
                    const discordProvider = (u.authProviders || []).find((p: any) => p.provider === "discord" && p.isActive);
                    return { _id: u._id, username: u.username, avatar: u.avatar, discordId: discordProvider?.providerId ?? null };
                })
                .filter((u: any) => u.discordId);
            return res.json({ status: true, data: { users: result } });
        } catch (err) {
            return res.status(500).json({ status: false, message: (err as Error).message });
        }
    });

    // Live cheddar balance for a single recipient, fetched only once an admin has
    // selected them (not folded into the list above - balance changes constantly, so
    // batching it there would mean one Weeabets call per Discord-linked user per load).
    app.get("/api/admin/casino/users/:userId/wallet", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
        const user = await User.findOne({ _id: req.params.userId }).exec();
        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }
        try {
            const resolved = await resolveUserAccount(user);
            if (!resolved.linked || !resolved.account) {
                return res.json({ status: true, data: { linked: false, balance: null } });
            }
            return res.json({ status: true, data: { linked: true, balance: resolved.account.balance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    // Admin-initiated cheddar grant, sourced from the house account - same transfer()
    // primitive every other payout (e.g. daily quest reward) goes through.
    app.post("/api/admin/casino/users/:userId/send-money", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
        const { userId } = req.params;
        const { amount, note, requestId } = req.body;
        const admin = (req as AuthenticatedRequest).user!;

        const amountNum = Number(amount);
        if (!Number.isFinite(amountNum) || amountNum <= 0) {
            return res.status(400).json({ status: false, message: "Amount must be a positive number" });
        }

        const user = await User.findOne({ _id: userId }).exec();
        if (!user) {
            return res.status(404).json({ status: false, message: "User not found" });
        }

        try {
            const resolved = await resolveUserAccount(user);
            if (!resolved.linked || !resolved.account) {
                return res.status(400).json({ status: false, message: "User has no linked Discord account" });
            }

            const xenCasinoAccountId = await getXenCasinoAccountId();
            // requestId is client-generated and reused across retries of the same unsubmitted
            // amount, so a client-side retry replays this same key rather than paying out twice.
            // Weeabets caps transfer keys at 64 chars, so this can't also embed the admin/target
            // ids - the UUID alone is already globally unique, which is all idempotency needs.
            const key = `xendelta-admin-grant-${requestId || randomUUID()}`;
            const trimmedNote = typeof note === "string" ? note.trim().slice(0, 200) : "";
            const result = await transfer({
                fromAccountId: xenCasinoAccountId,
                toAccountId: resolved.account.accountId,
                amount: amountNum.toFixed(10),
                key,
                note: `admin_grant:${admin.username}${trimmedNote ? ":" + trimmedNote : ""}`,
            });

            return res.json({
                status: true,
                message: `Sent ${amountNum.toLocaleString()} cheddar to ${user.username}`,
                data: { balance: result.toNewBalance },
            });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });
};
