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

// Same as todayKey but for an arbitrary Date — used by the garden decay logic to find
// which midnight-zone day a timestamp (e.g. grace-period end) falls on.
function dateKeyFromDate(date) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: CASINO_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
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
    flareCount: { type: Number, default: 0 },
}, { _id: false });

// ---------------------------------------------------------------------------
// Garden sub-schema
// ---------------------------------------------------------------------------
// Casino Garden - a 3x3 grid of squares, one seed per square, growing in parallel. Seed
// economics (cost, grow time, watering frequency, vermin/disease chance, payout
// multiplier) are owned by the route (casinoRanch.ts) and snapshotted onto the square at
// plant time - so a later seed-tier rebalance never retroactively changes a crop already
// growing. This model only owns square lifecycle (empty -> growing -> ready/dead) and
// the vermin/disease + neglect-decay tick loops over whatever values got snapshotted.

var GARDEN_GRID_SIZE = 9;
// Uniform across every seed - minimum time between two waterings of the *same* square.
// Also doubles as the vermin/disease hazard-tick period (the chance still varies by
// seed; only the cadence they're rolled at is fixed).
var GARDEN_WATER_COOLDOWN_MS = 60 * 60 * 1000;
// No neglect penalty at all until a plot has gone a full day with zero watering - well
// outside any normal sleep schedule.
var GARDEN_NEGLECT_GRACE_MS = 24 * 60 * 60 * 1000;
// Once past the grace period, one decay tick fires every hour: -1 waterCount, or death
// if waterCount is already 0. Watering at any point resets the neglect clock.
var GARDEN_DECAY_TICK_MS = 60 * 60 * 1000;
// Bonemeal (see statics.protect) shortens every watering cooldown on that square from
// then on, applied against the square's *current* effective cooldown so it composes with
// itself sanely if ever stacked (it can't be today - single-use per crop - but this way
// the math still holds if that ever changes).
var GARDEN_BONEMEAL_GROWTH_BOOST = 0.25;

// The cooldown between waterings on this particular square, right now - shorter than the
// base GARDEN_WATER_COOLDOWN_MS once bonemeal has been applied. This is also the same
// cooldown the hazard-tick cadence and the final ready-flip wait key off of (see
// resolveGardenSquare) - one number governs "how fast does this square move" everywhere.
function effectiveWaterCooldownMs(square) {
    return square.protection.bonemeal ? Math.round(GARDEN_WATER_COOLDOWN_MS * (1 - GARDEN_BONEMEAL_GROWTH_BOOST)) : GARDEN_WATER_COOLDOWN_MS;
}

function emptyGardenSquares() {
    var squares = [];
    for (var i = 0; i < GARDEN_GRID_SIZE; i++) {
        squares.push({ squareId: i, status: "empty" });
    }
    return squares;
}

