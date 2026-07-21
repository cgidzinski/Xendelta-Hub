import express = require("express");
import { authenticateToken } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/admin";
import { getLedger, getAccount, WeeabetsUnavailable } from "../../utils/weeabetsClient";
import { XENCASINO_DISCORD_ID } from "../../config/weeabets";
import { getCasinoStatus } from "../../utils/casinoStatus";
const { XenCasino } = require("../../models/xenCasino");

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
};

// Which games have progressive jackpots. Scratch tickets and Plinko do not - they
// show "—" in the jackpot column.
var JACKPOT_MACHINES = ["easy-spin", "spinmania"];
var PACHINKO_SLUG = "pachinko";

// Notes ending in one of these suffixes are game-round entries; everything else
// (daily_quest_reward, etc.) is excluded from stats aggregation.
var GAME_NOTE_SUFFIXES = ["_wager", "_win", "_jackpot"];

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

module.exports = function (app: express.Application) {

    // Per-game win/loss/round counts from the Weeabets ledger, plus current jackpot
    // pool values from the XenCasino singleton. Always returns all 6 registered games
    // (zero-filled when there's no ledger activity for a game).
    app.get("/api/admin/casino/stats", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
        try {
            var range = (req.query.range as string) || "all";
            var MAX_PAGES = range === "all" ? 10 : 2;
            var PAGE_SIZE = 500;

            var now = new Date();
            var cutoff: Date | null = null;
            if (range === "today") {
                cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
            } else if (range === "week") {
                cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 7 * 24 * 60 * 60 * 1000);
            }

            var games = new Map<string, { winAmount: number; lossAmount: number; roundsPlayed: number }>();
            var beforeId: number | undefined;
            var page = 0;
            var done = false;

            while (page < MAX_PAGES && !done) {
                var entries = await getLedger({ limit: PAGE_SIZE, beforeId: beforeId });
                if (entries.length === 0) break;

                for (var i = 0; i < entries.length; i++) {
                    var entry = entries[i];

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
            var status = err instanceof WeeabetsUnavailable ? 503 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
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

    // Daily breakdown for charts: per-day amount in, amount out, net, rounds played,
    // and end-of-day house balance (derived backwards from the current live balance).
    app.get("/api/admin/casino/daily-stats", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
        try {
            var days = Math.min(Math.max(parseInt(req.query.days as string) || 5, 1), 30);
            var PAGE_SIZE = 500;
            var MAX_PAGES = Math.ceil((days * 2) / (PAGE_SIZE / 500)) + 2;

            var now = new Date();
            var cutoff = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (days - 1) * 24 * 60 * 60 * 1000);

            var dayMap = new Map<string, { amountIn: number; amountOut: number; otherNet: number; roundsPlayed: number }>();

            // Seed all days so zero-activity days still appear.
            for (var d = 0; d < days; d++) {
                var date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - d * 24 * 60 * 60 * 1000);
                var key = date.toISOString().slice(0, 10);
                dayMap.set(key, { amountIn: 0, amountOut: 0, otherNet: 0, roundsPlayed: 0 });
            }

            var beforeId: number | undefined;
            var page = 0;
            var done = false;

            while (page < MAX_PAGES && !done) {
                var entries = await getLedger({ limit: PAGE_SIZE, beforeId: beforeId });
                if (entries.length === 0) break;

                for (var i = 0; i < entries.length; i++) {
                    var entry = entries[i];
                    var entryDate = new Date(entry.createdAt);

                    if (entryDate < cutoff) {
                        done = true;
                        break;
                    }

                    var dateKey = entryDate.toISOString().slice(0, 10);
                    var dayAgg = dayMap.get(dateKey);
                    if (!dayAgg) continue;

                    var amount = parseFloat(entry.amount);
                    if (isNaN(amount)) continue;

                    var parsed = parseGameNote(entry.note);
                    if (parsed) {
                        if (parsed.isWin) {
                            dayAgg.amountOut += amount;
                            dayAgg.otherNet -= amount;
                        } else {
                            dayAgg.amountIn += amount;
                            dayAgg.roundsPlayed += 1;
                            dayAgg.otherNet += amount;
                        }
                    } else {
                        // Non-game entry (daily quest reward, etc.) — still affects balance.
                        if (entry.entryType === "credit") {
                            dayAgg.otherNet += amount;
                        } else {
                            dayAgg.otherNet -= amount;
                        }
                    }
                }

                if (!done && entries.length === PAGE_SIZE) {
                    beforeId = entries[entries.length - 1].id;
                } else {
                    done = true;
                }
                page++;
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
                    net: agg.otherNet,
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
};
