/**
 * XenCasinoRanch - unified per-user document holding all Cheddar Ranch data:
 * creatures (was XenCasinoRanchCreature collection), inventory (was
 * XenCasinoRanchInventory), and mine state (was XenCasinoMineState).
 *
 * One document per user. Migrated from 3 separate collections into 1.
 */
var mongoose = require("mongoose");

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

var CASINO_TIMEZONE = "America/New_York";

function todayKey() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: CASINO_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

// ---------------------------------------------------------------------------
// Creature sub-schema
// ---------------------------------------------------------------------------

var creatureSubSchema = new mongoose.Schema({
    species: { type: String, required: true },
    name: { type: String, required: true },
    rarityTier: { type: String, required: true },
    stats: {
        speed: { type: Number, required: true },
        stamina: { type: Number, required: true },
        power: { type: Number, required: true },
        intelligence: { type: Number, required: true },
        luck: { type: Number, required: true },
        charm: { type: Number, required: true },
    },
    lastFedAt: { type: Date, default: null },
    feedCount: { type: Number, default: 0 },
    raceWins: { type: Number, default: 0 },
    raceLosses: { type: Number, default: 0 },
    decayTicksApplied: { type: Number, default: 0 },
    lastCollectedAt: { type: Date, default: null },
    lastCollectDate: { type: String, default: null },
    collectStreak: { type: Number, default: 0 },
    decayShieldUntil: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
}, { _id: true });

// ---------------------------------------------------------------------------
// Mine sub-schemas
// ---------------------------------------------------------------------------

var MINE_OUTCOME = { ORE: "ore", EMPTY: "empty", CAVE_IN: "cave_in", STONE_CLEARED: "stone_cleared", MOVE: "move" };

var MINE_BASE_ORE_CHANCE = 0.3;
var MINE_ORE_CHANCE_PER_DEPTH = 0.01;
var MINE_MAX_ORE_CHANCE = 0.6;
var MINE_BASE_CAVE_IN_CHANCE = 0.03;
var MINE_CAVE_IN_CHANCE_PER_DEPTH = 0.015;
var MINE_MAX_CAVE_IN_CHANCE = 0.4;
var MINE_BASE_STONE_CHANCE = 0.05;
var MINE_STONE_CHANCE_PER_DEPTH = 0.008;
var MINE_MAX_STONE_CHANCE = 0.35;

function mineOreChanceForDepth(depth) {
    return Math.min(MINE_MAX_ORE_CHANCE, MINE_BASE_ORE_CHANCE + depth * MINE_ORE_CHANCE_PER_DEPTH);
}
function mineCaveInChanceForDepth(depth) {
    return Math.min(MINE_MAX_CAVE_IN_CHANCE, MINE_BASE_CAVE_IN_CHANCE + depth * MINE_CAVE_IN_CHANCE_PER_DEPTH);
}
function mineStoneChanceForDepth(depth) {
    return Math.min(MINE_MAX_STONE_CHANCE, MINE_BASE_STONE_CHANCE + depth * MINE_STONE_CHANCE_PER_DEPTH);
}

var MINE_ORE_TIERS = [
    { key: "copper", label: "Copper Ore", minDepth: 0, weight: 100 },
    { key: "silver", label: "Silver Ore", minDepth: 4, weight: 55 },
    { key: "gold", label: "Gold Nugget", minDepth: 10, weight: 30 },
    { key: "emerald", label: "Emerald", minDepth: 18, weight: 15 },
    { key: "ruby", label: "Ruby", minDepth: 26, weight: 8 },
    { key: "diamond", label: "Diamond", minDepth: 35, weight: 3 },
];

function tierRank(key) {
    if (!key) return -1;
    return MINE_ORE_TIERS.findIndex(function (t) { return t.key === key; });
}

function pickOreTier(depth) {
    var eligible = MINE_ORE_TIERS.filter(function (t) { return t.minDepth <= depth; });
    var totalWeight = eligible.reduce(function (sum, t) { return sum + t.weight; }, 0);
    var roll = Math.random() * totalWeight;
    for (var i = 0; i < eligible.length; i++) {
        roll -= eligible[i].weight;
        if (roll <= 0) return eligible[i].key;
    }
    return eligible[eligible.length - 1].key;
}

var mineTileSubSchema = new mongoose.Schema({
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    oreTier: { type: String, default: null },
    isHeavyStone: { type: Boolean, default: false },
    status: { type: String, enum: ["scouted", "blocked", "mined", "collapsed"], default: "mined" },
}, { _id: false });

