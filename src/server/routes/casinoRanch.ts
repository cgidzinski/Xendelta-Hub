/**
 * Cheddar Ranch - a creature-collection game. Hatching a Cheddar Egg draws one of five
 * weighted rarity tiers (Common -> Legendary); a rarer tier means a higher starting stat
 * range across all 5 stats (Speed/Stamina/Power/Intelligence/Luck), snapshotted onto the
 * creature at hatch time so a later RANCH_RARITY_TIERS rebalance never retroactively
 * changes a creature already in the roster. The roster itself is the game's inventory -
 * each creature is its own document (XenCasinoRanchCreature in
 * src/server/models/xenCasino.js). There is no stat ceiling - feeding always raises every
 * stat, for as long as you keep feeding.
 *
 * Feeding requires owning a Feed item (a single kind, bought with cheddar from the Shop)
 * rather than paying cheddar directly, so feeding itself moves no money and needs no
 * Weeabets call - using one rolls an independent random gain for every stat at once.
 *
 * Racing is a two-step "prepare, then bet" flow, not a single request, because the player
 * needs to see the field and odds before any money moves:
 *   1. POST /:id/race/prepare - picks a random course (weights the 5 stats differently,
 *      same idea as the old player-picked categories but now randomly spun instead - see
 *      RACE_COURSES), rolls 3 rival creatures from the same rarity tier as the player's
 *      own creature, and runs a fast internal Monte Carlo (estimateWinProbabilities) to
 *      compute a bookmaker-style odds table for the 4-racer field (the player's creature +
 *      3 rivals). No money moves. The exact field/course/odds shown to the player is
 *      stored server-side (XenCasinoRanchPendingRace) so a later bet can never be resolved
 *      against anything re-rolled or client-supplied.
 *   2. POST /:id/race/bet - the player bets a stake on any one of the 4 racers (their own
 *      creature or any rival). Debits the stake, then runs ONE real call to simulateRace
 *      (the exact same scoring function the odds were estimated from) against the stored
 *      field/course to decide the actual winner and finishing order, pays out
 *      stake * multiplier if the bet racer won, and clears the pending race. The player's
 *      own creature's win/loss record and XP are updated based on whether IT placed first
 *      - independent of which racer was bet on.
 * The client plays a purely cosmetic CSS-transition "race" animation using the finishing
 * order the bet response already decided - it never decides anything itself.
 *
 * Feeding and racing (a creature racing, win or lose - not betting) earn XP; level is
 * deliberately never stored, only derived from XP on read (see levelForXp), same "derive
 * from persisted counters" convention as Printer's currentMultiplier. Each species also
 * produces its own fixed item on a 24h manual-collect cooldown (see
 * XenCasinoRanchCreature.collect); the quantity produced per collection scales with the
 * creature's current level. Collected items land in a per-user fungible stack
 * (XenCasinoRanchInventory, shared with the bought Feed item under a different key) that
 * can be sold for cheddar or "used" - used is a stub for now (consumes the item, no effect
 * yet).
 *
 * Every Weeabets transfer key here is a short random token (txnKey), not userId+creatureId
 * embedded directly - both are 24-char Mongo ObjectIds, and prefix + both + a timestamp
 * blows past Weeabets' 64-character key limit (this is exactly what broke feeding before
 * Feed became item-based instead of a direct charge).
 */
import express = require("express");
import { randomBytes } from "crypto";
import { authenticateToken } from "../middleware/auth";
import { AuthenticatedRequest } from "../types/AuthenticatedRequest";
const { User } = require("../models/user");
const { XenCasinoRanchCreature, XenCasinoRanchInventory, XenCasinoRanchPendingRace, XenCasinoActivity } = require("../models/xenCasino");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../utils/weeabetsClient";
import { requireGameEnabled } from "../utils/casinoStatus";
import { recordCasinoRoundPlayed } from "../utils/dailyQuest";
import { drawPrizeWeight } from "./casinoGames/prizeWeights";

const SLUG = "cheddar-ranch";

function txnKey(prefix: string): string {
    return `${prefix}-${randomBytes(8).toString("hex")}`;
}

export interface RanchStats {
    speed: number;
    stamina: number;
    power: number;
    intelligence: number;
    luck: number;
}
const STAT_KEYS: (keyof RanchStats)[] = ["speed", "stamina", "power", "intelligence", "luck"];

const HATCH_PRICE = 2000; // one flat "Cheddar Egg" price - rarity is what varies, not price tiers

