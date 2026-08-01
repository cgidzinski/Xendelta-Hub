/**
 * Cheddar Ranch - a creature-collection game. Hatching a Cheddar Egg draws one of five
 * weighted rarity tiers (Common -> Legendary); a rarer tier means a higher starting stat
 * range across all 6 stats (Speed/Stamina/Power/Intelligence/Luck/Charm), snapshotted onto
 * the creature at hatch time so a later RANCH_RARITY_TIERS rebalance never retroactively
 * changes a creature already in the roster. Each creature also gets a single rolled silly
 * nickname (see NICKNAME_ADJECTIVES/NICKNAME_NOUNS), and a Land/Sea/Air type derived from its species (see
 * SPECIES_TYPE) - not stored, since it's fully determined by species. There is no stat
 * ceiling - feeding always raises every stat - but a creature left unfed too long slowly
 * decays (see resolveRanchDecay) until fed again. Level is never stored; it's always
 * `levelForStats(stats)`, the floor of the average of all 6 current stats - so level moves
 * immediately with feeding or decay, never needs its own bookkeeping.
 *
 * Feeding requires owning the Feed item matching a creature's own type (Land/Sea/Air Feed -
 * bought with cheddar from the Shop) rather than paying cheddar directly, and the number of
 * units a single feeding consumes scales with the creature's current level (see
 * feedUnitsRequired) - a higher-level creature costs more Feed per feeding, not more
 * cheddar per unit.
 *
 * Racing is a two-step flow, because a real, non-refundable-on-abandonment entry fee is
 * charged before anything is revealed:
 *   1. POST /:id/race/start - charges a flat entry fee (RANCH_RACE_ENTRY_FEE), then rolls 4
 *      rival creatures (same rarity tier as the player's own creature), picks a random
 *      course (weights the 6 stats differently - see RACE_COURSES), and computes
 *      bookmaker-style odds for the whole 5-racer field via an internal Monte Carlo
 *      (estimateWinProbabilities) - all in one shot, so the client can play a single
 *      "randomizing" reveal animation (the field and the course "spinning" together) before
 *      showing the real result. From here the player either bets or forfeits.
 *   2. POST /:id/race/bet - the player bets a stake on any one of the 5 racers. Debits the
 *      stake, then runs ONE real call to simulateRace (the exact same scoring function the
 *      odds were estimated from) against the stored field/course to decide the actual
 *      winner and finishing order, pays out stake * multiplier if the bet racer won, and
 *      clears the pending race. The player's own creature's win/loss record is updated
 *      based on whether IT placed first - independent of which racer was bet on - and it
 *      also earns a small stat boost sized to its own placement (see
 *      raceStatBoostForPlace), again independent of the bet.
 *   Alternatively, POST /:id/race/forfeit clears the pending race without betting - the
 *   entry fee already paid in step 1 is never refunded, forfeit or not.
 * The client plays a purely cosmetic CSS-transition "race" animation using the finishing
 * order the bet response already decided - it never decides anything itself. Because real
 * money is on the line from step 1, a second race attempt can't be started while one is
 * already in flight (see XenCasinoRanchPendingRace.startIfClear) - unlike a free "nothing's
 * at stake" prepare step, this one can't be silently discarded and restarted; it has to be
 * explicitly bet on or forfeited.
 *
 * Each species also produces its own fixed item on a 24h manual-collect cooldown (see
 * XenCasinoRanch.collectFromCreature) - a freshly hatched creature is seeded with
 * lastCollectedAt = now, so even the very first collect has to wait out the cooldown like
 * any other. The quantity produced per collection is a flat number for the creature's
 * rarity tier (see collectQuantityForTier), NOT its current level - level is unbounded via
 * feeding, so tying quantity to it turned collecting into a runaway income source
 * completely disconnected from the race economy. A creature also refuses to produce
 * anything once it's been collected from RANCH_COLLECT_STREAK_LIMIT times in a row without
 * racing (collectStreak, reset by any resolved race, win or lose) - it has to actually race
 * every couple of collections to keep working, tying passive item income back to the same
 * house-edged activity as everything else. Collected items land in a per-user fungible
 * stack (XenCasinoRanchInventory, shared with the bought Feed items under different keys)
 * that can be sold for cheddar, "used" as a plain material (a stub for now), or crafted
 * into a Tonic (see TONIC_RECIPES) instead of selling.
 *
 * Beyond Feed, the Shop also sells 6 Tonics (one per stat, a guaranteed +TONIC_GAIN to that
 * one stat - craftable for free from materials too) and 5 single consumables: a Type-Swap
 * Serum (rerolls a creature's species within its own rarity tier, stats untouched), a Decay
 * Shield (pauses neglect decay for RANCH_DECAY_SHIELD_MS), a Course Ticket (an optional
 * /race/start flag that rerolls the course once), a Hardened Feed (an optional /race/start
 * flag that widens all 4 rivals' stat range toward the next rarity tier - no new payout math
 * needed, since the existing bookmaker odds already pay more for a lower win probability),
 * and Forfeit Insurance (consumed automatically by /race/forfeit if owned, refunding
 * FORFEIT_INSURANCE_REFUND_RATE of the entry fee instead of nothing).
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
const { XenCasinoRanchPendingRace, XenCasinoActivity, dailyQuestDateKey: todayKey } = require("../models/xenCasino");
const { XenCasinoRanch } = require("../models/xenCasinoRanch");
import { resolveUserAccount, transfer, getXenCasinoAccountId, WeeabetsUnavailable, WeeabetsTransferError } from "../utils/weeabetsClient";
import { requireGameEnabled } from "../utils/casinoStatus";
import { recordCasinoRoundPlayed } from "../utils/dailyQuest";
import { drawPrizeWeight } from "./casinoGames/prizeWeights";

const SLUG = "cheddar-ranch";

// ---------------------------------------------------------------------------
// Mine economics (was casinoMine.ts)
// ---------------------------------------------------------------------------

const BASE_DAILY_DIG_CAP = 15;
const LADDER_COST = 500;
const LADDER_BATCH = 1;
const DIG_COST = 250;
const EXPLOSIVE_COST = 750;
const SUPPORT_COST = 1000;
const FLARE_COST = 1500;
const MINE_FLARE_RADIUS = 1;
const MAP_RESET_COST = 2000;

const MINE_ORE_TIER_VALUE: Record<string, number> = {
    copper: 1, silver: 2, gold: 4, emerald: 8, ruby: 14, diamond: 25,
};

function oreValueForDepth(depth: number, tier: string): number {
    const base = 200 + depth * 60;
    const multiplier = MINE_ORE_TIER_VALUE[tier] ?? 1;
    return Math.round(base * multiplier * (0.7 + Math.random() * 1.1));
}

function mineStateView(doc: any) {
    const m = doc.mine;
    return {
        position: { x: m.positionX, y: m.positionY },
        actionsToday: m.actionsToday,
        dailyDigCap: BASE_DAILY_DIG_CAP,
        ladderCount: m.ladderCount,
        explosiveCount: m.explosiveCount,
        supportCount: m.reinforcementCount,
        deepestDepthReached: m.deepestDepthReached,
        bestGemTier: m.bestGemTier,
        revealedTiles: m.dugTiles.map((t: any) => ({ x: t.x, y: t.y, oreTier: t.oreTier, isHeavyStone: t.isHeavyStone, status: t.status })),
        prices: {
            dig: { cost: DIG_COST },
            ladder: { cost: LADDER_COST, amount: LADDER_BATCH },
            explosive: { cost: EXPLOSIVE_COST, amount: 1 },
            support: { cost: SUPPORT_COST, amount: 1 },
            flare: { cost: FLARE_COST, radius: MINE_FLARE_RADIUS },
            reset: { cost: MAP_RESET_COST },
        },
        oreTiers: require("../models/xenCasinoRanch").MINE_ORE_TIERS.map((t: any) => ({ key: t.key, label: t.label, minDepth: t.minDepth, valueMultiplier: MINE_ORE_TIER_VALUE[t.key] ?? 1 })),
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function txnKey(prefix: string): string {
    return `${prefix}-${randomBytes(8).toString("hex")}`;
}

export type RanchType = "land" | "sea" | "air";

export interface RanchStats {
    speed: number;
    stamina: number;
    power: number;
    intelligence: number;
    luck: number;
    charm: number;
}
const STAT_KEYS: (keyof RanchStats)[] = ["speed", "stamina", "power", "intelligence", "luck", "charm"];

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

// Cosmetic flavor only - picked at random within the hatched tier, no gameplay effect
// beyond determining SPECIES_TYPE (below) and which collectible item a creature produces
// (SPECIES_ITEM_KEY).
const SPECIES_BY_TIER: Record<string, string[]> = {
    common: ["Cheddar Chick", "Barnyard Pup", "Field Mouse"],
    uncommon: ["Ridgeback Goat", "Marsh Otter", "Meadow Fox"],
    rare: ["Thundercalf", "Moonlit Lynx", "Cave Badger"],
    epic: ["Gilded Ram", "Storm Falcon", "Ember Wolf"],
    legendary: ["Cheddar Wyrm", "Solar Stag", "Void Kraken"],
};

// Every species is permanently one type - not randomized independently, so the type is
// never stored on the creature itself, just derived from species on read.
const SPECIES_TYPE: Record<string, RanchType> = {
    "Cheddar Chick": "land",
    "Barnyard Pup": "land",
    "Field Mouse": "land",
    "Ridgeback Goat": "land",
    "Marsh Otter": "sea",
    "Meadow Fox": "land",
    "Thundercalf": "land",
    "Moonlit Lynx": "land",
    "Cave Badger": "land",
    "Gilded Ram": "land",
    "Storm Falcon": "air",
    "Ember Wolf": "land",
    "Cheddar Wyrm": "air",
    "Solar Stag": "land",
    "Void Kraken": "sea",
};

function typeForSpecies(species: string): RanchType {
    return SPECIES_TYPE[species] ?? "land";
}

const FEED_COOLDOWN_MS = 60 * 60 * 1000;
const FEED_GAIN_RANGE: [number, number] = [1, 4];
const FEED_PRICE = 100; // per unit, same price for all 3 types
const ALLOWED_FEED_BUY_QUANTITIES = [1, 5, 10];

// One Feed item per type - a creature can only be fed with the Feed matching its own type.
const FEED_ITEMS_BY_TYPE: Record<RanchType, { key: string; label: string; type: RanchType; price: number }> = {
    land: { key: "feed-land", label: "Land Feed", type: "land", price: FEED_PRICE },
    sea: { key: "feed-sea", label: "Sea Feed", type: "sea", price: FEED_PRICE },
    air: { key: "feed-air", label: "Air Feed", type: "air", price: FEED_PRICE },
};

// How many Feed units a single feeding consumes at a given level - ramps up every 10
// levels (1-10 -> 1 unit, 11-20 -> 2 units, 21-30 -> 3 units, ...) so a higher-level
// creature costs more Feed per feeding rather than the per-unit price changing.
export function feedUnitsRequired(level: number): number {
    return Math.floor((level - 1) / 10) + 1;
}

const RELEASE_SELL_VALUE: Record<string, number> = {
    common: 300,
    uncommon: 800,
    rare: 2000,
    epic: 6000,
    legendary: 20000,
};

// Level is never persisted - always the floor of the average of a creature's current 6
// stats, so it moves immediately with feeding or neglect decay, no separate bookkeeping.
export function levelForStats(stats: RanchStats): number {
    return Math.floor(STAT_KEYS.reduce((sum, key) => sum + stats[key], 0) / STAT_KEYS.length);
}

interface RaceCourse {
    key: string;
    label: string;
    // Shown to the player under the course label so a weighted course reads as a real
    // course, not just a stat multiplier - purely cosmetic, no gameplay effect of its own.
    description: string;
    // Multiplies each stat before summing into the effective total used for the race
    // simulation - a course weighted toward one stat rewards a creature built around that
    // stat, rather than every course rewarding raw total stats the same way. Randomly spun
    // per race (pickCourse) rather than player-picked.
    weights: RanchStats;
}

// One course per stat, plus one flat "all-rounder" course for variety - covers all 6 stats
// now that Charm exists. No weight field needed here (unlike RANCH_RARITY_TIERS) since this
// isn't a gacha table - pickCourse is a plain uniform pick.
export const RACE_COURSES: RaceCourse[] = [
    {
        key: "sprint",
        label: "Sprint",
        description: "A flat, straight-line dash - raw Speed wins the day.",
        weights: { speed: 2, stamina: 0.5, power: 0.5, intelligence: 0.5, luck: 0.5, charm: 0.5 },
    },
    {
        key: "endurance",
        label: "Endurance",
        description: "A long, grinding haul - Stamina carries you to the finish.",
        weights: { speed: 0.5, stamina: 2, power: 0.5, intelligence: 0.5, luck: 0.5, charm: 0.5 },
    },
    {
        key: "brawl",
        label: "Brawl",
        description: "A rough, physical scrum - Power muscles through the pack.",
        weights: { speed: 0.5, stamina: 0.5, power: 2, intelligence: 0.5, luck: 0.5, charm: 0.5 },
    },
    {
        key: "puzzle-maze",
        label: "Puzzle Maze",
        description: "A twisting maze of shortcuts - Intelligence finds the fastest path.",
        weights: { speed: 0.5, stamina: 0.5, power: 0.5, intelligence: 2, luck: 0.5, charm: 0.5 },
    },
    {
        key: "lucky-clover",
        label: "Lucky Clover Run",
        description: "A course full of forks and four-leaf clovers - Luck decides the winner.",
        weights: { speed: 0.5, stamina: 0.5, power: 0.5, intelligence: 0.5, luck: 2, charm: 0.5 },
    },
    {
        key: "charm-parade",
        label: "Charm Parade",
        description: "A crowd-judged parade route - Charm wins over the audience.",
        weights: { speed: 0.5, stamina: 0.5, power: 0.5, intelligence: 0.5, luck: 0.5, charm: 2 },
    },
    {
        key: "all-rounder",
        label: "All-Rounder Pasture",
        description: "An even, ordinary course - every stat counts equally.",
        weights: { speed: 1, stamina: 1, power: 1, intelligence: 1, luck: 1, charm: 1 },
    },
];

export function pickCourse(): RaceCourse {
    return RACE_COURSES[Math.floor(Math.random() * RACE_COURSES.length)];
}

// Pure and exported so casinoRanch.test.ts can check the weighting directly.
export function effectiveRaceTotal(stats: RanchStats, course: RaceCourse): number {
    return STAT_KEYS.reduce((sum, key) => sum + stats[key] * course.weights[key], 0);
}

// One fixed item per species (not per rarity tier or per individual creature) - every
// creature of a given species always produces the same item. Sell values roughly track the
// rarity tier each species belongs to, deliberately kept modest - see
// COLLECT_QUANTITY_BY_TIER below for why quantity no longer scales with the creature's own
// (unbounded, feed-grown) level: sellValue * quantity per collection is sized to sit well
// under a single race entry fee even at the top tier, so passive collecting stays a small
// supplement to racing rather than outpacing it.
const ITEM_DEFS: Record<string, { key: string; label: string; sellValue: number; description: string }> = {
    "down-feather": { key: "down-feather", label: "Down Feather", sellValue: 15, description: "A soft feather molted by a Cheddar Chick." },
    "puppy-fluff": { key: "puppy-fluff", label: "Puppy Fluff", sellValue: 15, description: "A tuft of fluff shed by a Barnyard Pup." },
    "whisker-tuft": { key: "whisker-tuft", label: "Whisker Tuft", sellValue: 15, description: "A wisp of whisker fur from a Field Mouse." },
    "goat-milk": { key: "goat-milk", label: "Goat Milk", sellValue: 40, description: "A jar of fresh milk from a Ridgeback Goat." },
    "otter-pelt": { key: "otter-pelt", label: "Otter Pelt", sellValue: 40, description: "A sleek pelt shed by a Marsh Otter." },
    "fox-tail": { key: "fox-tail", label: "Fox Tail", sellValue: 40, description: "A bushy tuft from a Meadow Fox's tail." },
    "storm-hide": { key: "storm-hide", label: "Storm Hide", sellValue: 100, description: "A tough hide scale shed by a Thundercalf." },
    "moon-fang": { key: "moon-fang", label: "Moon Fang", sellValue: 100, description: "A gleaming fang shed by a Moonlit Lynx." },
    "badger-claw": { key: "badger-claw", label: "Badger Claw", sellValue: 100, description: "A sturdy claw shed by a Cave Badger." },
    "gilded-horn": { key: "gilded-horn", label: "Gilded Horn", sellValue: 250, description: "A gold-flecked horn shard from a Gilded Ram." },
    "falcon-plume": { key: "falcon-plume", label: "Falcon Plume", sellValue: 250, description: "A wind-swept plume from a Storm Falcon." },
    "ember-fur": { key: "ember-fur", label: "Ember Fur", sellValue: 250, description: "A warm tuft of fur from an Ember Wolf." },
    "wyrm-scale": { key: "wyrm-scale", label: "Wyrm Scale", sellValue: 600, description: "A shimmering scale shed by a Cheddar Wyrm." },
    "solar-antler": { key: "solar-antler", label: "Solar Antler", sellValue: 600, description: "A sun-bright antler shard from a Solar Stag." },
    "void-ink": { key: "void-ink", label: "Void Ink", sellValue: 600, description: "A vial of inky essence drawn from a Void Kraken." },
};

// Flat, tier-based collection quantity - deliberately NOT derived from the creature's
// current level (unlike the old formula), because level is unbounded via feeding: tying
// quantity to it meant grinding Feed turned collection into a runaway, ever-growing income
// source completely disconnected from the race economy. A fixed number per tier still
// rewards a rarer hatch without letting a single creature's payout grow forever.
const COLLECT_QUANTITY_BY_TIER: Record<string, number> = {
    common: 1,
    uncommon: 2,
    rare: 3,
    epic: 4,
    legendary: 6,
};

export function collectQuantityForTier(tier: string): number {
    return COLLECT_QUANTITY_BY_TIER[tier] ?? 1;
}

// A creature refuses to produce anything once it's been collected from this many times in
// a row without racing - collect() resets this counter to 0, and so does every resolved
// race (win or lose, see XenCasinoRanch.recordRaceResult) - so passive item farming
// can't fully replace actually playing the race game; the creature has to be raced at least
// once every couple of collections to keep producing.
export const RANCH_COLLECT_STREAK_LIMIT = 2;

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

export const TONIC_GAIN = 10; // flat, guaranteed - vs Feed's random 1-4 per stat across all six at once
const TONIC_PRICE = 15000; // 3x the race entry fee - a deliberate purchase, not an impulse buy

interface TonicDef {
    key: string;
    label: string;
    statKey: keyof RanchStats;
    price: number;
    gain: number;
    description: string;
}

// One Tonic per stat - a guaranteed, targeted boost, unlike Feed's random roll across every
// stat at once. Buyable directly in the Shop, or crafted for free from materials (see
// TONIC_RECIPES below) - giving materials a real use beyond selling them for cheddar.
const TONIC_ITEMS: Record<keyof RanchStats, TonicDef> = {
    speed: { key: "tonic-speed", label: "Speed Tonic", statKey: "speed", price: TONIC_PRICE, gain: TONIC_GAIN, description: `A guaranteed +${TONIC_GAIN} Speed.` },
    stamina: {
        key: "tonic-stamina",
        label: "Stamina Tonic",
        statKey: "stamina",
        price: TONIC_PRICE,
        gain: TONIC_GAIN,
        description: `A guaranteed +${TONIC_GAIN} Stamina.`,
    },
    power: { key: "tonic-power", label: "Power Tonic", statKey: "power", price: TONIC_PRICE, gain: TONIC_GAIN, description: `A guaranteed +${TONIC_GAIN} Power.` },
    intelligence: {
        key: "tonic-intelligence",
        label: "Intelligence Tonic",
        statKey: "intelligence",
        price: TONIC_PRICE,
        gain: TONIC_GAIN,
        description: `A guaranteed +${TONIC_GAIN} Intelligence.`,
    },
    luck: { key: "tonic-luck", label: "Luck Tonic", statKey: "luck", price: TONIC_PRICE, gain: TONIC_GAIN, description: `A guaranteed +${TONIC_GAIN} Luck.` },
    charm: { key: "tonic-charm", label: "Charm Tonic", statKey: "charm", price: TONIC_PRICE, gain: TONIC_GAIN, description: `A guaranteed +${TONIC_GAIN} Charm.` },
};

const TONIC_ITEMS_BY_KEY: Record<string, TonicDef> = Object.fromEntries(Object.values(TONIC_ITEMS).map((t) => [t.key, t]));

interface TonicRecipe {
    materialKey: string;
    quantity: number;
}

// Crafting recipes for each Tonic - owning enough of ANY ONE listed recipe is enough to
// craft it (the route uses whichever one the player can afford in materials). Quantity
// scales DOWN as a material's own rarity/sellValue goes up, since a rarer material is worth
// more, so between them every one of the 15 existing materials feeds into exactly one
// Tonic - nothing is craft-useless.
const TONIC_RECIPES: Record<keyof RanchStats, TonicRecipe[]> = {
    speed: [
        { materialKey: "down-feather", quantity: 10 },
        { materialKey: "falcon-plume", quantity: 2 },
    ],
    stamina: [
        { materialKey: "puppy-fluff", quantity: 10 },
        { materialKey: "goat-milk", quantity: 6 },
    ],
    power: [
        { materialKey: "storm-hide", quantity: 4 },
        { materialKey: "badger-claw", quantity: 4 },
        { materialKey: "ember-fur", quantity: 2 },
    ],
    intelligence: [
        { materialKey: "otter-pelt", quantity: 6 },
        { materialKey: "wyrm-scale", quantity: 2 },
    ],
    luck: [
        { materialKey: "whisker-tuft", quantity: 10 },
        { materialKey: "moon-fang", quantity: 4 },
        { materialKey: "void-ink", quantity: 2 },
    ],
    charm: [
        { materialKey: "fox-tail", quantity: 6 },
        { materialKey: "gilded-horn", quantity: 2 },
        { materialKey: "solar-antler", quantity: 2 },
    ],
};

interface ShopItemDef {
    key: string;
    label: string;
    price: number;
    description: string;
}

// Five single-use consumables beyond Feed/Tonics. Each is handled by name in the routes
// below rather than through a shared "item effect" abstraction, since each does something
// structurally different (reroll a course, widen a rival range, refund on forfeit, mutate a
// creature) - a generic effect system would be more machinery than five items justify.
const TYPE_SWAP_SERUM: ShopItemDef = {
    key: "type-swap-serum",
    label: "Type-Swap Serum",
    price: 500,
    description: "Rerolls a creature's species (and Land/Sea/Air type) to another species of the same rarity tier - stats and level are untouched.",
};
const DECAY_SHIELD: ShopItemDef = {
    key: "decay-shield",
    label: "Decay Shield",
    price: 800,
    description: "Protects a creature from neglect decay for 3 days.",
};
const COURSE_TICKET: ShopItemDef = {
    key: "course-ticket",
    label: "Course Ticket",
    price: 1000,
    description: "Rerolls the race course once if you don't like what comes up - toggle it on before you start a race.",
};
const HARDENED_FEED: ShopItemDef = {
    key: "hardened-feed",
    label: "Hardened Feed",
    price: 1200,
    description: "Toughens up all 4 rivals for one race, widening their stat range toward the next rarity tier - harder to beat, but pays out more if you do.",
};
const FORFEIT_INSURANCE: ShopItemDef = {
    key: "forfeit-insurance",
    label: "Forfeit Insurance",
    price: 1000,
    description: "Refunds half the entry fee if you forfeit a race instead of betting - used up automatically the next time you forfeit.",
};

const SHOP_ITEMS: Record<string, ShopItemDef> = {
    ...TONIC_ITEMS_BY_KEY,
    [TYPE_SWAP_SERUM.key]: TYPE_SWAP_SERUM,
    [DECAY_SHIELD.key]: DECAY_SHIELD,
    [COURSE_TICKET.key]: COURSE_TICKET,
    [HARDENED_FEED.key]: HARDENED_FEED,
    [FORFEIT_INSURANCE.key]: FORFEIT_INSURANCE,
};

export const FORFEIT_INSURANCE_REFUND_RATE = 0.5;

// Curated so hatching feels a little personal - one silly nickname per creature (no
// separate formal name), built by pairing a random adjective with a random noun, e.g.
// `Slender Sizzler`. Rolled at hatch time; no gameplay effect, pure flavor. 200 x 200
// combinations means repeats are vanishingly rare even with a big roster.
const NICKNAME_ADJECTIVES = [
    "Slender", "Wobbly", "Fuzzy", "Grumpy", "Zippy", "Sneaky", "Bouncy", "Chunky", "Sleepy", "Snappy",
    "Dizzy", "Feisty", "Turbo", "Mighty", "Tiny", "Giant", "Nimble", "Clumsy", "Fluffy", "Spunky",
    "Rowdy", "Quiet", "Loud", "Bold", "Shy", "Wild", "Calm", "Crispy", "Toasty", "Zesty",
    "Salty", "Sweet", "Spicy", "Cheesy", "Buttery", "Golden", "Silver", "Shadowy", "Sparkly", "Glossy",
    "Rusty", "Dusty", "Muddy", "Sandy", "Frosty", "Sunny", "Stormy", "Breezy", "Misty", "Foggy",
    "Speedy", "Sluggish", "Jumpy", "Hoppy", "Gassy", "Squishy", "Crunchy", "Wiggly", "Jiggly", "Bumpy",
    "Lumpy", "Chubby", "Skinny", "Plump", "Puffy", "Perky", "Peppy", "Snoozy", "Drowsy", "Groggy",
    "Chirpy", "Squeaky", "Prickly", "Cuddly", "Cranky", "Jolly", "Merry", "Giddy", "Wacky", "Zany",
    "Goofy", "Silly", "Nutty", "Bonkers", "Loopy", "Kooky", "Quirky", "Dapper", "Fancy", "Rugged",
    "Scruffy", "Sturdy", "Brawny", "Lanky", "Stubby", "Stumpy", "Trotting", "Prancing", "Galloping", "Roaming",
    "Wandering", "Drifting", "Floating", "Gliding", "Soaring", "Diving", "Splashing", "Paddling", "Bubbling", "Fizzy",
    "Sizzling", "Sparking", "Glowing", "Beaming", "Radiant", "Shining", "Twinkling", "Glittering", "Shimmering", "Velvety",
    "Silky", "Woolly", "Feathery", "Furry", "Scaly", "Spiny", "Horned", "Antlered", "Whiskered", "Bearded",
    "Mustached", "Freckled", "Speckled", "Spotted", "Striped", "Dappled", "Patchy", "Mottled", "Marbled", "Bushy",
    "Boisterous", "Rambunctious", "Frisky", "Sprightly", "Vivacious", "Exuberant", "Bubbly", "Cheery", "Chipper", "Bright",
    "Luminous", "Mystic", "Magical", "Enchanted", "Legendary", "Mythical", "Ancient", "Timeless", "Eternal", "Cosmic",
    "Stellar", "Lunar", "Solar", "Astral", "Celestial", "Electric", "Thunderous", "Blazing", "Fiery", "Icy",
    "Frozen", "Chilly", "Arctic", "Tropical", "Jungly", "Sandswept", "Mossy", "Rocky", "Craggy", "Pebbly",
    "Gritty", "Grimy", "Slimy", "Slippery", "Greasy", "Oily", "Waxy", "Sticky", "Gooey", "Chewy",
    "Flaky", "Crumbly", "Melty", "Runny", "Tangy", "Snug", "Plush", "Sassy", "Snarky", "Plucky",
];

const NICKNAME_NOUNS = [
    "Sizzler", "Nibbler", "Muncher", "Chomper", "Nabber", "Snatcher", "Grazer", "Forager", "Prowler", "Stalker",
    "Wanderer", "Rover", "Roamer", "Drifter", "Dasher", "Sprinter", "Racer", "Trotter", "Galloper", "Prancer",
    "Bouncer", "Hopper", "Jumper", "Leaper", "Skipper", "Waddler", "Wobbler", "Stumbler", "Tumbler", "Roller",
    "Spinner", "Twirler", "Dancer", "Juggler", "Jester", "Trickster", "Prankster", "Rascal", "Rogue", "Bandit",
    "Outlaw", "Renegade", "Maverick", "Rebel", "Ranger", "Scout", "Sentinel", "Guardian", "Warden", "Keeper",
    "Herder", "Shepherd", "Wrangler", "Rustler", "Poacher", "Hunter", "Tracker", "Trapper", "Fisher", "Angler",
    "Diver", "Paddler", "Swimmer", "Floater", "Glider", "Soarer", "Flyer", "Flapper", "Flutterer", "Buzzer",
    "Hummer", "Whistler", "Warbler", "Chirper", "Squeaker", "Squawker", "Screecher", "Howler", "Growler", "Grumbler",
    "Mumbler", "Rambler", "Babbler", "Chatterer", "Gossiper", "Snoozer", "Napper", "Dreamer", "Sleeper", "Slumberer",
    "Yawner", "Stretcher", "Loafer", "Lounger", "Idler", "Snacker", "Chewer", "Gobbler", "Guzzler", "Slurper",
    "Licker", "Sniffer", "Snout", "Whisker", "Paw", "Tail", "Ear", "Nose", "Cheek", "Chin",
    "Fang", "Tusk", "Claw", "Horn", "Hoof", "Wing", "Feather", "Scale", "Shell", "Fin",
    "Fluff", "Puff", "Fuzzball", "Furball", "Snowball", "Cannonball", "Blob", "Lump", "Bump", "Blimp",
    "Barrel", "Boulder", "Pebble", "Nugget", "Chunk", "Morsel", "Crumb", "Scrap", "Bit", "Bite",
    "Snack", "Treat", "Nibble", "Munch", "Chomp", "Gulp", "Burp", "Hiccup", "Wiggle", "Jiggle",
    "Waggle", "Shuffle", "Shimmy", "Bop", "Bopster", "Zoomie", "Zoom", "Blur", "Flash", "Dash",
    "Streak", "Bolt", "Rocket", "Comet", "Meteor", "Star", "Spark", "Glimmer", "Glow", "Shine",
    "Beacon", "Lantern", "Torch", "Ember", "Cinder", "Flare", "Blaze", "Inferno", "Storm", "Tempest",
    "Cyclone", "Whirlwind", "Gust", "Breeze", "Gale", "Squall", "Drizzle", "Puddle", "Splash", "Ripple",
    "Wave", "Tide", "Current", "Whirlpool", "Torrent", "Cascade", "Waterfall", "Geyser", "Fountain", "Spring",
];

export function rollCreatureName(): string {
    const adjective = NICKNAME_ADJECTIVES[Math.floor(Math.random() * NICKNAME_ADJECTIVES.length)];
    const noun = NICKNAME_NOUNS[Math.floor(Math.random() * NICKNAME_NOUNS.length)];
    return `${adjective} ${noun}`;
}

// Neglect decay - a creature left unfed too long slowly loses stats until fed again.
// Mirrors Garden's resolveGardenSquare tick-catchup shape (one tick per full
// RANCH_DECAY_TICK_MS elapsed past a grace period, catching up correctly across any gap of
// any length with no cron needed), but Ranch creatures are permanent collection assets with
// unbounded, feeding-grown stats - not Garden's short-lived single-harvest crops - so the
// numbers are far gentler and never destructive: a multi-day grace period, one slow tick
// per day past it, a small per-tick loss, and a floor so a neglected creature erodes
// visibly but is never "killed" or zeroed out.
export const RANCH_NEGLECT_GRACE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
export const RANCH_DECAY_TICK_MS = 24 * 60 * 60 * 1000; // 1 tick/day past grace
export const RANCH_DECAY_PER_TICK = 1; // -1 to every stat, per tick
export const RANCH_STAT_FLOOR = 1; // never below 1 - no "death" state
export const RANCH_DECAY_SHIELD_MS = 3 * 24 * 60 * 60 * 1000; // how long a used Decay Shield protects a creature for

export function resolveRanchDecay(
    stats: RanchStats,
    lastFedAt: Date | null,
    createdAt: Date,
    decayTicksApplied: number,
    now: Date,
    shieldedUntil: Date | null = null
): { stats: RanchStats; decayTicksApplied: number; changed: boolean } {
    if (shieldedUntil && now.getTime() < shieldedUntil.getTime()) {
        return { stats, decayTicksApplied, changed: false };
    }
    const anchor = (lastFedAt ?? createdAt).getTime();
    const elapsed = now.getTime() - anchor;
    if (elapsed < RANCH_NEGLECT_GRACE_MS) {
        return { stats, decayTicksApplied, changed: false };
    }
    const ticksDue = Math.floor((elapsed - RANCH_NEGLECT_GRACE_MS) / RANCH_DECAY_TICK_MS) + 1;
    const newTicks = ticksDue - decayTicksApplied;
    if (newTicks <= 0) {
        return { stats, decayTicksApplied, changed: false };
    }
    const nextStats = { ...stats };
    for (const key of STAT_KEYS) {
        nextStats[key] = Math.max(RANCH_STAT_FLOOR, nextStats[key] - newTicks * RANCH_DECAY_PER_TICK);
    }
    return { stats: nextStats, decayTicksApplied: ticksDue, changed: true };
}

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
        charm: Math.round(randomInRange(range)),
    };
}

// Draws a rarity tier and rolls all 6 stats within that tier's range - pure and exported so
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
// choice, since Feed trains everything at once.
export function rollFeedGains(): RanchStats {
    return {
        speed: Math.round(randomInRange(FEED_GAIN_RANGE)),
        stamina: Math.round(randomInRange(FEED_GAIN_RANGE)),
        power: Math.round(randomInRange(FEED_GAIN_RANGE)),
        intelligence: Math.round(randomInRange(FEED_GAIN_RANGE)),
        luck: Math.round(randomInRange(FEED_GAIN_RANGE)),
        charm: Math.round(randomInRange(FEED_GAIN_RANGE)),
    };
}

// A rival's stats/species/name are rolled the same way a hatch would be, from the SAME
// rarity tier as the player's own creature (reusing RANCH_RARITY_TIERS/SPECIES_BY_TIER
// directly, not a second stat generation system) so the field stays naturally competitive
// without a separate opponent-scaling formula. `statRangeOverride` lets a Difficulty item
// (see widenedRivalRange below) widen the roll without touching the species/name logic.
export function rollRival(
    tierKey: string,
    statRangeOverride?: [number, number]
): { species: string; name: string; type: RanchType; stats: RanchStats } {
    const tier = RANCH_RARITY_TIERS.find((t) => t.key === tierKey) ?? RANCH_RARITY_TIERS[0];
    const species = randomSpecies(tier.key);
    return {
        species,
        name: rollCreatureName(),
        type: typeForSpecies(species),
        stats: rollStatsInRange(statRangeOverride ?? tier.statRange),
    };
}

// The stat range a Difficulty item's toughened rivals roll from for one race: the player's
// own tier's floor up to the NEXT tier's ceiling (so e.g. a rare player can face rivals as
// strong as an epic), or, for legendary (no tier above it), the top widened by the tier's
// own span instead. No new payout math needed anywhere that calls this - tougher rivals
// just organically lower win probability, and estimateWinProbabilities/
// multiplierForProbability already pay more for a lower-probability win.
export function widenedRivalRange(tierKey: string): [number, number] {
    const index = RANCH_RARITY_TIERS.findIndex((t) => t.key === tierKey);
    const tier = RANCH_RARITY_TIERS[index === -1 ? 0 : index];
    const nextTier = RANCH_RARITY_TIERS[index + 1];
    if (nextTier) {
        return [tier.statRange[0], nextTier.statRange[1]];
    }
    const span = tier.statRange[1] - tier.statRange[0];
    return [tier.statRange[0], tier.statRange[1] + span];
}

// A small per-stat boost the player's OWN creature earns just for racing, sized to how well
// it actually placed (1st best) - applied regardless of which racer was bet on or whether
// that bet won, so racing itself (not just winning a bet) trains the creature a little.
// Deliberately modest - well below a single Feed's ~15 total stat points across all six
// stats - since races have no cooldown of their own (only the entry fee gates frequency),
// so this can never out-train Feed as a free stat-grinding loop.
const RACE_PLACE_BOOST_BY_PLACE: Record<number, number> = { 1: 2, 2: 1, 3: 1, 4: 0, 5: 0 };

export function raceStatBoostForPlace(place: number): number {
    return RACE_PLACE_BOOST_BY_PLACE[place] ?? 0;
}

export interface Racer {
    id: string;
    isPlayer: boolean;
    species: string;
    name: string;
    type: RanchType;
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
const RANCH_RACE_ENTRY_FEE = 5000; // flat, non-refundable once a race attempt is started
const PENDING_RACE_TTL_MS = 15 * 60 * 1000; // window to bet or forfeit after starting a race

function creatureView(doc: any) {
    return {
        id: String(doc._id),
        species: doc.species,
        name: doc.name,
        type: typeForSpecies(doc.species),
        rarityTier: doc.rarityTier,
        stats: doc.stats,
        lastFedAt: doc.lastFedAt,
        feedCount: doc.feedCount,
        raceWins: doc.raceWins,
        raceLosses: doc.raceLosses,
        level: levelForStats(doc.stats),
        lastCollectedAt: doc.lastCollectedAt,
        lastCollectDate: doc.lastCollectDate,
        canCollect: doc.lastCollectDate !== todayKey(),
        itemKey: SPECIES_ITEM_KEY[doc.species],
        itemLabel: ITEM_DEFS[SPECIES_ITEM_KEY[doc.species]]?.label,
        collectQuantity: collectQuantityForTier(doc.rarityTier),
        collectBlocked: (doc.collectStreak ?? 0) >= RANCH_COLLECT_STREAK_LIMIT,
        decayShieldUntil: doc.decayShieldUntil ?? null,
        createdAt: doc.createdAt,
    };
}

// Lazy one-time heal for any creature read: backfills stat keys/a real name added after
// this creature was hatched (this repo has no migration-script convention, so heal-on-read
// is the established pattern here), and resolves neglect decay. findByIdAndUpdate does not
// run full-document validators, so this is safe even though the schema paths are
// `required`.
async function ensureCreatureFresh(creature: any) {
    if (!creature) {
        return creature;
    }
    const tier = RANCH_RARITY_TIERS.find((t) => t.key === creature.rarityTier) ?? RANCH_RARITY_TIERS[0];
    const setFields: Record<string, any> = {};

    for (const key of STAT_KEYS) {
        if (creature.stats[key] === undefined || creature.stats[key] === null) {
            setFields["stats." + key] = Math.round(randomInRange(tier.statRange));
        }
    }
    if (!creature.name || creature.name === creature.species) {
        // Legacy tell from before real names existed - name was missing or just set equal
        // to species.
        setFields.name = rollCreatureName();
    }

    const mergedStats: RanchStats = { ...creature.stats };
    for (const key of STAT_KEYS) {
        if (setFields["stats." + key] !== undefined) {
            mergedStats[key] = setFields["stats." + key];
        }
    }

    const decay = resolveRanchDecay(
        mergedStats,
        creature.lastFedAt,
        creature.createdAt,
        creature.decayTicksApplied ?? 0,
        new Date(),
        creature.decayShieldUntil ?? null
    );
    if (decay.changed) {
        for (const key of STAT_KEYS) {
            setFields["stats." + key] = decay.stats[key];
        }
        setFields.decayTicksApplied = decay.decayTicksApplied;
    }

    if (Object.keys(setFields).length === 0) {
        return creature;
    }
    // Apply changes directly to the sub-document (creature is embedded in XenCasinoRanch)
    for (const key of STAT_KEYS) {
        if (setFields["stats." + key] !== undefined) {
            creature.stats[key] = setFields["stats." + key];
        }
    }
    if (setFields.decayTicksApplied !== undefined) {
        creature.decayTicksApplied = setFields.decayTicksApplied;
    }
    if (setFields.name) {
        creature.name = setFields.name;
    }
    return creature;
}

async function inventoryDoc(userId: string) {
    return (await XenCasinoRanch.getState(userId));
}

async function itemsView(userId: string) {
    const doc = await inventoryDoc(userId);
    const entries: { key: string; label: string; quantity: number; sellValue: number; description: string }[] = [];
    for (const key of Object.keys(ITEM_DEFS)) {
        const quantity: number = doc.inventory.get(key) || 0;
        if (quantity > 0) {
            entries.push({ key, label: ITEM_DEFS[key].label, quantity, sellValue: ITEM_DEFS[key].sellValue, description: ITEM_DEFS[key].description });
        }
    }
    return entries;
}

async function feedItemsView(userId: string) {
    const doc = await inventoryDoc(userId);
    return (Object.keys(FEED_ITEMS_BY_TYPE) as RanchType[]).map((type) => {
        const def = FEED_ITEMS_BY_TYPE[type];
        return { key: def.key, label: def.label, type: def.type, price: def.price, quantity: doc.inventory.get(def.key) || 0 };
    });
}

// Tonics + the 5 single consumables (Type-Swap Serum, Decay Shield, Course Ticket,
// Hardened Feed, Forfeit Insurance) - everything buyable in the Shop beyond Feed.
async function shopItemsView(userId: string) {
    const doc = await inventoryDoc(userId);
    return Object.values(SHOP_ITEMS).map((item) => ({
        key: item.key,
        label: item.label,
        price: item.price,
        description: item.description,
        quantity: doc.inventory.get(item.key) || 0,
    }));
}

// What the Shop's crafting UI needs to show for each Tonic - which materials (and how many)
// craft it, alongside how many the player currently owns of each.
async function tonicRecipesView(userId: string) {
    const doc = await inventoryDoc(userId);
    return STAT_KEYS.map((statKey) => ({
        statKey,
        tonicKey: TONIC_ITEMS[statKey].key,
        tonicLabel: TONIC_ITEMS[statKey].label,
        recipes: TONIC_RECIPES[statKey].map((r) => ({
            materialKey: r.materialKey,
            materialLabel: ITEM_DEFS[r.materialKey]?.label ?? r.materialKey,
            quantity: r.quantity,
            owned: doc.inventory.get(r.materialKey) || 0,
        })),
    }));
}

async function pendingRaceView(userId: string) {
    const doc = await XenCasinoRanchPendingRace.getState(userId);
    if (!doc.pending || new Date(doc.pending.expiresAt).getTime() < Date.now()) {
        return null;
    }
    return doc.pending;
}

async function rosterView(userId: string) {
    const rawCreatures = await (await XenCasinoRanch.getState(userId)).creatures;
    const creatures = await Promise.all(rawCreatures.map((c: any) => ensureCreatureFresh(c)));
    const items = await itemsView(userId);
    const feedItems = await feedItemsView(userId);
    const shopItems = await shopItemsView(userId);
    const tonicRecipes = await tonicRecipesView(userId);
    const pendingRace = await pendingRaceView(userId);
    return {
        creatures: creatures.map(creatureView),
        items,
        feedItems,
        shopItems,
        tonicRecipes,
        pendingRace,
        rarityTiers: RANCH_RARITY_TIERS.map((t) => ({
            key: t.key,
            label: t.label,
            probability: t.weight / RANCH_RARITY_TIERS.reduce((sum, x) => sum + x.weight, 0),
            statRange: t.statRange,
        })),
        raceCourses: RACE_COURSES.map((c) => ({ key: c.key, label: c.label, description: c.description, weights: c.weights })),
        speciesByTier: SPECIES_BY_TIER,
        hatchPrice: HATCH_PRICE,
        feedCooldownMs: FEED_COOLDOWN_MS,
        minRaceStake: MIN_RACE_STAKE,
        maxRaceStake: MAX_RACE_STAKE,
        entryFee: RANCH_RACE_ENTRY_FEE,
        neglectGraceMs: RANCH_NEGLECT_GRACE_MS,
        decayTickMs: RANCH_DECAY_TICK_MS,
        releaseSellValue: RELEASE_SELL_VALUE,
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
                creature = await XenCasinoRanch.addCreature(userId, {
                    species,
                    name: rollCreatureName(),
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
    // /feed/buy below). Consumes feedUnitsRequired(level) units of the creature's own
    // type's Feed and rolls one independent gain per stat.
    app.post("/api/casino/ranch/:id/feed", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { id } = req.params;

        let existing = await XenCasinoRanch.getCreature(userId, id);
        if (!existing) {
            return res.status(404).json({ status: false, message: "Creature not found" });
        }
        existing = await ensureCreatureFresh(existing);
        if (existing.lastFedAt && Date.now() - new Date(existing.lastFedAt).getTime() < FEED_COOLDOWN_MS) {
            return res.status(400).json({ status: false, message: "This creature is still on cooldown" });
        }

        const level = levelForStats(existing.stats);
        const units = feedUnitsRequired(level);
        const feedItem = FEED_ITEMS_BY_TYPE[typeForSpecies(existing.species)];

        const consumed = await XenCasinoRanch.subtractItem(userId, feedItem.key, units);
        if (!consumed) {
            return res.status(400).json({ status: false, message: `Buy ${units}x ${feedItem.label} from the Shop first` });
        }

        const gains = rollFeedGains();
        const updated = await XenCasinoRanch.feedCreature(userId, id, gains, FEED_COOLDOWN_MS);

        if (!updated) {
            // Lost the race against the cooldown between our pre-check and the atomic
            // update above - give every consumed Feed unit back rather than eating them
            // for nothing.
            await XenCasinoRanch.addItem(userId, feedItem.key, units);
            return res.status(400).json({ status: false, message: "This creature is still on cooldown" });
        }

        return res.json({ status: true, data: { creature: creatureView(updated), gains, unitsUsed: units } });
    });

    app.post("/api/casino/ranch/:id/release", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { id } = req.params;

        const creature = await XenCasinoRanch.getCreature(userId, id);
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

            await XenCasinoRanch.releaseCreature(userId, id);
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

        let existing = await XenCasinoRanch.getCreature(userId, id);
        if (!existing) {
            return res.status(404).json({ status: false, message: "Creature not found" });
        }
        existing = await ensureCreatureFresh(existing);
        const itemKey = SPECIES_ITEM_KEY[existing.species];
        const itemDef = itemKey ? ITEM_DEFS[itemKey] : undefined;
        if (!itemDef) {
            return res.status(400).json({ status: false, message: "This creature doesn't produce anything" });
        }
        if ((existing.collectStreak ?? 0) >= RANCH_COLLECT_STREAK_LIMIT) {
            return res.status(400).json({
                status: false,
                message: `${existing.name} is too sad to work - it wants to race, not farm materials! Race it before collecting again.`,
            });
        }

        const updated = await XenCasinoRanch.collectFromCreature(userId, id);
        if (!updated) {
            return res.status(400).json({ status: false, message: "Nothing ready to collect yet" });
        }

        const quantity = collectQuantityForTier(updated.rarityTier);
        await XenCasinoRanch.addItem(userId, itemKey, quantity);

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
        const quantity: number = inventory.inventory.get(key) || 0;
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

            await XenCasinoRanch.subtractItem(userId, key, quantity);
            await XenCasinoActivity.record({ game: SLUG, userId, wager: 0, payout: totalValue });

            return res.json({ status: true, data: { quantity, totalValue, balance: payoutResult.toNewBalance, items: await itemsView(userId) } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    // Placeholder - consumes one unit but has no effect yet. Kept as its own endpoint (not
    // just left unbuilt) so the item-use flow already exists end to end for whenever a real
    // effect gets designed. Tonics, the Type-Swap Serum, and the Decay Shield all target a
    // specific creature (`creatureId` in the body); plain materials fall through to the
    // original no-op stub.
    app.post("/api/casino/ranch/items/:key/use", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { key } = req.params;
        const { creatureId, species } = req.body as { creatureId?: string; species?: string };

        const tonic = TONIC_ITEMS_BY_KEY[key];
        const isTypeSwap = key === TYPE_SWAP_SERUM.key;
        const isDecayShield = key === DECAY_SHIELD.key;
        const isMaterial = !!ITEM_DEFS[key];
        if (!tonic && !isTypeSwap && !isDecayShield && !isMaterial) {
            return res.status(400).json({ status: false, message: "Invalid item" });
        }

        const needsCreature = !!tonic || isTypeSwap || isDecayShield;
        if (needsCreature && !creatureId) {
            return res.status(400).json({ status: false, message: "Pick a creature to use this on" });
        }

        let creature: any = null;
        if (needsCreature) {
            creature = await XenCasinoRanch.getCreature(userId, creatureId!);
            if (!creature) {
                return res.status(404).json({ status: false, message: "Creature not found" });
            }
            creature = await ensureCreatureFresh(creature);
        }

        const consumed = await XenCasinoRanch.subtractItem(userId, key, 1);
        if (!consumed) {
            return res.status(400).json({ status: false, message: "You don't have any of this item" });
        }

        if (tonic) {
            const updated = await XenCasinoRanch.applyTonic(userId, creatureId!, tonic.statKey, tonic.gain);
            return res.json({
                status: true,
                data: {
                    message: `${updated.name}'s ${tonic.label.replace(" Tonic", "")} rose by ${tonic.gain}!`,
                    creature: creatureView(updated),
                    items: await itemsView(userId),
                    shopItems: await shopItemsView(userId),
                },
            });
        }

        if (isTypeSwap) {
            const tier = RANCH_RARITY_TIERS.find((t) => t.key === creature.rarityTier) ?? RANCH_RARITY_TIERS[0];
            const options = SPECIES_BY_TIER[tier.key] ?? [];
            const nextSpecies = species && options.includes(species) ? species : options.find((s) => s !== creature.species) ?? options[0];
            const updated = await XenCasinoRanch.setCreatureSpecies(userId, creatureId!, nextSpecies);
            return res.json({
                status: true,
                data: { message: `${updated.name} transformed into a ${nextSpecies}!`, creature: creatureView(updated), shopItems: await shopItemsView(userId) },
            });
        }

        if (isDecayShield) {
            const until = new Date(Date.now() + RANCH_DECAY_SHIELD_MS);
            const updated = await XenCasinoRanch.setDecayShield(userId, creatureId!, until);
            return res.json({
                status: true,
                data: {
                    message: `${updated.name} is shielded from decay for 3 days.`,
                    creature: creatureView(updated),
                    shopItems: await shopItemsView(userId),
                },
            });
        }

        return res.json({ status: true, data: { message: "Nothing happens... yet.", items: await itemsView(userId) } });
    });

    app.post("/api/casino/ranch/shop/:key/buy", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { key } = req.params;
        const item = SHOP_ITEMS[key];
        if (!item) {
            return res.status(400).json({ status: false, message: "Invalid item" });
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
                amount: item.price.toFixed(10),
                key: txnKey("ranch-shop-buy"),
                note: `ranch_buy_${item.key}`,
            });

            try {
                await XenCasinoRanch.addItem(userId, item.key, 1);
            } catch (creditErr) {
                await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: resolved.account.accountId,
                    amount: item.price.toFixed(10),
                    key: txnKey("ranch-shop-buy-refund"),
                    note: `ranch_buy_${item.key}_refund`,
                });
                throw creditErr;
            }

            await XenCasinoActivity.record({ game: SLUG, userId, wager: item.price, payout: 0 });
            return res.json({ status: true, data: { balance: payoutResult.fromNewBalance, shopItems: await shopItemsView(userId) } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    // Crafts a Tonic from materials instead of buying it - free (no cheddar involved),
    // purely a material sink. Uses whichever of the stat's TONIC_RECIPES the player has
    // enough of; if several qualify, the first one listed wins.
    app.post(
        "/api/casino/ranch/tonics/:statKey/craft",
        authenticateToken,
        requireGameEnabled(SLUG),
        async function (req: express.Request, res: express.Response) {
            const userId = String((req as AuthenticatedRequest).user!._id);
            const statKey = req.params.statKey as keyof RanchStats;
            const tonic = TONIC_ITEMS[statKey];
            const recipes = TONIC_RECIPES[statKey];
            if (!tonic || !recipes) {
                return res.status(400).json({ status: false, message: "Invalid tonic" });
            }

            const doc = await inventoryDoc(userId);
            const usable = recipes.find((r) => (doc.inventory.get(r.materialKey) || 0) >= r.quantity);
            if (!usable) {
                return res.status(400).json({ status: false, message: `Not enough materials to craft a ${tonic.label}` });
            }

            const consumed = await XenCasinoRanch.subtractItem(userId, usable.materialKey, usable.quantity);
            if (!consumed) {
                return res.status(400).json({ status: false, message: `Not enough materials to craft a ${tonic.label}` });
            }
            await XenCasinoRanch.addItem(userId, tonic.key, 1);

            return res.json({
                status: true,
                data: { message: `Crafted 1x ${tonic.label}.`, items: await itemsView(userId), shopItems: await shopItemsView(userId) },
            });
        }
    );

    app.post("/api/casino/ranch/feed/buy", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { type, quantity } = req.body as { type?: RanchType; quantity?: number };
        const feedItem = type ? FEED_ITEMS_BY_TYPE[type] : undefined;
        if (!feedItem) {
            return res.status(400).json({ status: false, message: "Invalid feed type" });
        }
        if (!quantity || !ALLOWED_FEED_BUY_QUANTITIES.includes(quantity)) {
            return res.status(400).json({ status: false, message: "Invalid quantity" });
        }
        const totalPrice = feedItem.price * quantity;

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
                amount: totalPrice.toFixed(10),
                key: txnKey("ranch-buy-feed"),
                note: `ranch_buy_${feedItem.key}`,
            });

            try {
                await XenCasinoRanch.addItem(userId, feedItem.key, quantity);
            } catch (creditErr) {
                await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: resolved.account.accountId,
                    amount: totalPrice.toFixed(10),
                    key: txnKey("ranch-buy-feed-refund"),
                    note: `ranch_buy_${feedItem.key}_refund`,
                });
                throw creditErr;
            }

            await XenCasinoActivity.record({ game: SLUG, userId, wager: totalPrice, payout: 0 });
            return res.json({ status: true, data: { balance: payoutResult.fromNewBalance, feedItems: await feedItemsView(userId) } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    // Step 1 of 2 - charges the flat, non-refundable-on-abandonment entry fee, then rolls
    // the 4 rivals, the course, and the odds all together in one shot (the client plays a
    // single cosmetic "randomizing" reveal over this one response rather than waiting on a
    // second request for the course). Optionally consumes a Course Ticket (rerolls the
    // course once, keeping only the second roll) and/or a Hardened Feed (widens all 4
    // rivals' stat range - see widenedRivalRange) if the body asks for them and the player
    // owns one; either is consumed BEFORE the entry fee moves, so a missing item never
    // costs the player anything.
    app.post(
        "/api/casino/ranch/:id/race/start",
        authenticateToken,
        requireGameEnabled(SLUG),
        async function (req: express.Request, res: express.Response) {
            const userId = String((req as AuthenticatedRequest).user!._id);
            const { id } = req.params;
            const { useCourseTicket, useDifficultyItem } = req.body as { useCourseTicket?: boolean; useDifficultyItem?: boolean };

            let creature = await XenCasinoRanch.getCreature(userId, id);
            if (!creature) {
                return res.status(404).json({ status: false, message: "Creature not found" });
            }
            creature = await ensureCreatureFresh(creature);

            const existingState = await XenCasinoRanchPendingRace.getState(userId);
            if (existingState.pending && new Date(existingState.pending.expiresAt).getTime() >= Date.now()) {
                return res.status(400).json({ status: false, message: "Finish or wait out your current race attempt first" });
            }

            const user = await User.findById(userId).exec();
            if (!user) {
                return res.status(404).json({ status: false, message: "User not found" });
            }

            let courseTicketConsumed = false;
            let difficultyItemConsumed = false;
            if (useCourseTicket) {
                courseTicketConsumed = !!(await XenCasinoRanch.subtractItem(userId, COURSE_TICKET.key, 1));
                if (!courseTicketConsumed) {
                    return res.status(400).json({ status: false, message: "You don't have a Course Ticket" });
                }
            }
            if (useDifficultyItem) {
                difficultyItemConsumed = !!(await XenCasinoRanch.subtractItem(userId, HARDENED_FEED.key, 1));
                if (!difficultyItemConsumed) {
                    if (courseTicketConsumed) {
                        await XenCasinoRanch.addItem(userId, COURSE_TICKET.key, 1);
                    }
                    return res.status(400).json({ status: false, message: "You don't have a Hardened Feed" });
                }
            }

            try {
                const resolved = await resolveUserAccount(user);
                if (!resolved.linked || !resolved.account) {
                    if (courseTicketConsumed) await XenCasinoRanch.addItem(userId, COURSE_TICKET.key, 1);
                    if (difficultyItemConsumed) await XenCasinoRanch.addItem(userId, HARDENED_FEED.key, 1);
                    return res.status(400).json({ status: false, message: "Link your Discord account to play" });
                }
                const xenCasinoAccountId = await getXenCasinoAccountId();
                await transfer({
                    fromAccountId: resolved.account.accountId,
                    toAccountId: xenCasinoAccountId,
                    amount: RANCH_RACE_ENTRY_FEE.toFixed(10),
                    key: txnKey("ranch-race-start"),
                    note: "ranch_race_start",
                });

                const rivalRange = difficultyItemConsumed ? widenedRivalRange(creature.rarityTier) : undefined;
                const rivals: Racer[] = [1, 2, 3, 4].map((n) => {
                    const rival = rollRival(creature.rarityTier, rivalRange);
                    return {
                        id: `rival-${n}`,
                        isPlayer: false,
                        species: rival.species,
                        name: rival.name,
                        type: rival.type,
                        level: levelForStats(rival.stats),
                        stats: rival.stats,
                    };
                });
                const racers: Racer[] = [
                    {
                        id: "player",
                        isPlayer: true,
                        species: creature.species,
                        name: creature.name,
                        type: typeForSpecies(creature.species),
                        level: levelForStats(creature.stats),
                        stats: creature.stats,
                    },
                    ...rivals,
                ];

                let course = pickCourse();
                if (courseTicketConsumed) {
                    course = pickCourse(); // reroll once, discarding the first result
                }
                const probabilities = estimateWinProbabilities(racers, course);
                const odds = racers.map((r) => ({
                    racerId: r.id,
                    winProbability: probabilities[r.id],
                    multiplier: Number(multiplierForProbability(probabilities[r.id]).toFixed(2)),
                }));

                const now = new Date();
                const pending = {
                    creatureId: id,
                    racers,
                    course,
                    odds,
                    createdAt: now,
                    expiresAt: new Date(now.getTime() + PENDING_RACE_TTL_MS),
                };
                const started = await XenCasinoRanchPendingRace.startIfClear(userId, pending);
                if (!started) {
                    await transfer({
                        fromAccountId: xenCasinoAccountId,
                        toAccountId: resolved.account.accountId,
                        amount: RANCH_RACE_ENTRY_FEE.toFixed(10),
                        key: txnKey("ranch-race-start-refund"),
                        note: "ranch_race_start_refund",
                    });
                    if (courseTicketConsumed) await XenCasinoRanch.addItem(userId, COURSE_TICKET.key, 1);
                    if (difficultyItemConsumed) await XenCasinoRanch.addItem(userId, HARDENED_FEED.key, 1);
                    return res.status(400).json({ status: false, message: "Finish or wait out your current race attempt first" });
                }

                await recordCasinoRoundPlayed(userId, { game: SLUG, wager: RANCH_RACE_ENTRY_FEE, payout: 0 });
                return res.json({ status: true, data: { pending: started } });
            } catch (err) {
                const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
                return res.status(status).json({ status: false, message: (err as Error).message });
            }
        }
    );

    // Forfeits an in-flight race attempt without betting - the entry fee already paid in
    // /race/start is never refunded, forfeit or not, UNLESS the player owns a Forfeit
    // Insurance, which is consumed automatically here (no separate "activate" step) and
    // refunds half the entry fee.
    app.post(
        "/api/casino/ranch/:id/race/forfeit",
        authenticateToken,
        requireGameEnabled(SLUG),
        async function (req: express.Request, res: express.Response) {
            const userId = String((req as AuthenticatedRequest).user!._id);
            const { id } = req.params;

            const state = await XenCasinoRanchPendingRace.getState(userId);
            const pending = state.pending;
            if (!pending || pending.creatureId !== id) {
                return res.status(400).json({ status: false, message: "No race attempt in progress for this creature" });
            }

            const insured = !!(await XenCasinoRanch.subtractItem(userId, FORFEIT_INSURANCE.key, 1));
            if (!insured) {
                await XenCasinoRanchPendingRace.clearPending(userId);
                return res.json({ status: true, data: { message: "Forfeited - the entry fee was not refunded." } });
            }

            const refundAmount = Math.round(RANCH_RACE_ENTRY_FEE * FORFEIT_INSURANCE_REFUND_RATE);
            const user = await User.findById(userId).exec();
            if (!user) {
                await XenCasinoRanch.addItem(userId, FORFEIT_INSURANCE.key, 1);
                return res.status(404).json({ status: false, message: "User not found" });
            }

            try {
                const resolved = await resolveUserAccount(user);
                if (!resolved.linked || !resolved.account) {
                    await XenCasinoRanch.addItem(userId, FORFEIT_INSURANCE.key, 1);
                    return res.status(400).json({ status: false, message: "Link your Discord account to play" });
                }
                const xenCasinoAccountId = await getXenCasinoAccountId();
                const payoutResult = await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: resolved.account.accountId,
                    amount: refundAmount.toFixed(10),
                    key: txnKey("ranch-forfeit-insurance"),
                    note: "ranch_forfeit_insurance",
                });

                await XenCasinoRanchPendingRace.clearPending(userId);
                return res.json({
                    status: true,
                    data: { message: `Forfeited - your Forfeit Insurance refunded ${refundAmount} cheddar.`, balance: payoutResult.toNewBalance },
                });
            } catch (err) {
                await XenCasinoRanch.addItem(userId, FORFEIT_INSURANCE.key, 1);
                const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
                return res.status(status).json({ status: false, message: (err as Error).message });
            }
        }
    );

    // Step 2 of 2 - the player bets on one of the 5 racers; resolves immediately. The
    // player's own creature also gets a small stat boost sized to where IT placed (see
    // raceStatBoostForPlace), independent of which racer was bet on or whether that bet
    // won - racing itself is rewarded, not just winning a bet.
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
            if (!pending || pending.creatureId !== id) {
                return res.status(400).json({ status: false, message: "No race attempt in progress for this creature - start one first" });
            }
            if (new Date(pending.expiresAt).getTime() < Date.now()) {
                return res.status(400).json({ status: false, message: "Your race attempt expired - the entry fee was not refunded" });
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
                    const placeBoost = raceStatBoostForPlace(playerEntry.place);
                    const statBoost = placeBoost > 0 ? Object.fromEntries(STAT_KEYS.map((key) => [key, placeBoost])) : null;
                    await recordCasinoRoundPlayed(userId, { game: SLUG, wager: stake, payout });
                    const updatedCreature = await XenCasinoRanch.recordRaceResult(userId, id, playerPlacedFirst, statBoost);
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
                            place: playerEntry.place,
                            placeBoost,
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

    // -----------------------------------------------------------------------
    // Mine endpoints (under /api/casino/ranch/mine)
    // -----------------------------------------------------------------------

    app.get("/api/casino/ranch/mine", authenticateToken, async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const doc = await XenCasinoRanch.getState(userId);
        return res.json({ status: true, data: mineStateView(doc) });
    });

    app.post("/api/casino/ranch/mine/dig", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { direction, useExplosive } = req.body as { direction: "up" | "down" | "left" | "right"; useExplosive?: boolean };
        if (!["up", "down", "left", "right"].includes(direction)) {
            return res.status(400).json({ status: false, message: "Invalid direction" });
        }

        const user = await User.findById(userId).exec();
        if (!user) return res.status(404).json({ status: false, message: "User not found" });

        try {
            const resolved = await resolveUserAccount(user);
            if (!resolved.linked || !resolved.account) {
                return res.status(400).json({ status: false, message: "Link your Discord account to play" });
            }
            const xenCasinoAccountId = await getXenCasinoAccountId();

            // Charge dig cost
            const isFree = false; // We'll check if the target is already mined after calling applyMineDig
            await transfer({
                fromAccountId: resolved.account.accountId,
                toAccountId: xenCasinoAccountId,
                amount: DIG_COST.toFixed(10),
                key: txnKey("ranch-mine-dig"),
                note: "ranch_mine_dig",
            });

            try {
                const result = await XenCasinoRanch.applyMineDig(userId, { direction, dailyDigCap: BASE_DAILY_DIG_CAP, useExplosive: !!useExplosive });

                if (result.error) {
                    // Refund on error
                    await transfer({
                        fromAccountId: xenCasinoAccountId,
                        toAccountId: resolved.account.accountId,
                        amount: DIG_COST.toFixed(10),
                        key: txnKey("ranch-mine-dig-refund"),
                        note: "ranch_mine_dig_refund",
                    });
                    return res.status(400).json({ status: false, message: result.error });
                }

                // If it was just a free move or empty outcome, return 0 payout
                if (result.outcome !== "ore") {
                    await XenCasinoActivity.record({ game: "mine" as any, userId, wager: DIG_COST, payout: 0 });
                    return res.json({
                        status: true,
                        data: {
                            outcome: result.outcome,
                            usedExplosive: result.usedExplosive,
                            state: mineStateView(result.doc),
                        },
                    });
                }

                // Ore struck - add to inventory instead of instant payout
                const tier = result.oreTier!;
                const tierLabel = require("../models/xenCasinoRanch").MINE_ORE_TIERS.find((t: any) => t.key === tier)?.label ?? tier;
                const sellValue = oreValueForDepth(result.targetY, tier);
                const itemKey = tier; // "copper", "silver", etc.

                await XenCasinoRanch.addItem(userId, itemKey, 1);

                // Store sell value metadata — we'll use a naming convention for sell values
                // The inventory already stores the item; the sell value is computed from the tier

                await recordCasinoRoundPlayed(userId, { game: "mine", wager: DIG_COST, payout: sellValue });

                return res.json({
                    status: true,
                    data: {
                        outcome: result.outcome,
                        oreTier: tier,
                        oreItem: { key: itemKey, label: tierLabel, quantity: 1 },
                        usedExplosive: result.usedExplosive,
                        state: mineStateView(result.doc),
                    },
                });
            } catch (digErr) {
                await transfer({
                    fromAccountId: xenCasinoAccountId,
                    toAccountId: resolved.account.accountId,
                    amount: DIG_COST.toFixed(10),
                    key: txnKey("ranch-mine-dig-refund"),
                    note: "ranch_mine_dig_refund",
                });
                throw digErr;
            }
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    app.post("/api/casino/ranch/mine/buy-equipment", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);
        const { item } = req.body as { item: "ladder" | "explosive" | "support" };
        if (!["ladder", "explosive", "support"].includes(item)) {
            return res.status(400).json({ status: false, message: "Invalid item" });
        }

        const cost = item === "ladder" ? LADDER_COST : item === "explosive" ? EXPLOSIVE_COST : SUPPORT_COST;
        const amount = item === "ladder" ? LADDER_BATCH : 1;

        const user = await User.findById(userId).exec();
        if (!user) return res.status(404).json({ status: false, message: "User not found" });

        try {
            const resolved = await resolveUserAccount(user);
            if (!resolved.linked || !resolved.account) {
                return res.status(400).json({ status: false, message: "Link your Discord account to play" });
            }
            const xenCasinoAccountId = await getXenCasinoAccountId();

            await transfer({
                fromAccountId: resolved.account.accountId,
                toAccountId: xenCasinoAccountId,
                amount: cost.toFixed(10),
                key: txnKey("ranch-mine-equip"),
                note: "ranch_mine_equipment",
            });

            const doc = await XenCasinoRanch.addMineEquipment(userId, item, amount);
            return res.json({ status: true, data: { state: mineStateView(doc), balance: null } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    app.post("/api/casino/ranch/mine/flare", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);

        const user = await User.findById(userId).exec();
        if (!user) return res.status(404).json({ status: false, message: "User not found" });

        try {
            const resolved = await resolveUserAccount(user);
            if (!resolved.linked || !resolved.account) {
                return res.status(400).json({ status: false, message: "Link your Discord account to play" });
            }
            const xenCasinoAccountId = await getXenCasinoAccountId();

            await transfer({
                fromAccountId: resolved.account.accountId,
                toAccountId: xenCasinoAccountId,
                amount: FLARE_COST.toFixed(10),
                key: txnKey("ranch-mine-flare"),
                note: "ranch_mine_flare",
            });

            const doc = await XenCasinoRanch.useMineFlare(userId, MINE_FLARE_RADIUS);
            return res.json({ status: true, data: { state: mineStateView(doc), balance: null } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

    app.post("/api/casino/ranch/mine/reset", authenticateToken, requireGameEnabled(SLUG), async function (req: express.Request, res: express.Response) {
        const userId = String((req as AuthenticatedRequest).user!._id);

        const user = await User.findById(userId).exec();
        if (!user) return res.status(404).json({ status: false, message: "User not found" });

        try {
            const resolved = await resolveUserAccount(user);
            if (!resolved.linked || !resolved.account) {
                return res.status(400).json({ status: false, message: "Link your Discord account to play" });
            }
            const xenCasinoAccountId = await getXenCasinoAccountId();

            await transfer({
                fromAccountId: resolved.account.accountId,
                toAccountId: xenCasinoAccountId,
                amount: MAP_RESET_COST.toFixed(10),
                key: txnKey("ranch-mine-reset"),
                note: "ranch_mine_reset",
            });

            const doc = await XenCasinoRanch.resetMineMap(userId);
            return res.json({ status: true, data: { state: mineStateView(doc), balance: null } });
        } catch (err) {
            const status = err instanceof WeeabetsUnavailable ? 503 : err instanceof WeeabetsTransferError ? 400 : 500;
            return res.status(status).json({ status: false, message: (err as Error).message });
        }
    });

};