var mineSubSchema = new mongoose.Schema({
    positionX: { type: Number, default: 0 },
    positionY: { type: Number, default: 0 },
    dugTiles: { type: [mineTileSubSchema], default: [] },
    actionsToday: { type: Number, default: 0 },
    actionsDate: { type: String, default: null },
    ladderGrantDate: { type: String, default: null },
    ladderCount: { type: Number, default: 3 },
    explosiveCount: { type: Number, default: 0 },
    deepestDepthReached: { type: Number, default: 0 },
    bestGemTier: { type: String, default: null },
    reinforcementCount: { type: Number, default: 0 },
}, { _id: false });

// ---------------------------------------------------------------------------
// Main XenCasinoRanch schema
// ---------------------------------------------------------------------------

var xenCasinoRanchSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    creatures: { type: [creatureSubSchema], default: [] },
    inventory: { type: Map, of: Number, default: {} },
    mine: { type: mineSubSchema, default: function () { return {}; } },
});

// ---------------------------------------------------------------------------
// Mine helpers (operate on doc.mine)
// ---------------------------------------------------------------------------

function scoutTilesInRadius(mine, radius) {
    if (radius <= 0) return false;
    var changed = false;
    for (var dx = -radius; dx <= radius; dx++) {
        for (var dy = -radius; dy <= radius; dy++) {
            if (dx === 0 && dy === 0) continue;
            var x = mine.positionX + dx;
            var y = mine.positionY + dy;
            if (y < 0) continue;
            var known = mine.dugTiles.some(function (t) { return t.x === x && t.y === y; });
            if (known) continue;
            if (Math.random() < mineStoneChanceForDepth(y)) {
                mine.dugTiles.push({ x: x, y: y, oreTier: null, isHeavyStone: true, status: "blocked" });
            } else {
                var hasOre = Math.random() < mineOreChanceForDepth(y);
                mine.dugTiles.push({ x: x, y: y, oreTier: hasOre ? pickOreTier(y) : null, isHeavyStone: false, status: "scouted" });
            }
            changed = true;
        }
    }
    return changed;
}

// ---------------------------------------------------------------------------
// Static: getState
// ---------------------------------------------------------------------------