var gardenSquareSchema = new mongoose.Schema(
    {
        squareId: { type: Number, required: true },
        seedType: { type: String, default: null },
        plantedAt: { type: Date, default: null },
        readyAt: { type: Date, default: null },
        lastWateredAt: { type: Date, default: null },
        lastCareCheckAt: { type: Date, default: null }, // last vermin/disease tick processed, so a gap of any length catches up correctly rather than re-rolling
        decayTicksApplied: { type: Number, default: 0 }, // decay ticks already applied since the current neglect period started (see resolveGardenSquare) - reset whenever lastWateredAt moves
        lastDecayDate: { type: String, default: null }, // "YYYY-MM-DD" in CASINO_TIMEZONE — last day midnight decay was applied
        // Snapshotted from the seed tier at plant time (see casinoRanch.ts SEED_TIERS) -
        // this square's own copy, immune to later tier rebalances.
        cost: { type: Number, default: 0 },
        waterAmount: { type: Number, default: 0 }, // total growth stages required to mature - a vermin hit raises this
        waterCount: { type: Number, default: 0 }, // growth stages reached so far
        verminHits: { type: Number, default: 0 }, // how many times vermin has set this crop back a growth stage - shown to the player, not just inferred
        verminChance: { type: Number, default: 0 }, // per tick, while unprotected - adds +1 to waterAmount
        diseaseChance: { type: Number, default: 0 }, // per tick, while unprotected — sets diseased (doubles decay rate), no longer kills
        diseased: { type: Boolean, default: false }, // disease hit active — decay loses 2 waterCount/day instead of 1; fungicide cures
        baseMultiplier: { type: Number, default: 0 }, // harvest payout = cost * baseMultiplier * (1 +/- variance)
        variance: { type: Number, default: 0 },
        protection: {
            pesticide: { type: Boolean, default: false }, // single-use shield - persists across misses, consumed only when it actually blocks a hit (see resolveGardenSquare)
            fungicide: { type: Boolean, default: false }, // single-use shield - persists across misses, consumed only when it actually blocks a hit (see resolveGardenSquare)
            fertilized: { type: Boolean, default: false }, // single-use - already applied, can't be bought again on this crop
            bonemeal: { type: Boolean, default: false }, // single-use - speeds up this square's watering cooldown, see effectiveWaterCooldownMs
        },
        status: { type: String, enum: ["empty", "growing", "ready", "dead"], default: "empty" },
    },
    { _id: false }
);

var gardenSubSchema = new mongoose.Schema(
    {
        squares: { type: [gardenSquareSchema], default: emptyGardenSquares },
    },
    { _id: false }
);

// Advances one growing square against `now`: rolls vermin/disease once per completed
// cooldown tick since planting (or the last roll) - catching up correctly across any gap -
// then, once a full GARDEN_NEGLECT_GRACE_MS has passed with zero watering, applies daily
// decay at midnight (CASINO_TIMEZONE): -1 waterCount per missed day, or -2 if diseased.
// Decay can kill once waterCount reaches 0. A vermin hit raises `waterAmount` by 1 (needs
// one more watering to mature); disease doubles the decay rate instead of killing
// outright. Pesticide/fungicide are a shield, not a per-check coin flip: the hazard roll
// happens on every tick same as always, protected or not, and a miss leaves the shield
// untouched (it holds across as many ticks/phases as it takes) - it's only consumed the
// moment a roll actually would have hit, absorbing that one hit and then flipping
// protection.pesticide/fungicide back to false. Flips growing -> ready once `waterCount`
// reaches `waterAmount`. No-op for any square not currently growing. Mutates in place;
// returns whether anything changed.
function resolveGardenSquare(square, now) {
    if (square.status !== "growing") {
        return false;
    }
    var changed = false;
    var cooldownMs = effectiveWaterCooldownMs(square);

    var tick = new Date((square.lastCareCheckAt || square.plantedAt).getTime());
    while (now.getTime() - tick.getTime() >= cooldownMs) {
        tick = new Date(tick.getTime() + cooldownMs);
        changed = true;
        if (Math.random() < square.diseaseChance) {
            if (square.protection.fungicide) {
                square.protection.fungicide = false; // consumed — it just blocked an actual hit
            } else {
                square.diseased = true; // doubles decay rate — fungicide cures, no longer instant death
            }
        }
        if (Math.random() < square.verminChance) {
            if (square.protection.pesticide) {
                square.protection.pesticide = false; // consumed - it just blocked an actual hit
            } else {
                square.waterAmount += 1;
                square.verminHits += 1;
            }
        }
    }
    if (changed) {
        square.lastCareCheckAt = tick;
    }

    // Daily decay: once per midnight (CASINO_TIMEZONE). Healthy plants have a 24h grace
    // period after their last watering before decay starts. Diseased plants have no grace —
    // decay begins the very next midnight regardless of when they were last watered.
    var today = todayKey();
    if (square.lastDecayDate !== today) {
        var lastWatered = square.lastWateredAt || square.plantedAt;
        var msSinceWatered = now.getTime() - lastWatered.getTime();
        var firstDecayDay = null;

        if (square.diseased) {
            // No grace — first decay is the next midnight after becoming diseased.
            var tomorrow = new Date(now.getTime() + 86400000);
            firstDecayDay = dateKeyFromDate(tomorrow);
        } else if (msSinceWatered >= GARDEN_NEGLECT_GRACE_MS) {
            var graceEndDate = new Date(lastWatered.getTime() + GARDEN_NEGLECT_GRACE_MS);
            firstDecayDay = dateKeyFromDate(graceEndDate);
        }

        if (firstDecayDay) {
            var startDay = square.lastDecayDate && square.lastDecayDate > firstDecayDay ? square.lastDecayDate : firstDecayDay;

            // Count midnights from startDay to today (today's decay is happening now).
            var sp = startDay.split("-").map(Number);
            var ep = today.split("-").map(Number);
            var sd = new Date(Date.UTC(sp[0], sp[1] - 1, sp[2]));
            var ed = new Date(Date.UTC(ep[0], ep[1] - 1, ep[2]));
            var daysMissed = Math.max(0, Math.floor((ed.getTime() - sd.getTime()) / 86400000));

            var decayPerDay = square.diseased ? 2 : 1;
            var totalDecay = daysMissed * decayPerDay;
            if (totalDecay > 0) {
                changed = true;
                square.waterCount = Math.max(0, square.waterCount - totalDecay);
                if (square.waterCount <= 0) {
                    square.lastDecayDate = today;
                    square.status = "dead";
                    return true;
                }
            }
        }
        square.lastDecayDate = today;
    }

    // Even once fully watered, the plot still needs the same cooldown to pass since that
    // final watering before it's actually ready - matches the wait between every other
    // watering rather than finishing the instant the last one lands (see statics.water).
    if (square.waterCount >= square.waterAmount && now.getTime() - (square.lastWateredAt || square.plantedAt).getTime() >= cooldownMs) {
        square.status = "ready";
        changed = true;
    }

    return changed;
}