interface RarityTier {
    key: string;
    label: string;
    weight: number;
    statRange: [number, number]; // per-stat roll range at hatch time
}

// Weights sum to 1000 -> 50% / 25% / 15% / 7% / 3%. Ordered common-to-rare on purpose, same
// as Mine's MINE_ORE_TIERS, so a glance at the list reads as a rarity ladder.
export const RANCH_RARITY_TIERS: RarityTier[] = [
    { key: "common", label: "Common", weight: 500, statRange: [10, 25] },
    { key: "uncommon", label: "Uncommon", weight: 250, statRange: [20, 40] },
    { key: "rare", label: "Rare", weight: 150, statRange: [35, 60] },
    { key: "epic", label: "Epic", weight: 70, statRange: [55, 85] },
    { key: "legendary", label: "Legendary", weight: 30, statRange: [80, 120] },
];

// Cosmetic flavor only - picked at random within the hatched tier, no gameplay effect.
const SPECIES_BY_TIER: Record<string, string[]> = {
    common: ["Cheddar Chick", "Barnyard Pup", "Field Mouse"],
    uncommon: ["Ridgeback Goat", "Marsh Otter", "Meadow Fox"],
    rare: ["Thundercalf", "Moonlit Lynx", "Cave Badger"],
    epic: ["Gilded Ram", "Storm Falcon", "Ember Wolf"],
    legendary: ["Cheddar Wyrm", "Solar Stag", "Void Kraken"],
};

const FEED_COOLDOWN_MS = 30 * 60 * 1000;
const FEED_GAIN_RANGE: [number, number] = [1, 4];

// A single Feed item - bought in the Shop, consumed in the Ranch to bump every stat at
// once by an independently rolled amount. Priced higher than the old per-stat items (which
// were 500 each and only trained one stat) since one purchase now trains all 5.
const FEED_ITEM_KEY = "feed";
const FEED_ITEM_LABEL = "Feed";
const FEED_PRICE = 1200;

const RELEASE_SELL_VALUE: Record<string, number> = {
    common: 300,
    uncommon: 800,
    rare: 2000,
    epic: 6000,
    legendary: 20000,
};

// Flat XP-per-level curve - level is never persisted, only derived from a creature's xp
// field on read (see the schema comment in xenCasino.js).
const XP_PER_LEVEL = 100;
const FEED_XP = 10;
const RACE_WIN_XP = 15;
const RACE_LOSS_XP = 5; // still rewarded for placing worse than 1st - racing itself, not just winning, is what trains a creature

export function levelForXp(xp: number): number {
    return Math.floor(xp / XP_PER_LEVEL) + 1;
}

interface RaceCourse {
    key: string;
    label: string;
    // Multiplies each stat before summing into the effective total used for the race
    // simulation - a course weighted toward one stat rewards a creature built around that
    // stat, rather than every course rewarding raw total stats the same way. Randomly spun
    // per race (pickCourse) rather than player-picked.
    weights: RanchStats;
}

// One course per stat, plus one flat "all-rounder" course for variety - covers all 5 stats
// now that Intelligence/Luck exist. No weight field needed here (unlike
// RANCH_RARITY_TIERS) since this isn't a gacha table - pickCourse is a plain uniform pick.
export const RACE_COURSES: RaceCourse[] = [
    { key: "sprint", label: "Sprint", weights: { speed: 2, stamina: 0.5, power: 0.5, intelligence: 0.5, luck: 0.5 } },
    { key: "endurance", label: "Endurance", weights: { speed: 0.5, stamina: 2, power: 0.5, intelligence: 0.5, luck: 0.5 } },
    { key: "brawl", label: "Brawl", weights: { speed: 0.5, stamina: 0.5, power: 2, intelligence: 0.5, luck: 0.5 } },
    { key: "puzzle-maze", label: "Puzzle Maze", weights: { speed: 0.5, stamina: 0.5, power: 0.5, intelligence: 2, luck: 0.5 } },
    { key: "lucky-clover", label: "Lucky Clover Run", weights: { speed: 0.5, stamina: 0.5, power: 0.5, intelligence: 0.5, luck: 2 } },
    { key: "all-rounder", label: "All-Rounder Pasture", weights: { speed: 1, stamina: 1, power: 1, intelligence: 1, luck: 1 } },
];

export function pickCourse(): RaceCourse {
    return RACE_COURSES[Math.floor(Math.random() * RACE_COURSES.length)];
}