xenCasinoRanchSchema.statics.getState = async function (userId) {
    var doc = await this.findOneAndUpdate({ userId: userId }, {}, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
    var today = todayKey();
    var dirty = false;

    // Lazy-reset mine daily counters
    if (doc.mine && doc.mine.actionsDate !== today) {
        doc.mine.actionsDate = today;
        doc.mine.actionsToday = 0;
        dirty = true;
    }
    if (doc.mine && doc.mine.ladderGrantDate !== today) {
        doc.mine.ladderGrantDate = today;
        doc.mine.ladderCount += 1;
        dirty = true;
    }

    // Lazy-reset creature collect dates (if stale they become collectible)
    // No explicit decay tick here — resolveRanchDecay is called by the route

    if (dirty) {
        await doc.save();
    }
    return doc;
};

// ---------------------------------------------------------------------------
// Creature statics
// ---------------------------------------------------------------------------

xenCasinoRanchSchema.statics.addCreature = async function (userId, params) {
    var doc = await this.getState(userId);
    var creature = {
        species: params.species,
        name: params.name,
        rarityTier: params.rarityTier,
        stats: params.stats || { speed: 0, stamina: 0, power: 0, intelligence: 0, luck: 0, charm: 0 },
        lastCollectedAt: new Date(),
        lastCollectDate: todayKey(),
        createdAt: new Date(),
        feedCount: 0,
        raceWins: 0,
        raceLosses: 0,
        decayTicksApplied: 0,
        collectStreak: 0,
    };
    doc.creatures.push(creature);
    await doc.save();
    return doc.creatures[doc.creatures.length - 1];
};

xenCasinoRanchSchema.statics.getCreature = async function (userId, creatureId) {
    var doc = await this.findOne({ userId: userId }).exec();
    if (!doc) return null;
    return doc.creatures.id(creatureId) || null;
};

xenCasinoRanchSchema.statics.feedCreature = async function (userId, creatureId, gains, cooldownMs) {
    var doc = await this.findOne({ userId: userId }).exec();
    if (!doc) return null;
    var creature = doc.creatures.id(creatureId);
    if (!creature) return null;
    var now = new Date();
    if (creature.lastFedAt && now.getTime() - creature.lastFedAt.getTime() < cooldownMs) return null;
    creature.feedCount += 1;
    Object.keys(gains).forEach(function (key) {
        creature.stats[key] = (creature.stats[key] || 0) + gains[key];
    });
    creature.lastFedAt = now;
    creature.decayTicksApplied = 0;
    await doc.save();
    return creature;
};

xenCasinoRanchSchema.statics.recordRaceResult = async function (userId, creatureId, won, statBoost) {
    var doc = await this.findOne({ userId: userId }).exec();
    if (!doc) return null;
    var creature = doc.creatures.id(creatureId);
    if (!creature) return null;
    if (won) creature.raceWins += 1;
    else creature.raceLosses += 1;
    if (statBoost) {
        Object.keys(statBoost).forEach(function (key) {
            if (statBoost[key]) creature.stats[key] = (creature.stats[key] || 0) + statBoost[key];
        });
    }
    creature.collectStreak = 0;
    await doc.save();
    return creature;
};

xenCasinoRanchSchema.statics.collectFromCreature = async function (userId, creatureId) {
    var doc = await this.findOne({ userId: userId }).exec();
    if (!doc) return null;
    var creature = doc.creatures.id(creatureId);
    if (!creature) return null;
    var today = todayKey();
    if (creature.lastCollectDate === today) return null;
    creature.lastCollectedAt = new Date();
    creature.lastCollectDate = today;
    creature.collectStreak += 1;
    await doc.save();
    return creature;
};

xenCasinoRanchSchema.statics.releaseCreature = async function (userId, creatureId) {
    var doc = await this.findOne({ userId: userId }).exec();
    if (!doc) return null;
    var creature = doc.creatures.id(creatureId);
    if (!creature) return null;
    creature.remove();
    await doc.save();
    return creature;
};

xenCasinoRanchSchema.statics.applyTonic = async function (userId, creatureId, statKey, gain) {
    var doc = await this.findOne({ userId: userId }).exec();
    if (!doc) return null;
    var creature = doc.creatures.id(creatureId);
    if (!creature) return null;
    creature.stats[statKey] = (creature.stats[statKey] || 0) + gain;
    await doc.save();
    return creature;
};

xenCasinoRanchSchema.statics.setCreatureSpecies = async function (userId, creatureId, species) {
    var doc = await this.findOne({ userId: userId }).exec();
    if (!doc) return null;
    var creature = doc.creatures.id(creatureId);
    if (!creature) return null;
    creature.species = species;
    await doc.save();
    return creature;
};

xenCasinoRanchSchema.statics.setDecayShield = async function (userId, creatureId, until) {
    var doc = await this.findOne({ userId: userId }).exec();
    if (!doc) return null;
    var creature = doc.creatures.id(creatureId);
    if (!creature) return null;
    creature.decayShieldUntil = until;
    await doc.save();
    return creature;
};

// ---------------------------------------------------------------------------
// Inventory statics
// ---------------------------------------------------------------------------

xenCasinoRanchSchema.statics.addItem = async function (userId, itemKey, amount) {
    return this.findOneAndUpdate(
        { userId: userId },
        { $inc: { ["inventory." + itemKey]: amount } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).exec();
};

xenCasinoRanchSchema.statics.subtractItem = async function (userId, itemKey, amount) {
    return this.findOneAndUpdate(
        { userId: userId, ["inventory." + itemKey]: { $gte: amount } },
        { $inc: { ["inventory." + itemKey]: -amount } },
        { new: true }
    ).exec();
};

// ---------------------------------------------------------------------------
// Mine statics
// ---------------------------------------------------------------------------

xenCasinoRanchSchema.statics.applyMineDig = async function (userId, params) {
    var doc = await this.getState(userId);
    var mine = doc.mine;

    var targetX = mine.positionX + (params.direction === "left" ? -1 : params.direction === "right" ? 1 : 0);
    var targetY = mine.positionY + (params.direction === "down" ? 1 : params.direction === "up" ? -1 : 0);
    if (targetY < 0) return { error: "invalid_direction", doc: doc };

    var existing = mine.dugTiles.find(function (t) { return t.x === targetX && t.y === targetY; });

    // Free move through already-mined tile
    if (existing && existing.status === "mined") {
        mine.positionX = targetX;
        mine.positionY = targetY;
        await doc.save();
        return { outcome: MINE_OUTCOME.MOVE, oreTier: null, position: { x: targetX, y: targetY }, actionsToday: mine.actionsToday, targetY: targetY, usedExplosive: false, doc: doc };
    }

    // Collapsed tile = permanent dead end
    if (existing && existing.status === "collapsed") return { error: "Cave-in rubble blocks this tunnel permanently", doc: doc };

    var isHeavyStone = existing ? existing.isHeavyStone : Math.random() < mineStoneChanceForDepth(targetY);
    var blockedByCap = mine.actionsToday >= params.dailyDigCap;
    var blockedByLadder = (params.direction === "down" || params.direction === "up") && mine.ladderCount <= 0;
    var useExplosive = !!params.useExplosive;

    // Cap / ladder — cannot be bypassed by explosives
    if (blockedByCap) return { error: "Daily dig limit reached", doc: doc };
    if (blockedByLadder) return { error: "No ladders remaining", doc: doc };

    // Heavy stone requires explicit explosive
    if (isHeavyStone) {
        if (!useExplosive || mine.explosiveCount <= 0) {
            if (!existing) {
                mine.dugTiles.push({ x: targetX, y: targetY, oreTier: null, isHeavyStone: true, status: "blocked" });
                await doc.save();
            }
            return { error: "Heavy stone blocks the way — use an Explosive", doc: doc };
        }
    }

    var usedExplosive = false;
    if (useExplosive) {
        mine.explosiveCount -= 1;
        usedExplosive = true;
    }

    mine.actionsToday += 1;
    if ((params.direction === "down" || params.direction === "up") && !usedExplosive) mine.ladderCount -= 1;

    var outcome, resolvedOreTier = null;

    if (isHeavyStone) {
        outcome = MINE_OUTCOME.STONE_CLEARED;
        if (existing) {
            existing.status = "mined";
            existing.isHeavyStone = false;
        } else {
            mine.dugTiles.push({ x: targetX, y: targetY, oreTier: null, isHeavyStone: false, status: "mined" });
        }
        mine.positionX = targetX;
        mine.positionY = targetY;
    } else {
        var caveIn = Math.random() < mineCaveInChanceForDepth(targetY);
        if (caveIn && mine.reinforcementCount > 0) {
            mine.reinforcementCount -= 1;
            caveIn = false;
        }
        if (caveIn) {
            outcome = MINE_OUTCOME.CAVE_IN;
            mine.actionsToday = params.dailyDigCap;
            if (existing) {
                existing.status = "collapsed";
            } else {
                mine.dugTiles.push({ x: targetX, y: targetY, oreTier: null, isHeavyStone: false, status: "collapsed" });
            }
        } else {
            resolvedOreTier = existing && existing.status === "scouted" ? existing.oreTier : (Math.random() < mineOreChanceForDepth(targetY) ? pickOreTier(targetY) : null);
            outcome = resolvedOreTier ? MINE_OUTCOME.ORE : MINE_OUTCOME.EMPTY;
            if (existing) {
                existing.status = "mined";
                existing.oreTier = resolvedOreTier;
            } else {
                mine.dugTiles.push({ x: targetX, y: targetY, oreTier: resolvedOreTier, isHeavyStone: false, status: "mined" });
            }
            mine.positionX = targetX;
            mine.positionY = targetY;
            if (resolvedOreTier && tierRank(resolvedOreTier) > tierRank(mine.bestGemTier)) {
                mine.bestGemTier = resolvedOreTier;
            }
        }
    }

    if (mine.positionY > mine.deepestDepthReached) mine.deepestDepthReached = mine.positionY;

    await doc.save();
    return {
        outcome: outcome,
        oreTier: resolvedOreTier,
        position: { x: mine.positionX, y: mine.positionY },
        actionsToday: mine.actionsToday,
        targetY: targetY,
        usedExplosive: usedExplosive,
        doc: doc,
    };
};

xenCasinoRanchSchema.statics.addMineEquipment = async function (userId, item, amount) {
    var doc = await this.getState(userId);
    if (item === "ladder") doc.mine.ladderCount += amount;
    else if (item === "explosive") doc.mine.explosiveCount += amount;
    else if (item === "support") doc.mine.reinforcementCount += amount;
    await doc.save();
    return doc;
};

xenCasinoRanchSchema.statics.useMineFlare = async function (userId, flareRadius) {
    var doc = await this.getState(userId);
    scoutTilesInRadius(doc.mine, flareRadius);
    await doc.save();
    return doc;
};

xenCasinoRanchSchema.statics.resetMineMap = async function (userId) {
    var doc = await this.getState(userId);
    doc.mine.dugTiles = [];
    doc.mine.positionX = 0;
    doc.mine.positionY = 0;
    await doc.save();
    return doc;
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

var XenCasinoRanch = mongoose.model("XenCasinoRanch", xenCasinoRanchSchema);

module.exports = {
    XenCasinoRanch: XenCasinoRanch,
    MINE_ORE_TIERS: MINE_ORE_TIERS,
    MINE_OUTCOME: MINE_OUTCOME,
};