function clearGardenSquare(square) {
    square.seedType = null;
    square.plantedAt = null;
    square.readyAt = null;
    square.lastWateredAt = null;
    square.lastCareCheckAt = null;
    square.decayTicksApplied = 0;
    square.lastDecayDate = null;
    square.diseased = false;
    square.cost = 0;
    square.waterAmount = 0;
    square.waterCount = 0;
    square.verminHits = 0;
    square.verminChance = 0;
    square.diseaseChance = 0;
    square.baseMultiplier = 0;
    square.variance = 0;
    square.protection = { pesticide: false, fungicide: false, fertilized: false, bonemeal: false };
    square.status = "empty";
}

// ---------------------------------------------------------------------------
// Main XenCasinoRanch schema
// ---------------------------------------------------------------------------

var xenCasinoRanchSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    creatures: { type: [creatureSubSchema], default: [] },
    inventory: { type: Map, of: Number, default: {} },
    mine: { type: mineSubSchema, default: function () { return {}; } },
    garden: { type: gardenSubSchema, default: function () { return { squares: emptyGardenSquares() }; } },
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

    // Tick garden squares (vermin/disease rolls, neglect decay, growing -> ready/dead).
    var now = new Date();
    doc.garden.squares.forEach(function (square) {
        if (resolveGardenSquare(square, now)) {
            dirty = true;
        }
    });

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
    if (!doc) return { doc: null, creature: null };
    var creature = doc.creatures.id(creatureId);
    return { doc: doc, creature: creature || null };
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
    doc.creatures.pull(creatureId);
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
    else if (item === "flare") doc.mine.flareCount += amount;
    await doc.save();
    return doc;
};