// Pure and exported so casinoRanch.test.ts can check the weighting directly.
export function effectiveRaceTotal(stats: RanchStats, course: RaceCourse): number {
    return STAT_KEYS.reduce((sum, key) => sum + stats[key] * course.weights[key], 0);
}

const COLLECT_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// One fixed item per species (not per rarity tier or per individual creature) - every
// creature of a given species always produces the same item, but how much a given
// collection yields scales with that specific creature's own level (see the /collect
// route). Sell values roughly track the rarity tier each species belongs to.
const ITEM_DEFS: Record<string, { key: string; label: string; sellValue: number }> = {
    "down-feather": { key: "down-feather", label: "Down Feather", sellValue: 20 },
    "puppy-fluff": { key: "puppy-fluff", label: "Puppy Fluff", sellValue: 20 },
    "whisker-tuft": { key: "whisker-tuft", label: "Whisker Tuft", sellValue: 20 },
    "goat-milk": { key: "goat-milk", label: "Goat Milk", sellValue: 60 },
    "otter-pelt": { key: "otter-pelt", label: "Otter Pelt", sellValue: 60 },
    "fox-tail": { key: "fox-tail", label: "Fox Tail", sellValue: 60 },
    "storm-hide": { key: "storm-hide", label: "Storm Hide", sellValue: 150 },
    "moon-fang": { key: "moon-fang", label: "Moon Fang", sellValue: 150 },
    "badger-claw": { key: "badger-claw", label: "Badger Claw", sellValue: 150 },
    "gilded-horn": { key: "gilded-horn", label: "Gilded Horn", sellValue: 400 },
    "falcon-plume": { key: "falcon-plume", label: "Falcon Plume", sellValue: 400 },
    "ember-fur": { key: "ember-fur", label: "Ember Fur", sellValue: 400 },
    "wyrm-scale": { key: "wyrm-scale", label: "Wyrm Scale", sellValue: 1200 },
    "solar-antler": { key: "solar-antler", label: "Solar Antler", sellValue: 1200 },
    "void-ink": { key: "void-ink", label: "Void Ink", sellValue: 1200 },
};

const SPECIES_ITEM_KEY: Record<string, string> = {
    "Cheddar Chick": "down-feather",
    "Barnyard Pup": "puppy-fluff",
    "Field Mouse": "whisker-tuft",
    "Ridgeback Goat": "goat-milk",
    "Marsh Otter": "otter-pelt",
    "Meadow Fox": "fox-tail",
    "Thundercalf": "storm-hide",
    "Moonlit Lynx": "moon-fang",
    "Cave Badger": "badger-claw",
    "Gilded Ram": "gilded-horn",
    "Storm Falcon": "falcon-plume",
    "Ember Wolf": "ember-fur",
    "Cheddar Wyrm": "wyrm-scale",
    "Solar Stag": "solar-antler",
    "Void Kraken": "void-ink",
};

function randomInRange([lo, hi]: [number, number]): number {
    return lo + Math.random() * (hi - lo);
}

function randomSpecies(tierKey: string): string {
    const species = SPECIES_BY_TIER[tierKey] ?? SPECIES_BY_TIER.common;
    return species[Math.floor(Math.random() * species.length)];
}

function rollStatsInRange(range: [number, number]): RanchStats {
    return {
        speed: Math.round(randomInRange(range)),
        stamina: Math.round(randomInRange(range)),
        power: Math.round(randomInRange(range)),
        intelligence: Math.round(randomInRange(range)),
        luck: Math.round(randomInRange(range)),
    };
}

// Draws a rarity tier and rolls all 5 stats within that tier's range - pure and exported so
// casinoRanch.test.ts can Monte Carlo it directly against the theoretical distribution
// below, same pattern as kittyScratch.ts's generateRound().
export function rollHatch(): { tier: RarityTier; stats: RanchStats } {
    const tier = drawPrizeWeight(RANCH_RARITY_TIERS);
    return { tier, stats: rollStatsInRange(tier.statRange) };
}

// Theoretical hatch-tier probabilities implied by RANCH_RARITY_TIERS' weights - what the
// test file checks a real Monte Carlo run of rollHatch() against.
export function rarityDistribution(): { key: string; probability: number }[] {
    const total = RANCH_RARITY_TIERS.reduce((sum, t) => sum + t.weight, 0);
    return RANCH_RARITY_TIERS.map((t) => ({ key: t.key, probability: t.weight / total }));
}

