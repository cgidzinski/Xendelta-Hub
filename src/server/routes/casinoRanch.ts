/**
 * Cheddar Ranch - a creature-collection game. Hatching a Cheddar Egg draws one of five
 * weighted rarity tiers (Common -> Legendary); a rarer tier means a higher starting stat
 * range, snapshotted onto the creature at hatch time so a later RANCH_RARITY_TIERS
 * rebalance never retroactively changes a creature already in the roster. The roster
 * itself is the game's inventory - each creature is its own document
 * (XenCasinoRanchCreature in src/server/models/xenCasino.js). There is no stat ceiling -
 * feeding always raises a stat, for as long as you keep feeding it.
 *
 * Feeding requires owning the matching Feed item (Speed/Stamina/Power Feed - bought with
 * cheddar from the Shop, one flat kind per stat) rather than paying cheddar directly, so
 * feeding itself moves no money and needs no Weeabets call. Races are entered into one of
 * a few weighted categories (Sprint/Endurance/Brawl) that each weight a creature's stats
 * differently before the same win-probability math runs - so which category suits a given
 * creature depends on how its stats are distributed, not just their sum. Feeding and
 * racing (win or lose) earn XP; level is deliberately never stored, only derived from XP
 * on read (see levelForXp), same "derive from persisted counters" convention as Printer's
 * currentMultiplier. Each species also produces its own fixed item on a 24h manual-collect
 * cooldown (see XenCasinoRanchCreature.collect); the quantity produced per collection
 * scales with the creature's current level. Collected items land in a per-user fungible
 * stack (XenCasinoRanchInventory, shared with bought Feed items under different keys) that
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
const { XenCasinoRanchCreature, XenCasinoRanchInventory, XenCasinoActivity } = require("../models/xenCasino");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../utils/weeabetsClient";
import { requireGameEnabled } from "../utils/casinoStatus";
import { recordCasinoRoundPlayed } from "../utils/dailyQuest";
import { drawPrizeWeight } from "./casinoGames/prizeWeights";

const SLUG = "cheddar-ranch";

function txnKey(prefix: string): string {
    return `${prefix}-${randomBytes(8).toString("hex")}`;
}

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

// Three feed items, one per stat - bought in the Shop for cheddar, consumed in the Ranch
// to actually feed a creature. Feeding itself moves no money; the cheddar changes hands at
// purchase time instead (see the /feed-items/:key/buy route).
interface FeedItemDef {
    key: string;
    label: string;
    statKey: "speed" | "stamina" | "power";
    price: number;
}
const FEED_ITEM_DEFS: Record<string, FeedItemDef> = {
    "speed-feed": { key: "speed-feed", label: "Speed Feed", statKey: "speed", price: 500 },
    "stamina-feed": { key: "stamina-feed", label: "Stamina Feed", statKey: "stamina", price: 500 },
    "power-feed": { key: "power-feed", label: "Power Feed", statKey: "power", price: 500 },
};
const FEED_ITEM_BY_STAT: Record<string, FeedItemDef> = {
    speed: FEED_ITEM_DEFS["speed-feed"],
    stamina: FEED_ITEM_DEFS["stamina-feed"],
    power: FEED_ITEM_DEFS["power-feed"],
};

const RACE_ENTRY_FEE = 500;
const RACE_WIN_MULTIPLIER = 1.8;
const RACE_OPPONENT_SCALE_RANGE: [number, number] = [0.8, 1.2];
const MIN_WIN_PROB = 0.1;
const MAX_WIN_PROB = 0.9;

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
const RACE_LOSS_XP = 5; // still rewarded for losing - racing (not just winning) is what trains a creature

export function levelForXp(xp: number): number {
    return Math.floor(xp / XP_PER_LEVEL) + 1;
}

interface RaceCategory {
    key: string;
    label: string;
    // Multiplies each stat before summing into the effective total used for win-probability
    // math - a category weighted toward one stat rewards a creature built around that stat,
    // rather than every category just rewarding raw total stats the same way.
    weights: { speed: number; stamina: number; power: number };
}

const RACE_CATEGORIES: RaceCategory[] = [
    { key: "sprint", label: "Sprint", weights: { speed: 2, stamina: 0.5, power: 0.5 } },
    { key: "endurance", label: "Endurance", weights: { speed: 0.5, stamina: 2, power: 0.5 } },
    { key: "brawl", label: "Brawl", weights: { speed: 0.5, stamina: 0.5, power: 2 } },
];

// Pure and exported so casinoRanch.test.ts can check the weighting directly, same as the
// other race-math functions below.
export function effectiveRaceTotal(stats: { speed: number; stamina: number; power: number }, category: RaceCategory): number {
    return stats.speed * category.weights.speed + stats.stamina * category.weights.stamina + stats.power * category.weights.power;
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
    const species = SPECIES_BY_TIER[tierKey];
    return species[Math.floor(Math.random() * species.length)];
}

// Draws a rarity tier and rolls each stat within that tier's range - pure and exported so
// casinoRanch.test.ts can Monte Carlo it directly against the theoretical distribution
// below, same pattern as kittyScratch.ts's generateRound().
export function rollHatch(): { tier: RarityTier; stats: { speed: number; stamina: number; power: number } } {
    const tier = drawPrizeWeight(RANCH_RARITY_TIERS);
    return {
        tier,
        stats: {
            speed: Math.round(randomInRange(tier.statRange)),
            stamina: Math.round(randomInRange(tier.statRange)),
            power: Math.round(randomInRange(tier.statRange)),
        },
    };
}

// Theoretical hatch-tier probabilities implied by RANCH_RARITY_TIERS' weights - what the
// test file checks a real Monte Carlo run of rollHatch() against.
export function rarityDistribution(): { key: string; probability: number }[] {
    const total = RANCH_RARITY_TIERS.reduce((sum, t) => sum + t.weight, 0);
    return RANCH_RARITY_TIERS.map((t) => ({ key: t.key, probability: t.weight / total }));
}

// A generated opponent's total stat - scaled off the player creature's own total so the
// race stays competitive regardless of how strong (or weak) that creature is, same idea as
// Mine's depth-scaled cave-in chance riding off the player's own position.
export function generateOpponent(playerTotal: number): number {
    return Math.round(playerTotal * randomInRange(RACE_OPPONENT_SCALE_RANGE));
}

// Never a sure thing (or a sure loss) either way - clamped the same way Mine clamps its
// cave-in chance to a max ceiling.
export function raceWinProbability(playerTotal: number, opponentTotal: number): number {
    const raw = playerTotal / (playerTotal + opponentTotal);
    return Math.min(MAX_WIN_PROB, Math.max(MIN_WIN_PROB, raw));
}

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

async function feedItemsView(userId: string) {
    const doc = await inventoryDoc(userId);
    return Object.keys(FEED_ITEM_DEFS).map((key) => ({
        key,
        label: FEED_ITEM_DEFS[key].label,
        statKey: FEED_ITEM_DEFS[key].statKey,
        price: FEED_ITEM_DEFS[key].price,
        quantity: doc.items.get(key) || 0,
    }));
}

async function rosterView(userId: string) {
    const creatures = await XenCasinoRanchCreature.listByUser(userId);
    const items = await itemsView(userId);
    const feedItems = await feedItemsView(userId);
    return {
        creatures: creatures.map(creatureView),
        items,
        feedItems,
        rarityTiers: RANCH_RARITY_TIERS.map((t) => ({
            key: t.key,
            label: t.label,
            probability: t.weight / RANCH_RARITY_TIERS.reduce((sum, x) => sum + x.weight, 0),
            statRange: t.statRange,
        })),
        raceCategories: RACE_CATEGORIES.map((c) => ({ key: c.key, label: c.label, weights: c.weights })),
        hatchPrice: HATCH_PRICE,
        feedCooldownMs: FEED_COOLDOWN_MS,
        raceEntryFee: RACE_ENTRY_FEE,
        raceWinMultiplier: RACE_WIN_MULTIPLIER,
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
    // /feed-items/:key/buy below). This just consumes one matching Feed item and applies
    // the (uncapped) stat gain.
    app.post("/api/casino/ranch/:id/feed", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { id } = req.params;
        const { statKey } = req.body as { statKey: "speed" | "stamina" | "power" };
        if (!["speed", "stamina", "power"].includes(statKey)) {
            return res.status(400).json({ status: false, message: "Invalid stat" });
        }

        const existing = await XenCasinoRanchCreature.getOwned(userId, id);
        if (!existing) {
            return res.status(404).json({ status: false, message: "Creature not found" });
        }
        if (existing.lastFedAt && Date.now() - new Date(existing.lastFedAt).getTime() < FEED_COOLDOWN_MS) {
            return res.status(400).json({ status: false, message: "This creature is still on cooldown" });
        }

        const feedItem = FEED_ITEM_BY_STAT[statKey];
        const consumed = await XenCasinoRanchInventory.subtractItem(userId, feedItem.key, 1);
        if (!consumed) {
            return res.status(400).json({ status: false, message: `Buy some ${feedItem.label} from the Shop first` });
        }

        const gain = Math.round(randomInRange(FEED_GAIN_RANGE));
        const updated = await XenCasinoRanchCreature.feed(userId, id, statKey, gain, FEED_COOLDOWN_MS);

        if (!updated) {
            // Lost the race against the cooldown between our pre-check and the atomic
            // update below - give the consumed Feed item back rather than eating it for
            // nothing.
            await XenCasinoRanchInventory.addItem(userId, feedItem.key, 1);
            return res.status(400).json({ status: false, message: "This creature is still on cooldown" });
        }

        const withXp = await XenCasinoRanchCreature.addXp(userId, id, FEED_XP);
        return res.json({ status: true, data: { creature: creatureView(withXp ?? updated), gain } });
    });

    app.post("/api/casino/ranch/:id/race", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { id } = req.params;
        const { category: categoryKey } = req.body as { category: string };
        const category = RACE_CATEGORIES.find((c) => c.key === categoryKey);
        if (!category) {
            return res.status(400).json({ status: false, message: "Invalid race category" });
        }

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
            await transfer({
                fromAccountId: resolved.account.accountId,
                toAccountId: xenCasinoAccountId,
                amount: RACE_ENTRY_FEE.toFixed(10),
                key: txnKey("ranch-race"),
                note: "ranch_race",
            });

            const playerTotal = effectiveRaceTotal(creature.stats, category);
            const opponentTotal = generateOpponent(playerTotal);
            const winProb = raceWinProbability(playerTotal, opponentTotal);
            const won = Math.random() < winProb;

            let payout = 0;
            let balance: string | undefined;
            if (won) {
                payout = Math.round(RACE_ENTRY_FEE * RACE_WIN_MULTIPLIER);
                const payoutResult = await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: resolved.account.accountId,
                    amount: payout.toFixed(10),
                    key: txnKey("ranch-race-win"),
                    note: "ranch_race_win",
                });
                balance = payoutResult.toNewBalance;
            }

            await recordCasinoRoundPlayed(userId, { game: SLUG, wager: RACE_ENTRY_FEE, payout });
            await XenCasinoRanchCreature.addXp(userId, id, won ? RACE_WIN_XP : RACE_LOSS_XP);
            const updated = await XenCasinoRanchCreature.recordRaceResult(userId, id, won);

            return res.json({
                status: true,
                data: {
                    won,
                    payout,
                    playerTotal,
                    opponentTotal,
                    balance,
                    creature: creatureView(updated ?? creature),
                },
            });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
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

            return res.json({ status: true, data: { sellValue, balance: payoutResult.toNewBalance } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    // No cheddar changes hands here - production is free, so unlike hatch/race/release/buy
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

    app.post(
        "/api/casino/ranch/feed-items/:key/buy",
        authenticateToken,
        requireGameEnabled(SLUG),
        async function (req: express.Request, res: express.Response) {
            const userId = String((req as AuthenticatedRequest).user!._id);
            const { key } = req.params;
            const feedItem = FEED_ITEM_DEFS[key];
            if (!feedItem) {
                return res.status(400).json({ status: false, message: "Invalid feed item" });
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
                const payoutResult = await transfer({
                    fromAccountId: resolved.account.accountId,
                    toAccountId: xenCasinoAccountId,
                    amount: feedItem.price.toFixed(10),
                    key: txnKey("ranch-buy-feed"),
                    note: `ranch_buy_${key}`,
                });

                try {
                    await XenCasinoRanchInventory.addItem(userId, key, 1);
                } catch (creditErr) {
                    await transfer({
                        fromAccountId: xenCasinoAccountId,
                        toAccountId: resolved.account.accountId,
                        amount: feedItem.price.toFixed(10),
                        key: txnKey("ranch-buy-feed-refund"),
                        note: `ranch_buy_${key}_refund`,
                    });
                    throw creditErr;
                }

                await XenCasinoActivity.record({ game: SLUG, userId, wager: feedItem.price, payout: 0 });
                return res.json({ status: true, data: { balance: payoutResult.fromNewBalance, feedItems: await feedItemsView(userId) } });
            } catch (err) {
                const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
                return res.status(status).json({ status: false, message: (err as Error).message });
            }
        }
    );

};