// Mirrors addMineEquipment but subtracts, guarding against going negative - used both for
// selling equipment back and for spending a Flare (no cheddar refund on that path, see the
// /mine/flare route). Returns null (no save) if the player doesn't own enough.
xenCasinoRanchSchema.statics.removeMineEquipment = async function (userId, item, amount) {
    var doc = await this.getState(userId);
    var countField = item === "ladder" ? "ladderCount" : item === "explosive" ? "explosiveCount" : item === "support" ? "reinforcementCount" : "flareCount";
    if (doc.mine[countField] < amount) {
        return null;
    }
    doc.mine[countField] -= amount;
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
// Garden statics
// ---------------------------------------------------------------------------

// `tier` is the seed's full economics snapshot from SEED_TIERS - { cost, growDurationMs,
// waterAmount, verminChance, diseaseChance, baseMultiplier, variance } - copied onto the
// square so later SEED_TIERS rebalances never retroactively affect an already-growing
// crop (including its eventual harvest payout). `readyAt` is kept only as an
// informational "earliest possible" display value - `waterCount >= waterAmount` is the
// real gate (see resolveGardenSquare).
xenCasinoRanchSchema.statics.plantGardenSquare = async function (userId, squareId, seedType, tier) {
    var doc = await this.getState(userId);
    var square = doc.garden.squares.find(function (s) { return s.squareId === squareId; });
    if (!square || square.status !== "empty") {
        return null;
    }
    var now = new Date();
    square.seedType = seedType;
    square.plantedAt = now;
    square.readyAt = new Date(now.getTime() + tier.growDurationMs);
    square.lastWateredAt = null; // unwatered until the player actually waters it - see statics.waterGardenSquare
    square.lastCareCheckAt = now;
    square.decayTicksApplied = 0;
    square.lastDecayDate = null;
    square.diseased = false;
    square.cost = tier.cost;
    square.waterAmount = tier.waterAmount;
    square.waterCount = 0; // planting does NOT count as a watering - the player must water it themselves
    square.verminHits = 0;
    square.verminChance = tier.verminChance;
    square.diseaseChance = tier.diseaseChance;
    square.baseMultiplier = tier.baseMultiplier;
    square.variance = tier.variance;
    square.protection = { pesticide: false, fungicide: false, fertilized: false, bonemeal: false };
    square.status = "growing";
    await doc.save();
    return square;
};

// The one place the per-square cooldown is enforced - rejects (returns null) if this
// square was already watered within its effectiveWaterCooldownMs (shorter than the base
// GARDEN_WATER_COOLDOWN_MS once bonemeal has been applied), so the route can respond with
// a clear "still on cooldown" 400 rather than silently no-op'ing. The very first watering
// (lastWateredAt still null - planting no longer auto-waters) is always allowed
// immediately; the cooldown only applies between waterings.
xenCasinoRanchSchema.statics.waterGardenSquare = async function (userId, squareId) {
    var doc = await this.getState(userId);
    var square = doc.garden.squares.find(function (s) { return s.squareId === squareId; });
    if (!square || square.status !== "growing") {
        return null;
    }
    var now = new Date();
    if (square.lastWateredAt && now.getTime() - square.lastWateredAt.getTime() < effectiveWaterCooldownMs(square)) {
        return null;
    }
    square.lastWateredAt = now;
    square.decayTicksApplied = 0; // watering restarts the 24h neglect clock
    square.waterCount += 1;
    // Deliberately does NOT flip status to "ready" here even if this was the final
    // required watering - resolveGardenSquare only does that once GARDEN_WATER_COOLDOWN_MS
    // has passed since this watering too, same wait as between any two waterings.
    await doc.save();
    return square;
};

// `item` is "pesticide" (a shield against vermin - stays active through any number of
// misses and is only consumed the moment it actually blocks a hit, see
// resolveGardenSquare), "fungicide" (same, but for disease), "fertilizer" (immediately
// reduces the remaining waterAmount by 1 - it doesn't skip watering, just shortens how
// many are needed), or "bonemeal" (speeds up this square's watering cooldown from now on,
// permanently for the rest of this crop - see effectiveWaterCooldownMs, applied via the
// protection.bonemeal flag set below with no extra state to mutate). Each is single-use
// per crop - already-true guards against paying twice while one's still active/pending.
// Fertilizer is additionally refused once only the last growth stage is left, so the
// final stage always has to be reached by an actual watering rather than bought away
// entirely.
xenCasinoRanchSchema.statics.protectGardenSquare = async function (userId, squareId, item) {
    var doc = await this.getState(userId);
    var square = doc.garden.squares.find(function (s) { return s.squareId === squareId; });
    // "fertilizer" is the item key everywhere else, but the schema field is "fertilized" -
    // map it here so the applied-flag actually gets read/written against a real path.
    var protectionKey = item === "fertilizer" ? "fertilized" : item;
    if (!square || square.status !== "growing" || square.protection[protectionKey]) {
        // Fungicide is special: it can be applied to a diseased square to cure it even if
        // a fungicide shield is already active (the existing shield is still consumed to cure).
        if (item === "fungicide" && square && square.status === "growing" && square.diseased) {
            square.diseased = false;
            // If no shield is active, grant one too.
            if (!square.protection.fungicide) {
                square.protection.fungicide = true;
            }
            await doc.save();
            return square;
        }
        return null;
    }
    if (item === "fertilizer" && square.waterAmount - square.waterCount <= 1) {
        return null;
    }
    square.protection[protectionKey] = true;
    if (item === "fertilizer") {
        square.waterAmount -= 1;
    }
    // Fungicide also cures existing disease when applied (shield + cure in one purchase).
    if (item === "fungicide" && square.diseased) {
        square.diseased = false;
    }
    await doc.save();
    return square;
};

// Called only after the harvest's inventory item has already been credited - re-validates
// status === "ready" itself rather than trusting the caller's earlier read, so a square
// can't be double-cleared/double-credited.
xenCasinoRanchSchema.statics.clearHarvestedGardenSquare = async function (userId, squareId) {
    var doc = await this.findOne({ userId: userId }).exec();
    if (!doc) {
        return null;
    }
    var square = doc.garden.squares.find(function (s) { return s.squareId === squareId; });
    if (!square || square.status !== "ready") {
        return null;
    }
    clearGardenSquare(square);
    await doc.save();
    return square;
};

// No money involved (a dead square's inputs are just lost), so this clears immediately
// rather than needing the pre/post-transfer split clearHarvestedGardenSquare uses.
xenCasinoRanchSchema.statics.clearDeadGardenSquare = async function (userId, squareId) {
    var doc = await this.getState(userId);
    var square = doc.garden.squares.find(function (s) { return s.squareId === squareId; });
    if (!square || square.status !== "dead") {
        return null;
    }
    clearGardenSquare(square);
    await doc.save();
    return square;
};

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

var XenCasinoRanch = mongoose.model("XenCasinoRanch", xenCasinoRanchSchema);

module.exports = {
    XenCasinoRanch: XenCasinoRanch,
    MINE_ORE_TIERS: MINE_ORE_TIERS,
    MINE_OUTCOME: MINE_OUTCOME,
    // Exported so casinoRanch.ts can build SEED_TIERS' growDurationMs from waterAmount
    // and render the same cooldown it's actually enforcing, rather than a second copy.
    GARDEN_WATER_COOLDOWN_MS: GARDEN_WATER_COOLDOWN_MS,
    GARDEN_NEGLECT_GRACE_MS: GARDEN_NEGLECT_GRACE_MS,
    // Exported so casinoRanch.ts can render/pre-check the same per-square cooldown
    // (shorter once bonemeal is applied) it's actually enforcing, rather than a second copy.
    effectiveWaterCooldownMs: effectiveWaterCooldownMs,
};