// Rolls one gain per stat for a single Feed item - independent of any particular stat
// choice, since Feed now trains everything at once.
export function rollFeedGains(): RanchStats {
    return {
        speed: Math.round(randomInRange(FEED_GAIN_RANGE)),
        stamina: Math.round(randomInRange(FEED_GAIN_RANGE)),
        power: Math.round(randomInRange(FEED_GAIN_RANGE)),
        intelligence: Math.round(randomInRange(FEED_GAIN_RANGE)),
        luck: Math.round(randomInRange(FEED_GAIN_RANGE)),
    };
}

// A rival's stats/species are rolled from the SAME rarity tier as the player's own
// creature (reusing RANCH_RARITY_TIERS/SPECIES_BY_TIER directly, not a second stat
// generation system) so the field stays naturally competitive without a separate
// opponent-scaling formula.
export function rollRival(tierKey: string): { species: string; stats: RanchStats } {
    const tier = RANCH_RARITY_TIERS.find((t) => t.key === tierKey) ?? RANCH_RARITY_TIERS[0];
    return { species: randomSpecies(tier.key), stats: rollStatsInRange(tier.statRange) };
}

// Rivals have no persisted XP (they aren't real roster creatures) - "level" here is a
// flavor-only display value derived from rarity tier, deliberately not meant to line up
// with levelForXp's curve.
const RIVAL_LEVEL_BY_TIER: Record<string, number> = { common: 1, uncommon: 3, rare: 5, epic: 7, legendary: 9 };
export function rivalLevelForTier(tierKey: string): number {
    return RIVAL_LEVEL_BY_TIER[tierKey] ?? 1;
}

export interface Racer {
    id: string;
    isPlayer: boolean;
    species: string;
    name: string;
    level: number;
    stats: RanchStats;
}
export interface RaceResultEntry {
    racerId: string;
    raceScore: number;
    place: number;
}

const RACE_SCORE_NOISE_RANGE: [number, number] = [0.8, 1.2];

function raceScore(stats: RanchStats, course: RaceCourse): number {
    return effectiveRaceTotal(stats, course) * randomInRange(RACE_SCORE_NOISE_RANGE);
}

// THE single source of truth for who wins a race - both estimateWinProbabilities below and
// the real bet-resolution route call this same function. Sorts descending by raceScore and
// assigns places 1..N - there is no separate "decide the winner" step and "fake an order for
// the animation" step, it's the same roll used for both.
export function simulateRace(racers: Racer[], course: RaceCourse): RaceResultEntry[] {
    return racers
        .map((r) => ({ racerId: r.id, raceScore: raceScore(r.stats, course) }))
        .sort((a, b) => b.raceScore - a.raceScore)
        .map((entry, i) => ({ ...entry, place: i + 1 }));
}

const PROBABILITY_TRIALS = 4000; // tight enough (roughly +/-1.5%) while staying fast within one request

// No closed form for "probability this racer has the max of N independently-noised scores"
// without real order-statistics math a ranch game doesn't need - a few thousand internal
// trials of the exact same simulateRace formula is simpler, matches exactly what the real
// resolution will do, and is plenty precise for display odds + a payout multiplier.
export function estimateWinProbabilities(racers: Racer[], course: RaceCourse, trials: number = PROBABILITY_TRIALS): Record<string, number> {
    const wins: Record<string, number> = {};
    racers.forEach((r) => (wins[r.id] = 0));
    for (let i = 0; i < trials; i++) {
        wins[simulateRace(racers, course)[0].racerId] += 1;
    }
    const probs: Record<string, number> = {};
    racers.forEach((r) => (probs[r.id] = wins[r.id] / trials));
    return probs;
}

export const RACE_TARGET_RTP = 0.9;
export const MIN_RACE_MULTIPLIER = 1.05;
export const MAX_RACE_MULTIPLIER = 8;

// Fair-odds multiplier scaled to a target RTP: unclamped, multiplierForProbability(p) * p
// === RACE_TARGET_RTP (a plain bookmaker formula), so a favorite pays a low multiplier and
// a longshot pays a high one. Clamped so a longshot payout can't run away - the clamp only
// bites at the extremes, producing an intentional favorite-longshot bias (favorites pay
// slightly above target RTP, extreme longshots pay below it), which is realistic bookmaker
// behavior, not a bug.
export function multiplierForProbability(p: number): number {
    return Math.min(MAX_RACE_MULTIPLIER, Math.max(MIN_RACE_MULTIPLIER, RACE_TARGET_RTP / p));
}

const MIN_RACE_STAKE = 100;
const MAX_RACE_STAKE = 5000;
const PENDING_RACE_TTL_MS = 10 * 60 * 1000;

function creatureView(doc: any) {
    return {
        id: String(doc._id),
        species: doc.species,
        name: doc.name,
        rarityTier: doc.rarityTier,
        stats: doc.stats,
        lastFedAt: doc.lastFedAt,
        feedCount: doc.feedCount,
        raceWins: doc.raceWins,
        raceLosses: doc.raceLosses,
        xp: doc.xp,
        level: levelForXp(doc.xp),
        lastCollectedAt: doc.lastCollectedAt,
        itemKey: SPECIES_ITEM_KEY[doc.species],
        itemLabel: ITEM_DEFS[SPECIES_ITEM_KEY[doc.species]]?.label,
        createdAt: doc.createdAt,
    };
}

// Lazy one-time backfill for creatures hatched before Intelligence/Luck existed - this repo
// has no migration-script convention, so heal-on-read is the established pattern here (see
// e.g. XenCasinoMineState's lazy digsDate reset). findOneAndUpdate does not run
// full-document validators, so this is safe even though the schema paths are `required`.
async function ensureFiveStats(creature: any) {
    if (!creature) {
        return creature;
    }
    const tier = RANCH_RARITY_TIERS.find((t) => t.key === creature.rarityTier) ?? RANCH_RARITY_TIERS[0];
    const missing: Record<string, number> = {};
    for (const key of STAT_KEYS) {
        if (creature.stats[key] === undefined || creature.stats[key] === null) {
            missing["stats." + key] = Math.round(randomInRange(tier.statRange));
        }
    }
    if (Object.keys(missing).length === 0) {
        return creature;
    }
    return XenCasinoRanchCreature.findByIdAndUpdate(creature._id, { $set: missing }, { new: true }).exec();
}

async function inventoryDoc(userId: string) {
    return XenCasinoRanchInventory.getState(userId);
}

async function itemsView(userId: string) {
    const doc = await inventoryDoc(userId);
    const entries: { key: string; label: string; quantity: number; sellValue: number }[] = [];
    for (const key of Object.keys(ITEM_DEFS)) {
        const quantity: number = doc.items.get(key) || 0;
        if (quantity > 0) {
            entries.push({ key, label: ITEM_DEFS[key].label, quantity, sellValue: ITEM_DEFS[key].sellValue });
        }
    }
    return entries;
}

async function feedItemView(userId: string) {
    const doc = await inventoryDoc(userId);
    return { key: FEED_ITEM_KEY, label: FEED_ITEM_LABEL, price: FEED_PRICE, quantity: doc.items.get(FEED_ITEM_KEY) || 0 };
}

async function pendingRaceView(userId: string) {
    const doc = await XenCasinoRanchPendingRace.getState(userId);
    if (!doc.pending || new Date(doc.pending.expiresAt).getTime() < Date.now()) {
        return null;
    }
    return doc.pending;
}

async function rosterView(userId: string) {
    const rawCreatures = await XenCasinoRanchCreature.listByUser(userId);
    const creatures = await Promise.all(rawCreatures.map((c: any) => ensureFiveStats(c)));
    const items = await itemsView(userId);
    const feedItem = await feedItemView(userId);
    const pendingRace = await pendingRaceView(userId);
    return {
        creatures: creatures.map(creatureView),
        items,
        feedItem,
        pendingRace,
        rarityTiers: RANCH_RARITY_TIERS.map((t) => ({
            key: t.key,
            label: t.label,
            probability: t.weight / RANCH_RARITY_TIERS.reduce((sum, x) => sum + x.weight, 0),
            statRange: t.statRange,
        })),
        raceCourses: RACE_COURSES.map((c) => ({ key: c.key, label: c.label, weights: c.weights })),
        hatchPrice: HATCH_PRICE,
        feedCooldownMs: FEED_COOLDOWN_MS,
        minRaceStake: MIN_RACE_STAKE,
        maxRaceStake: MAX_RACE_STAKE,
        releaseSellValue: RELEASE_SELL_VALUE,
        collectCooldownMs: COLLECT_COOLDOWN_MS,
    };
}

module.exports = function (app: express.Application) {

    app.get("/api/casino/ranch", authenticateToken, async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        return res.json({ status: true, data: await rosterView(userId) });
    });

    app.post("/api/casino/ranch/hatch", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
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
            const xenCasinoAccountId = await getXenCasinoAccountId();
            await transfer({
                fromAccountId: resolved.account.accountId,
                toAccountId: xenCasinoAccountId,
                amount: HATCH_PRICE.toFixed(10),
                key: txnKey("ranch-hatch"),
                note: "ranch_hatch",
            });

            let creature;
            try {
                const { tier, stats } = rollHatch();
                const species = randomSpecies(tier.key);
                creature = await XenCasinoRanchCreature.createForUser(userId, {
                    species,
                    name: species,
                    rarityTier: tier.key,
                    stats,
                });
            } catch (creationErr) {
                await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: resolved.account.accountId,
                    amount: HATCH_PRICE.toFixed(10),
                    key: txnKey("ranch-hatch-refund"),
                    note: "ranch_hatch_refund",
                });
                throw creationErr;
            }

            await recordCasinoRoundPlayed(userId, { game: SLUG, wager: HATCH_PRICE, payout: 0 });
            return res.json({ status: true, data: { creature: creatureView(creature), roster: await rosterView(userId) } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    // Feeding moves no money - the cheddar was already spent buying the Feed item (see
    // /feed/buy below). Rolls one independent gain per stat and applies all 5 in a single
    // atomic update.
    app.post("/api/casino/ranch/:id/feed", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { id } = req.params;

        let existing = await XenCasinoRanchCreature.getOwned(userId, id);
        if (!existing) {
            return res.status(404).json({ status: false, message: "Creature not found" });
        }
        existing = await ensureFiveStats(existing);
        if (existing.lastFedAt && Date.now() - new Date(existing.lastFedAt).getTime() < FEED_COOLDOWN_MS) {
            return res.status(400).json({ status: false, message: "This creature is still on cooldown" });
        }

        const consumed = await XenCasinoRanchInventory.subtractItem(userId, FEED_ITEM_KEY, 1);
        if (!consumed) {
            return res.status(400).json({ status: false, message: "Buy some Feed from the Shop first" });
        }

        const gains = rollFeedGains();
        const updated = await XenCasinoRanchCreature.feed(userId, id, gains, FEED_COOLDOWN_MS);

        if (!updated) {
            // Lost the race against the cooldown between our pre-check and the atomic
            // update above - give the consumed Feed item back rather than eating it for
            // nothing.
            await XenCasinoRanchInventory.addItem(userId, FEED_ITEM_KEY, 1);
            return res.status(400).json({ status: false, message: "This creature is still on cooldown" });
        }

        const withXp = await XenCasinoRanchCreature.addXp(userId, id, FEED_XP);
        return res.json({ status: true, data: { creature: creatureView(withXp ?? updated), gains } });
    });

    app.post("/api/casino/ranch/:id/release", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { id } = req.params;

        const creature = await XenCasinoRanchCreature.getOwned(userId, id);
        if (!creature) {
            return res.status(404).json({ status: false, message: "Creature not found" });
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
            const sellValue = RELEASE_SELL_VALUE[creature.rarityTier] ?? 0;
            const payoutResult = await transfer({
                fromAccountId: xenCasinoAccountId,
                toAccountId: resolved.account.accountId,
                amount: sellValue.toFixed(10),
                key: txnKey("ranch-release"),
                note: "ranch_release",
            });

            await XenCasinoRanchCreature.releaseOwned(userId, id);
            await XenCasinoActivity.record({ game: SLUG, userId, wager: 0, payout: sellValue });
            await XenCasinoRanchPendingRace.clearPending(userId);

            return res.json({ status: true, data: { sellValue, balance: payoutResult.toNewBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    // No cheddar changes hands here - production is free, so unlike hatch/release/sell/buy
    // there's no Weeabets transfer (and so no refund-on-failure dance needed) - just the
    // cooldown guard and an inventory credit.
    app.post("/api/casino/ranch/:id/collect", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { id } = req.params;

        const existing = await XenCasinoRanchCreature.getOwned(userId, id);
        if (!existing) {
            return res.status(404).json({ status: false, message: "Creature not found" });
        }
        const itemKey = SPECIES_ITEM_KEY[existing.species];
        const itemDef = itemKey ? ITEM_DEFS[itemKey] : undefined;
        if (!itemDef) {
            return res.status(400).json({ status: false, message: "This creature doesn't produce anything" });
        }

        const updated = await XenCasinoRanchCreature.collect(userId, id, COLLECT_COOLDOWN_MS);
        if (!updated) {
            return res.status(400).json({ status: false, message: "Nothing ready to collect yet" });
        }

        const quantity = levelForXp(updated.xp);
        await XenCasinoRanchInventory.addItem(userId, itemKey, quantity);

        return res.json({
            status: true,
            data: { creature: creatureView(updated), item: { key: itemKey, label: itemDef.label, quantity }, items: await itemsView(userId) },
        });
    });

    app.post("/api/casino/ranch/items/:key/sell", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { key } = req.params;
        const itemDef = ITEM_DEFS[key];
        if (!itemDef) {
            return res.status(400).json({ status: false, message: "Invalid item" });
        }

        const inventory = await inventoryDoc(userId);
        const quantity: number = inventory.items.get(key) || 0;
        if (quantity <= 0) {
            return res.status(400).json({ status: false, message: "You don't have any of this item" });
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
            const totalValue = quantity * itemDef.sellValue;
            const payoutResult = await transfer({
                fromAccountId: xenCasinoAccountId,
                toAccountId: resolved.account.accountId,
                amount: totalValue.toFixed(10),
                key: txnKey("ranch-sell"),
                note: `ranch_sell_${key}`,
            });

            await XenCasinoRanchInventory.subtractItem(userId, key, quantity);
            await XenCasinoActivity.record({ game: SLUG, userId, wager: 0, payout: totalValue });

            return res.json({ status: true, data: { quantity, totalValue, balance: payoutResult.toNewBalance, items: await itemsView(userId) } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    // Placeholder - consumes one unit but has no effect yet. Kept as its own endpoint (not
    // just left unbuilt) so the item-use flow already exists end to end for whenever a real
    // effect gets designed.
    app.post("/api/casino/ranch/items/:key/use", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { key } = req.params;
        if (!ITEM_DEFS[key]) {
            return res.status(400).json({ status: false, message: "Invalid item" });
        }

        const updated = await XenCasinoRanchInventory.subtractItem(userId, key, 1);
        if (!updated) {
            return res.status(400).json({ status: false, message: "You don't have any of this item" });
        }

        return res.json({ status: true, data: { message: "Nothing happens... yet.", items: await itemsView(userId) } });
    });

    app.post("/api/casino/ranch/feed/buy", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
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
            const xenCasinoAccountId = await getXenCasinoAccountId();
            const payoutResult = await transfer({
                fromAccountId: resolved.account.accountId,
                toAccountId: xenCasinoAccountId,
                amount: FEED_PRICE.toFixed(10),
                key: txnKey("ranch-buy-feed"),
                note: "ranch_buy_feed",
            });

            try {
                await XenCasinoRanchInventory.addItem(userId, FEED_ITEM_KEY, 1);
            } catch (creditErr) {
                await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: resolved.account.accountId,
                    amount: FEED_PRICE.toFixed(10),
                    key: txnKey("ranch-buy-feed-refund"),
                    note: "ranch_buy_feed_refund",
                });
                throw creditErr;
            }

            await XenCasinoActivity.record({ game: SLUG, userId, wager: FEED_PRICE, payout: 0 });
            return res.json({ status: true, data: { balance: payoutResult.fromNewBalance, feedItem: await feedItemView(userId) } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    // No money moves here - just rolls the field (course + 3 rivals) and estimates odds,
    // then stores exactly what's returned so the later bet can only ever resolve against
    // what the player was actually shown.
    app.post(
        "/api/casino/ranch/:id/race/prepare",
        authenticateToken,
        requireGameEnabled(SLUG),
        async function (req: express.Request, res: express.Response) {
            const userId = String((req as AuthenticatedRequest).user!._id);
            const { id } = req.params;

            let creature = await XenCasinoRanchCreature.getOwned(userId, id);
            if (!creature) {
                return res.status(404).json({ status: false, message: "Creature not found" });
            }
            creature = await ensureFiveStats(creature);

            const course = pickCourse();
            const rivals: Racer[] = [1, 2, 3].map((n) => {
                const rival = rollRival(creature.rarityTier);
                return {
                    id: `rival-${n}`,
                    isPlayer: false,
                    species: rival.species,
                    name: rival.species,
                    level: rivalLevelForTier(creature.rarityTier),
                    stats: rival.stats,
                };
            });
            const racers: Racer[] = [
                { id: "player", isPlayer: true, species: creature.species, name: creature.name, level: levelForXp(creature.xp), stats: creature.stats },
                ...rivals,
            ];

            const probabilities = estimateWinProbabilities(racers, course);
            const odds = racers.map((r) => ({
                racerId: r.id,
                winProbability: probabilities[r.id],
                multiplier: Number(multiplierForProbability(probabilities[r.id]).toFixed(2)),
            }));

            const now = new Date();
            const pending = {
                creatureId: id,
                course,
                racers,
                odds,
                createdAt: now,
                expiresAt: new Date(now.getTime() + PENDING_RACE_TTL_MS),
            };
            await XenCasinoRanchPendingRace.startPending(userId, pending);

            return res.json({ status: true, data: { pending } });
        }
    );

    app.post(
        "/api/casino/ranch/:id/race/bet",
        authenticateToken,
        requireGameEnabled(SLUG),
        async function (req: express.Request, res: express.Response) {
            const userId = String((req as AuthenticatedRequest).user!._id);
            const { id } = req.params;
            const { racerId, stake } = req.body as { racerId?: string; stake?: number };

            if (typeof stake !== "number" || !Number.isFinite(stake) || stake < MIN_RACE_STAKE || stake > MAX_RACE_STAKE) {
                return res.status(400).json({ status: false, message: `Stake must be between ${MIN_RACE_STAKE} and ${MAX_RACE_STAKE}` });
            }

            const state = await XenCasinoRanchPendingRace.getState(userId);
            const pending = state.pending;
            if (!pending || pending.creatureId !== id || new Date(pending.expiresAt).getTime() < Date.now()) {
                return res.status(400).json({ status: false, message: "No prepared race for this creature - scout the track first" });
            }
            const racer = pending.racers.find((r: Racer) => r.id === racerId);
            if (!racer) {
                return res.status(400).json({ status: false, message: "Invalid racer" });
            }
            const oddsEntry = pending.odds.find((o: any) => o.racerId === racerId);

            const user = await User.findById(userId).exec();
            if (!user) {
                return res.status(404).json({ status: false, message: "User not found" });
            }

            try {
                const resolved = await resolveUserAccount(user);
                if (!resolved.linked || !resolved.account) {
                    return res.status(400).json({ status: false, message: "Link your Discord account to play" });
                }
                if (Number(resolved.account.balance) < stake) {
                    return res.status(400).json({ status: false, message: "Insufficient balance" });
                }
                const xenCasinoAccountId = await getXenCasinoAccountId();
                await transfer({
                    fromAccountId: resolved.account.accountId,
                    toAccountId: xenCasinoAccountId,
                    amount: stake.toFixed(10),
                    key: txnKey("ranch-race-bet"),
                    note: "ranch_race_bet",
                });

                try {
                    // ONE real simulation, against the stored field/course - never re-rolled.
                    const order: RaceResultEntry[] = simulateRace(pending.racers, pending.course);
                    const winnerId = order[0].racerId;
                    const won = winnerId === racerId;
                    const payout = won ? Math.round(stake * oddsEntry.multiplier) : 0;

                    let balance = resolved.account.balance;
                    if (won) {
                        const payoutResult = await transfer({
                            fromAccountId: xenCasinoAccountId,
                            toAccountId: resolved.account.accountId,
                            amount: payout.toFixed(10),
                            key: txnKey("ranch-race-payout"),
                            note: "ranch_race_payout",
                        });
                        balance = payoutResult.toNewBalance;
                    }

                    const playerEntry = order.find((o) => o.racerId === "player")!;
                    const playerPlacedFirst = playerEntry.place === 1;
                    await recordCasinoRoundPlayed(userId, { game: SLUG, wager: stake, payout });
                    await XenCasinoRanchCreature.addXp(userId, id, playerPlacedFirst ? RACE_WIN_XP : RACE_LOSS_XP);
                    const updatedCreature = await XenCasinoRanchCreature.recordRaceResult(userId, id, playerPlacedFirst);
                    await XenCasinoRanchPendingRace.clearPending(userId);

                    return res.json({
                        status: true,
                        data: {
                            won,
                            payout,
                            stake,
                            multiplier: oddsEntry.multiplier,
                            order,
                            winnerId,
                            betRacerId: racerId,
                            creature: creatureView(updatedCreature ?? racer),
                            balance,
                        },
                    });
                } catch (resolveErr) {
                    await transfer({
                        fromAccountId: xenCasinoAccountId,
                        toAccountId: resolved.account.accountId,
                        amount: stake.toFixed(10),
                        key: txnKey("ranch-race-refund"),
                        note: "ranch_race_refund",
                    });
                    throw resolveErr;
                }
            } catch (err) {
                const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
                return res.status(status).json({ status: false, message: (err as Error).message });
            }
        }
    );

};
