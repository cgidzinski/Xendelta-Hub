var mongoose = require("mongoose");

// Persisted state shared by every XenCasino game - one singleton document,
// not a model per game. Games call the statics below rather than touching
// the schema directly.

// Jackpot pools are per-machine (a Map keyed by machine slug, e.g. "easy-spin" /
// "spinmania") since each slot machine has its own separate progressive jackpot - a hit
// on one machine only resets that machine's own pool, not every machine sharing this
// singleton document. Mongoose Map fields support atomic dot-path updates
// ($inc/$set on `slotsJackpotPools.<slug>`) exactly like a plain nested field, as long as
// the slug itself contains no dots.
// pachinkoJackpotPool is a plain scalar, not folded into slotsJackpotPools - there's exactly
// one Pachinko board, so a per-slug Map buys nothing here. If a second jackpot-using board
// ever ships, that's the point to generalize both fields into one shared Map, not before.
// manuallyClosed and disabledGames are the two admin-facing knobs from the XenCasino admin
// panel: manuallyClosed is a whole-casino kill switch (independent of the live bank-balance
// auto-close check the server computes alongside it - see casinoStatus.ts), disabledGames is
// per-game (e.g. "this one's broken, turn it off without a deploy"). Absent/false in the
// disabledGames map means enabled, same "absent means default" convention as slotsJackpotPools.
var xenCasinoSchema = new mongoose.Schema({
  _id: { type: String, default: "singleton" },
  slotsJackpotPools: { type: Map, of: Number, default: {} },
  pachinkoJackpotPool: { type: Number, default: 0 },
  manuallyClosed: { type: Boolean, default: false },
  disabledGames: { type: Map, of: Boolean, default: {} },
});

xenCasinoSchema.statics.getSingleton = async function () {
  var existing = await this.findById("singleton").exec();
  if (existing) {
    return existing;
  }
  return this.create({ _id: "singleton" });
};

xenCasinoSchema.statics.getJackpotPool = async function (machine, seed) {
  var doc = await this.getSingleton();
  var value = doc.slotsJackpotPools.get(machine);
  return value === undefined ? seed : value;
};

// Atomic - safe under concurrent spins on the same machine.
xenCasinoSchema.statics.incrementJackpotPool = async function (machine, amount) {
  var doc = await this.findByIdAndUpdate(
    "singleton",
    { $inc: { ["slotsJackpotPools." + machine]: amount } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).exec();
  return doc.slotsJackpotPools.get(machine);
};

xenCasinoSchema.statics.resetJackpotPool = async function (machine, seed) {
  var doc = await this.findByIdAndUpdate(
    "singleton",
    { $set: { ["slotsJackpotPools." + machine]: seed } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).exec();
  return doc.slotsJackpotPools.get(machine);
};

xenCasinoSchema.statics.getPachinkoJackpotPool = async function () {
  var doc = await this.getSingleton();
  return doc.pachinkoJackpotPool;
};

// Atomic - safe under concurrent launches, same as incrementJackpotPool above.
xenCasinoSchema.statics.incrementPachinkoJackpotPool = async function (amount) {
  var doc = await this.findByIdAndUpdate("singleton", { $inc: { pachinkoJackpotPool: amount } }, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
  return doc.pachinkoJackpotPool;
};

xenCasinoSchema.statics.resetPachinkoJackpotPool = async function (seed) {
  var doc = await this.findByIdAndUpdate("singleton", { $set: { pachinkoJackpotPool: seed } }, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
  return doc.pachinkoJackpotPool;
};

xenCasinoSchema.statics.setManuallyClosed = async function (closed) {
  var doc = await this.findByIdAndUpdate(
    "singleton",
    { $set: { manuallyClosed: closed } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).exec();
  return doc.manuallyClosed;
};

xenCasinoSchema.statics.setGameDisabled = async function (slug, disabled) {
  var doc = await this.findByIdAndUpdate(
    "singleton",
    { $set: { ["disabledGames." + slug]: disabled } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).exec();
  return !!doc.disabledGames.get(slug);
};

var XenCasino = mongoose.model("XenCasino", xenCasinoSchema);

// Durable record of one in-flight round - every game creates one of these before any
// money moves. The wager is debited the moment a round is created here - that's the whole
// point: without a durable record of "this player already paid," a player could
// refresh/abandon mid-flow and walk away having paid nothing, and a server crash between
// the debit and the payout would silently strand a winner's payout with no record to
// recover from. Deliberately its own collection, not fields on the singleton XenCasino
// document - many rounds can be in flight across many users at once, and cramming that
// into one document would serialize every start/resolve against a single row. Still lives
// in this one shared model file per the "no per-game model files" rule; only the
// *game-specific* meaning of `conditions` varies per game.
//
// Today's games (Slots, Scratch Ticket) are single-request: the outcome is fully decided
// *before* the round is even persisted, so `conditions` already carries the whole result
// (reels/lines/payout) and the same request settles it a few lines later. The record still
// exists so that if the process dies between the debit and the payout transfer, a recovery
// sweep has everything it needs to finish the payout instead of either stranding it or
// re-drawing (and potentially changing) the outcome. A future multi-step game (secret
// outcome at start, resolved later by an explicit player action) can use this same record -
// see `findActive`/`sweepStale`.
var xenCasinoRoundSchema = new mongoose.Schema({
  game: { type: String, required: true },
  userId: { type: String, required: true },
  wager: { type: Number, required: true },
  debitKey: { type: String, required: true, unique: true }, // idempotency key for the start-time debit transfer
  // Weeabets account id to pay out to (and to replay the debit against) - only needed by
  // games with a background recovery sweep, since that sweep has no request/session to
  // resolve it from.
  playerAccountId: { type: Number, required: false },
  conditions: { type: mongoose.Schema.Types.Mixed, required: true }, // game-specific state, e.g. { reels, payout }
  startedAt: { type: Date, default: Date.now },
  // Touched by applyConditionsUpdate below, on top of startedAt - single-request games
  // (Slots, Scratch, Plinko) never call that, so this stays equal to startedAt for them and
  // sweepStale's fallback keeps their existing behavior exactly as it was. A multi-step game
  // like Pachinko, whose round can legitimately stay open for minutes across many player
  // actions, needs staleness measured from the last thing that actually happened, not from
  // when the batch was first bought.
  lastActivityAt: { type: Date, default: Date.now },
  // Incremented each time a recovery-sweep attempt on this round throws (an "ambiguous"
  // debit/settlement failure). Purely observational - never read by any money-moving logic,
  // only used to escalate logging so a permanently-stuck round doesn't fail silently forever.
  sweepFailureCount: { type: Number, default: 0 },
});
// One active round per user per game - except Plinko, which allows several balls in flight
// at once (see plinko.ts's own count-based cap for that). Every other game (Pachinko's
// buy/resume flow in particular) still genuinely depends on there being at most one active
// round to find/resume, so the constraint stays a real DB guarantee for them; Plinko is the
// one place a single request fully decides and settles its own round in one shot, so nothing
// here needs "the" active round to look anything up against.
xenCasinoRoundSchema.index({ game: 1, userId: 1 }, { unique: true, partialFilterExpression: { game: { $ne: "plinko" } } });

xenCasinoRoundSchema.statics.startRound = async function (params) {
  return this.create({
    // Pre-generated by the caller so the same id can be embedded in the debit transfer's
    // idempotency key (short and unique) before the round exists - see each game route's
    // `roundId` usage. Falls back to Mongoose auto-generating one if omitted.
    _id: params.roundId,
    game: params.game,
    userId: params.userId,
    wager: params.wager,
    debitKey: params.debitKey,
    playerAccountId: params.playerAccountId,
    conditions: params.conditions,
  });
};

xenCasinoRoundSchema.statics.findActive = async function (game, userId) {
  return this.findOne({ game: game, userId: userId }).exec();
};

xenCasinoRoundSchema.statics.resolve = async function (roundId) {
  await this.findByIdAndDelete(roundId).exec();
};

// Guarded version of resolve() - only deletes if the round still matches `guard` at delete
// time. Needed wherever a round's deferred/async close-out (e.g. Pachinko's post-response
// settlement once its last ball's payout confirms) could otherwise race a player action that
// legitimately revives the round in between (e.g. buying more balls) - an unconditional
// delete there would silently wipe a round with freshly-paid-for state on it. Returns whether
// the delete actually happened, so callers know if their close-out actions (e.g. recording a
// completed round) still apply.
xenCasinoRoundSchema.statics.resolveIfConditions = async function (roundId, guard) {
  var doc = await this.findOneAndDelete(Object.assign({ _id: roundId }, guard)).exec();
  return !!doc;
};

// Atomically applies an update (e.g. $inc/$push on `conditions.*`) to a round, gated by an
// optional guard filter (e.g. "only if conditions.ballsRemaining > 0"). Returns the updated
// doc, or null if the guard no longer matches - a concurrent request already consumed
// whatever this one wanted to claim. Callers treat null as "nothing changed, nothing to
// reconcile," never as an ambiguous failure. Always stamps lastActivityAt, which is the
// point of this static existing separately from a plain findOneAndUpdate. Generic on
// purpose, not Pachinko-specific - the extension point the comment above XenCasinoRound
// anticipates for the next multi-step game.
xenCasinoRoundSchema.statics.applyConditionsUpdate = async function (roundId, guard, update) {
  var filter = Object.assign({ _id: roundId }, guard || {});
  var withTimestamp = Object.assign({}, update);
  withTimestamp.$set = Object.assign({ lastActivityAt: new Date() }, update.$set || {});
  return this.findOneAndUpdate(filter, withTimestamp, { new: true }).exec();
};

// Scoped to one game on purpose - "stale" means something different per game (a game that
// forfeits on abandonment vs. one like Slots/Scratch where the outcome was already decided
// and may still owe a payout, which only that game's own recovery logic knows how to
// replay). A blanket cross-game sweep would risk deleting an unsettled winning round
// before it's paid. Keys off lastActivityAt (falls back to startedAt for any pre-existing
// round docs from before that field existed) rather than startedAt, so a long-running
// multi-step session isn't swept just for having been open a while - see the field comment
// above.
xenCasinoRoundSchema.statics.sweepStale = async function (game, ttlMs) {
  var cutoff = new Date(Date.now() - ttlMs);
  return this.find({
    game: game,
    $or: [{ lastActivityAt: { $lt: cutoff } }, { lastActivityAt: { $exists: false }, startedAt: { $lt: cutoff } }],
  }).exec();
};

// Called from the shared stale-round sweep loop (see staleRoundRecovery.ts) whenever a
// settlement attempt on a round throws, so a round that fails the same way on every retry
// (instead of eventually recovering) can be told apart from a one-off transient failure - see
// SWEEP_FAILURE_ALERT_THRESHOLD there. Never touches wager/debitKey/conditions, only this counter.
xenCasinoRoundSchema.statics.recordSweepFailure = async function (roundId) {
  var doc = await this.findByIdAndUpdate(roundId, { $inc: { sweepFailureCount: 1 } }, { new: true }).exec();
  return doc ? doc.sweepFailureCount : null;
};

var XenCasinoRound = mongoose.model("XenCasinoRound", xenCasinoRoundSchema);

var DAILY_QUEST_TARGET = 10;

function todayKey() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD", UTC
}

// One doc per user for whatever per-user XenCasino state accumulates over time (today
// just the daily quest; a natural home for lifetime stats/achievements/etc. later)
// without bolting single-purpose fields onto the core User model.
var xenCasinoUserStateSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  dailyQuest: {
    date: { type: String, default: null }, // "YYYY-MM-DD" (UTC) the fields below apply to
    roundsPlayed: { type: Number, default: 0 },
    claimed: { type: Boolean, default: false },
  },
});

function dailyQuestStatus(doc) {
  var quest = doc.dailyQuest && doc.dailyQuest.date === todayKey() ? doc.dailyQuest : { roundsPlayed: 0, claimed: false };
  return {
    target: DAILY_QUEST_TARGET,
    roundsPlayed: quest.roundsPlayed,
    claimed: quest.claimed,
    canClaim: quest.roundsPlayed >= DAILY_QUEST_TARGET && !quest.claimed,
  };
}

// Not a single atomic $inc - this only counts activity (not money), so a rare
// double-count under truly simultaneous cross-game rounds from one user is a low-stakes
// edge case, not worth a conditional aggregation-pipeline update. Returns
// { status, justCompleted } so callers can fire a one-time "quest ready" notification.
xenCasinoUserStateSchema.statics.recordRoundPlayed = async function (userId) {
  var doc = await this.findOneAndUpdate({ userId: userId }, {}, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
  var today = todayKey();
  var wasComplete = !!doc.dailyQuest && doc.dailyQuest.date === today && doc.dailyQuest.roundsPlayed >= DAILY_QUEST_TARGET;
  if (!doc.dailyQuest || doc.dailyQuest.date !== today) {
    doc.dailyQuest = { date: today, roundsPlayed: 0, claimed: false };
  }
  doc.dailyQuest.roundsPlayed += 1;
  await doc.save();
  var status = dailyQuestStatus(doc);
  return { status: status, justCompleted: !wasComplete && status.roundsPlayed >= DAILY_QUEST_TARGET };
};

xenCasinoUserStateSchema.statics.getDailyQuestStatus = async function (userId) {
  var doc = await this.findOne({ userId: userId }).exec();
  return doc ? dailyQuestStatus(doc) : dailyQuestStatus({ dailyQuest: null });
};

// Marks today's quest claimed - called by the route only *after* the reward transfer
// has actually succeeded. The transfer's own idempotency key (derived from userId+date)
// is the real guard against double-payment, not this flag, so it's safe to mark this
// after the fact rather than before attempting the transfer.
xenCasinoUserStateSchema.statics.markDailyQuestClaimed = async function (userId, date) {
  var doc = await this.findOneAndUpdate({ userId: userId }, {}, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
  if (doc.dailyQuest && doc.dailyQuest.date === date) {
    doc.dailyQuest.claimed = true;
    await doc.save();
  }
};

var XenCasinoUserState = mongoose.model("XenCasinoUserState", xenCasinoUserStateSchema);

// Durable, permanent record of one settled round's money movement - written once per round
// right after XenCasinoRound.resolve(), by recordCasinoRoundPlayed() (see dailyQuest.ts).
// This is what admin stats (src/server/routes/admin/casino.ts) aggregate over instead of
// re-parsing the external Weeabets ledger on every request. `wager`/`payout` are plain
// numbers rather than a note-string convention, so aggregation needs no parsing.
var xenCasinoActivitySchema = new mongoose.Schema({
  game: { type: String, required: true }, // machine/game slug, e.g. "easy-spin"
  userId: { type: String, required: true },
  wager: { type: Number, required: true },
  payout: { type: Number, required: true, default: 0 },
  jackpot: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});
xenCasinoActivitySchema.index({ createdAt: 1 });
xenCasinoActivitySchema.index({ game: 1, createdAt: 1 });
xenCasinoActivitySchema.index({ userId: 1, createdAt: 1 });

xenCasinoActivitySchema.statics.clearAll = async function () {
  await this.deleteMany({}).exec();
};

xenCasinoActivitySchema.statics.record = async function (params) {
  await this.create({
    game: params.game,
    userId: params.userId,
    wager: params.wager,
    payout: params.payout || 0,
    jackpot: !!params.jackpot,
  });
};

var XenCasinoActivity = mongoose.model("XenCasinoActivity", xenCasinoActivitySchema);

// ---------------------------------------------------------------------------------------
// Casino Garden - a 3x3 grid of squares, one seed per square, growing in parallel. Seed
// economics (cost, grow time, watering frequency, vermin/disease chance, payout
// multiplier) are owned by the route (casinoGarden.ts) and snapshotted onto the square at
// plant time - so a later seed-tier rebalance never retroactively changes a crop already
// growing. This model only owns square lifecycle (empty -> growing -> ready/dead) and
// the vermin/disease + neglect-decay tick loops over whatever values got snapshotted.
// ---------------------------------------------------------------------------------------

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
    // Snapshotted from the seed tier at plant time (see casinoGarden.ts SEED_TIERS) -
    // this square's own copy, immune to later tier rebalances.
    cost: { type: Number, default: 0 },
    waterAmount: { type: Number, default: 0 }, // total growth stages required to mature - a vermin hit raises this
    waterCount: { type: Number, default: 0 }, // growth stages reached so far
    verminHits: { type: Number, default: 0 }, // how many times vermin has set this crop back a growth stage - shown to the player, not just inferred
    verminChance: { type: Number, default: 0 }, // per tick, while unprotected - adds +1 to waterAmount
    diseaseChance: { type: Number, default: 0 }, // per tick, while unprotected - kills outright
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

var xenCasinoGardenStateSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  squares: { type: [gardenSquareSchema], default: emptyGardenSquares },
});

// Advances one growing square against `now`: rolls vermin/disease once per completed
// cooldown tick since planting (or the last roll) - catching up correctly across any gap,
// same pattern as resolvePrinterRun below - then, once a full GARDEN_NEGLECT_GRACE_MS has
// passed with zero watering, applies one decay tick per completed GARDEN_DECAY_TICK_MS
// since the grace period ended: -1 waterCount, or death if waterCount is already 0. A
// vermin hit raises `waterAmount` by 1 (needs one more watering to mature); disease kills
// outright, independent of decay. Pesticide/fungicide are a shield, not a per-check
// coin flip: the hazard roll happens on every tick same as always, protected or not, and
// a miss leaves the shield untouched (it holds across as many ticks/phases as it takes) -
// it's only consumed the moment a roll actually would have hit, absorbing that one hit
// and then flipping protection.pesticide/fungicide back to false. Flips growing -> ready
// once `waterCount` reaches `waterAmount`. No-op for any square not currently growing.
// Mutates in place; returns whether anything changed.
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
        square.protection.fungicide = false; // consumed - it just blocked an actual hit
      } else {
        square.status = "dead";
        square.lastCareCheckAt = tick;
        return true;
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

  var neglectAnchor = square.lastWateredAt || square.plantedAt;
  var elapsedSinceWatered = now.getTime() - neglectAnchor.getTime();
  if (elapsedSinceWatered >= GARDEN_NEGLECT_GRACE_MS) {
    var ticksDue = Math.floor((elapsedSinceWatered - GARDEN_NEGLECT_GRACE_MS) / GARDEN_DECAY_TICK_MS) + 1;
    var newTicks = ticksDue - square.decayTicksApplied;
    for (var i = 0; i < newTicks; i++) {
      changed = true;
      if (square.waterCount > 0) {
        square.waterCount -= 1;
      } else {
        square.status = "dead";
        break;
      }
    }
    square.decayTicksApplied = ticksDue;
    if (square.status === "dead") {
      return true;
    }
  }

  // Even once fully watered, the plot still needs the same cooldown to pass since that
  // final watering before it's actually ready - matches the wait between every other
  // watering rather than finishing the instant the last one lands (see statics.water).
  if (square.waterCount >= square.waterAmount && now.getTime() - neglectAnchor.getTime() >= cooldownMs) {
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

xenCasinoGardenStateSchema.statics.getState = async function (userId) {
  var doc = await this.findOneAndUpdate({ userId: userId }, {}, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
  var now = new Date();
  var changed = false;
  doc.squares.forEach(function (square) {
    if (resolveGardenSquare(square, now)) {
      changed = true;
    }
  });
  if (changed) {
    await doc.save();
  }
  return doc;
};

// `tier` is the seed's full economics snapshot from SEED_TIERS - { cost, growDurationMs,
// waterAmount, verminChance, diseaseChance, baseMultiplier, variance } - copied onto the
// square so later SEED_TIERS rebalances never retroactively affect an already-growing
// crop (including its eventual harvest payout). `readyAt` is kept only as an
// informational "earliest possible" display value - `waterCount >= waterAmount` is the
// real gate (see resolveGardenSquare).
xenCasinoGardenStateSchema.statics.plant = async function (userId, squareId, seedType, tier) {
  var doc = await this.getState(userId);
  var square = doc.squares.find(function (s) { return s.squareId === squareId; });
  if (!square || square.status !== "empty") {
    return null;
  }
  var now = new Date();
  square.seedType = seedType;
  square.plantedAt = now;
  square.readyAt = new Date(now.getTime() + tier.growDurationMs);
  square.lastWateredAt = null; // unwatered until the player actually waters it - see statics.water
  square.lastCareCheckAt = now;
  square.decayTicksApplied = 0;
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
xenCasinoGardenStateSchema.statics.water = async function (userId, squareId) {
  var doc = await this.getState(userId);
  var square = doc.squares.find(function (s) { return s.squareId === squareId; });
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
xenCasinoGardenStateSchema.statics.protect = async function (userId, squareId, item) {
  var doc = await this.getState(userId);
  var square = doc.squares.find(function (s) { return s.squareId === squareId; });
  if (!square || square.status !== "growing" || square.protection[item]) {
    return null;
  }
  if (item === "fertilizer" && square.waterAmount - square.waterCount <= 1) {
    return null;
  }
  square.protection[item] = true;
  if (item === "fertilizer") {
    square.waterAmount -= 1;
  }
  await doc.save();
  return square;
};

// Called only after the harvest payout transfer has already succeeded (mirrors
// markDailyQuestClaimed below) - re-validates status === "ready" itself rather than
// trusting the caller's earlier read, so a square can't be double-cleared/double-paid.
xenCasinoGardenStateSchema.statics.clearHarvestedSquare = async function (userId, squareId) {
  var doc = await this.findOne({ userId: userId }).exec();
  if (!doc) {
    return null;
  }
  var square = doc.squares.find(function (s) { return s.squareId === squareId; });
  if (!square || square.status !== "ready") {
    return null;
  }
  clearGardenSquare(square);
  await doc.save();
  return square;
};

// No money involved (a dead square's inputs are just lost), so this clears immediately
// rather than needing the pre/post-transfer split clearHarvestedSquare uses.
xenCasinoGardenStateSchema.statics.clearDeadSquare = async function (userId, squareId) {
  var doc = await this.getState(userId);
  var square = doc.squares.find(function (s) { return s.squareId === squareId; });
  if (!square || square.status !== "dead") {
    return null;
  }
  clearGardenSquare(square);
  await doc.save();
  return square;
};

var XenCasinoGardenState = mongoose.model("XenCasinoGardenState", xenCasinoGardenStateSchema);

// ---------------------------------------------------------------------------------------
// Money Printer - one print run at a time, off an illicit computer rig. Payout multiplier
// and raid risk are both derived from elapsed time (computed on read), never stored as a
// "current value" - only the timestamps needed to derive them are persisted. Parts price /
// peak duration / bribe cost / payout multiplier ceiling are all route-owned economics,
// passed in.
// ---------------------------------------------------------------------------------------

var PRINTER_ROLL_INTERVAL_MS = 5 * 60 * 1000; // how often a raid chance is rolled while a run is going
var PRINTER_RISK_RAMP_MS = 2 * 60 * 60 * 1000; // time since last bribe for the per-roll raid chance to reach its ceiling
var PRINTER_BASE_RAID_CHANCE = 0.05; // real risk from the very first roll - no truly safe "collect immediately" window
var PRINTER_MAX_RAID_CHANCE = 0.4; // per-roll ceiling - rising risk, never a certainty

// `run.raidMultiplier` (set at start time from the sum of the run's 3 chosen parts'
// raidBonus - see casinoPrinter.ts) scales the whole ramped curve; a loud/reckless parts
// pick reaches the PRINTER_MAX_RAID_CHANCE ceiling sooner, but the ceiling itself never
// moves regardless of parts.
function printerRaidChance(now, run) {
  var since = now.getTime() - new Date(run.lastBribeAt || run.startedAt).getTime();
  var ramped = PRINTER_BASE_RAID_CHANCE + (since / PRINTER_RISK_RAMP_MS) * (PRINTER_MAX_RAID_CHANCE - PRINTER_BASE_RAID_CHANCE);
  return Math.min(PRINTER_MAX_RAID_CHANCE, ramped * (run.raidMultiplier || 1));
}

// Rolls one raid check per completed PRINTER_ROLL_INTERVAL_MS tick since the run started
// (or was last rolled) - catches up correctly across gaps of any length between reads, no
// cron needed. Stops at the first hit. Mutates `run` in place; returns whether it changed.
function resolvePrinterRun(run, now) {
  if (!run || run.raidedAt) {
    return false;
  }
  var lastRoll = new Date(run.lastRiskRollAt || run.startedAt);
  var initial = lastRoll.getTime();
  while (now.getTime() - lastRoll.getTime() >= PRINTER_ROLL_INTERVAL_MS) {
    lastRoll = new Date(lastRoll.getTime() + PRINTER_ROLL_INTERVAL_MS);
    if (Math.random() < printerRaidChance(lastRoll, run)) {
      run.raidedAt = lastRoll;
      break;
    }
  }
  var changed = run.raidedAt || lastRoll.getTime() !== initial;
  if (changed) {
    run.lastRiskRollAt = lastRoll;
  }
  return !!changed;
}

var xenCasinoPrinterStateSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  // { startedAt, partsCost, peakAt, lastBribeAt, lastRiskRollAt, raidedAt } | null -
  // Mixed/Object rather than a fixed sub-schema since it's null whenever no run is going.
  run: { type: Object, default: null },
});

xenCasinoPrinterStateSchema.statics.getState = async function (userId) {
  var doc = await this.findOneAndUpdate({ userId: userId }, {}, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
  if (doc.run && resolvePrinterRun(doc.run, new Date())) {
    doc.markModified("run");
    await doc.save();
  }
  return doc;
};

// `peakMultiplier`/`raidMultiplier` are the run's own effective curve, already computed
// (and clamped) by casinoPrinter.ts from the sum of its 3 chosen parts' rateBonus/
// raidBonus - stored here so every later read (currentMultiplier, printerRaidChance)
// uses this specific run's curve, not the global constants.
xenCasinoPrinterStateSchema.statics.startRun = async function (userId, partsCost, peakDurationMs, peakMultiplier, raidMultiplier, partKeys, usedMachineUpgrade) {
  var doc = await this.getState(userId);
  if (doc.run) {
    return null;
  }
  var now = new Date();
  doc.run = {
    startedAt: now,
    partsCost: partsCost,
    peakAt: new Date(now.getTime() + peakDurationMs),
    peakMultiplier: peakMultiplier,
    raidMultiplier: raidMultiplier,
    partKeys: partKeys,
    usedMachineUpgrade: !!usedMachineUpgrade, // just for display (see runView) - already baked into peakMultiplier above
    lastBribeAt: now,
    lastRiskRollAt: now,
    raidedAt: null,
    bribeCount: 0, // how many times this run has been bribed - each one costs more (see casinoPrinter.ts nextBribeCost)
  };
  doc.markModified("run");
  await doc.save();
  return doc.run;
};

xenCasinoPrinterStateSchema.statics.bribe = async function (userId) {
  var doc = await this.getState(userId);
  if (!doc.run || doc.run.raidedAt) {
    return null;
  }
  doc.run.lastBribeAt = new Date();
  doc.run.bribeCount = (doc.run.bribeCount || 0) + 1;
  doc.markModified("run");
  await doc.save();
  return doc.run;
};

// Called after a successful collect payout (or to dismiss a raided run, which pays
// nothing) - clears unconditionally since by this point the caller has already decided
// the run is done being acted on.
xenCasinoPrinterStateSchema.statics.clearRun = async function (userId) {
  var doc = await this.findOne({ userId: userId }).exec();
  if (!doc) {
    return null;
  }
  doc.run = null;
  await doc.save();
  return doc;
};

var XenCasinoPrinterState = mongoose.model("XenCasinoPrinterState", xenCasinoPrinterStateSchema);

// ---------------------------------------------------------------------------------------
// Chip Mine - a dark, side-view shaft the player actively digs into. Moving through
// tunnels you've already cleared is always free (no risk, no dig spent, no equipment
// touched) - only pushing into new, undug territory is a real "dig": it spends one of
// today's digs, needs a ladder to go down, and resolves whatever's actually there (heavy
// stone, a cave-in, or a gem). Every tile the player has ever dug stays visible
// permanently. There's no passive/automatic scouting anymore - a Flare is the only way
// to preview a tile (its gem tier, or whether it's heavy stone) before committing to dig
// it; blind digging is the default, same as it's always been for cave-in risk. Ore
// tier/cave-in/heavy-stone chance by depth are structural, depth-derived math that lives
// here (like the Money Printer's raid-risk formula); item prices and payout $ amounts
// stay route-owned economics.
// ---------------------------------------------------------------------------------------

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

// A sideways dig uses the *current* depth's cave-in/stone chance; a down dig uses the
// *target* (deeper) depth's - this is what makes "down" the risk-escalating direction
// and "side" the flat-risk one (see casinoMine.ts for how depth is picked per direction).
function mineOreChanceForDepth(depth) {
  return Math.min(MINE_MAX_ORE_CHANCE, MINE_BASE_ORE_CHANCE + depth * MINE_ORE_CHANCE_PER_DEPTH);
}
function mineCaveInChanceForDepth(depth) {
  return Math.min(MINE_MAX_CAVE_IN_CHANCE, MINE_BASE_CAVE_IN_CHANCE + depth * MINE_CAVE_IN_CHANCE_PER_DEPTH);
}
function mineStoneChanceForDepth(depth) {
  return Math.min(MINE_MAX_STONE_CHANCE, MINE_BASE_STONE_CHANCE + depth * MINE_STONE_CHANCE_PER_DEPTH);
}

// Ordered shallowest-to-deepest on purpose - pickOreTier below walks this to find the
// slice unlocked at a given depth. `minDepth`/`weight` are structural (what's findable
// where), so they live here; each tier's $ value multiplier is economics and stays
// route-owned (see MINE_ORE_TIER_VALUE in casinoMine.ts).
var MINE_ORE_TIERS = [
  { key: "copper", label: "Copper Ore", minDepth: 0, weight: 100 },
  { key: "silver", label: "Silver Ore", minDepth: 4, weight: 55 },
  { key: "gold", label: "Gold Nugget", minDepth: 10, weight: 30 },
  { key: "emerald", label: "Emerald", minDepth: 18, weight: 15 },
  { key: "ruby", label: "Ruby", minDepth: 26, weight: 8 },
  { key: "diamond", label: "Diamond", minDepth: 35, weight: 3 },
];

// Index into MINE_ORE_TIERS - since it's ordered shallowest/most-common to
// deepest/rarest, a higher rank means a rarer (better) find. Used to track a player's
// lifetime-best gem without needing the route-owned $ value multiplier here.
function tierRank(key) {
  return MINE_ORE_TIERS.findIndex(function (t) { return t.key === key; });
}

// Weighted-random among every tier unlocked at `depth` - shallow digs only ever roll
// Copper (the only tier with minDepth 0), deeper digs add rarer tiers into the pool, so
// both the chance of a good find and its expected value rise with depth, with no
// separate formula needed - it falls straight out of the min-depth gate.
function pickOreTier(depth) {
  var eligible = MINE_ORE_TIERS.filter(function (t) { return t.minDepth <= depth; });
  var totalWeight = eligible.reduce(function (sum, t) { return sum + t.weight; }, 0);
  var roll = Math.random() * totalWeight;
  for (var i = 0; i < eligible.length; i++) {
    roll -= eligible[i].weight;
    if (roll <= 0) {
      return eligible[i].key;
    }
  }
  return eligible[eligible.length - 1].key;
}

// "scouted": ground truth (oreTier) rolled and cached via a Flare, not yet dug. "blocked":
// rolled/discovered as heavy stone (via a Flare or a rejected dig attempt) - needs an
// Explosive to clear, not diggable normally. "mined": actually dug and resolved for good
// (a gem collected if oreTier is set, or was empty, or was cleared stone). "collapsed": a
// cave-in happened here - a hazard marker, unrelated to ore/scouting.
var mineTileSchema = new mongoose.Schema(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    oreTier: { type: String, default: null }, // one of MINE_ORE_TIERS' keys, or null (empty/stone/collapsed)
    isHeavyStone: { type: Boolean, default: false },
    status: { type: String, enum: ["scouted", "blocked", "mined", "collapsed"], default: "mined" },
  },
  { _id: false }
);

var xenCasinoMineStateSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  positionX: { type: Number, default: 0 },
  positionY: { type: Number, default: 0 }, // depth - increases downward from the shaft entrance at 0
  dugTiles: { type: [mineTileSchema], default: [] }, // scouted/blocked/mined/collapsed tiles
  digsToday: { type: Number, default: 0 },
  digsDate: { type: String, default: null }, // "YYYY-MM-DD" (UTC) digsToday applies to, lazy-reset like the daily quest
  ladderGrantDate: { type: String, default: null }, // "YYYY-MM-DD" (UTC) the free daily ladder was last granted, lazy-reset like digsDate
  ladderCount: { type: Number, default: 3 }, // a few free starter ladders
  explosiveCount: { type: Number, default: 0 }, // single-use: blasts through the daily dig cap, a missing ladder, and/or a heavy-stone tile, any combination at once
  deepestDepthReached: { type: Number, default: 0 }, // lifetime best, never decreases
  bestGemTier: { type: String, default: null }, // rarest MINE_ORE_TIERS key ever struck, or null
  reinforcementCount: { type: Number, default: 0 }, // single-use shield - stays armed through any number of safe digs, only consumed the moment it actually blocks a cave-in
});

// Reveals not-yet-known tiles within `radius` of `doc`'s position, rolling and caching
// each one's ground truth - whether it's heavy stone, and if not, its ore tier if any
// (using the same depth-based chances a dig would use) - as a "scouted" (has a gem, or
// empty) or "blocked" (heavy stone) tile. Already-known tiles (scouted, blocked, mined,
// or collapsed) are never touched or re-rolled. Cave-in risk is deliberately never
// rolled/revealed here - it isn't knowable until you actually commit to the dig. Mutates
// `doc.dugTiles` in place; returns whether anything changed.
function scoutTilesInRadius(doc, radius) {
  if (radius <= 0) {
    return false;
  }
  var changed = false;
  for (var dx = -radius; dx <= radius; dx++) {
    for (var dy = -radius; dy <= radius; dy++) {
      if (dx === 0 && dy === 0) {
        continue;
      }
      var x = doc.positionX + dx;
      var y = doc.positionY + dy;
      if (y < 0) {
        continue; // nothing above the shaft entrance
      }
      var known = doc.dugTiles.some(function (t) { return t.x === x && t.y === y; });
      if (known) {
        continue;
      }
      if (Math.random() < mineStoneChanceForDepth(y)) {
        doc.dugTiles.push({ x: x, y: y, oreTier: null, isHeavyStone: true, status: "blocked" });
      } else {
        var hasOre = Math.random() < mineOreChanceForDepth(y);
        doc.dugTiles.push({ x: x, y: y, oreTier: hasOre ? pickOreTier(y) : null, isHeavyStone: false, status: "scouted" });
      }
      changed = true;
    }
  }
  return changed;
}

xenCasinoMineStateSchema.statics.getState = async function (userId) {
  var doc = await this.findOneAndUpdate({ userId: userId }, {}, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
  var today = todayKey();
  var dirty = false;
  if (doc.digsDate !== today) {
    doc.digsDate = today;
    doc.digsToday = 0;
    dirty = true;
  }
  if (doc.ladderGrantDate !== today) {
    doc.ladderGrantDate = today;
    doc.ladderCount += 1; // one free ladder per day, on first read
    dirty = true;
  }
  if (dirty) {
    await doc.save();
  }
  return doc;
};

// Re-validates quota/ladder/stone availability itself against a fresh read (rather than
// trusting an earlier GET), rolls the outcome, and persists the result - all in one call
// so a dig is never left half-applied. `dailyDigCap` is route-owned economics and passed
// in; ore/cave-in/stone chance are computed here from depth.
//
// Moving into an already-`mined` tile is always free (no dig spent, nothing rolled) -
// this is the only path "up" ever takes, since you can never dig upward (the tile above
// was necessarily already mined to get here). Anything else targeting a new/undug tile
// is a real dig: heavy stone is resolved first (a pure obstacle, no ore/cave-in possible
// on it), then - if not stone - the cave-in roll (blockable once by a Reinforcement,
// which stays armed through any number of safe digs and is only consumed on an actual
// hit, same shield semantics as Garden's pesticide/fungicide), then the gem tier. A
// single-use Explosive is a universal blocker-buster: if the daily cap, a missing
// ladder, and/or heavy stone are in the way (any combination), one Explosive clears all
// of them at once for this one dig. If the target tile was already `scouted` (via a
// Flare), its cached ground truth is reused instead of rolling again. Returns the same,
// already-saved `doc` the route needs to build its response, so callers don't have to
// re-fetch just to see the result - this static only resolves the one tile being moved
// into or dug.
xenCasinoMineStateSchema.statics.applyDig = async function (userId, params) {
  var doc = await this.getState(userId);
  var targetX = doc.positionX + (params.direction === "left" ? -1 : params.direction === "right" ? 1 : 0);
  var targetY = doc.positionY + (params.direction === "down" ? 1 : params.direction === "up" ? -1 : 0);
  if (targetY < 0) {
    return { error: "invalid_direction" };
  }
  var existing = doc.dugTiles.find(function (t) { return t.x === targetX && t.y === targetY; });

  if (existing && existing.status === "mined") {
    doc.positionX = targetX;
    doc.positionY = targetY;
    await doc.save();
    return { outcome: MINE_OUTCOME.MOVE, oreTier: null, position: { x: targetX, y: targetY }, digsToday: doc.digsToday, targetY: targetY, usedExplosive: false, doc: doc };
  }
  if (params.direction === "up") {
    return { error: "no_tunnel" };
  }

  // A past cave-in leaves permanent rubble - unlike heavy stone/the dig cap/a missing
  // ladder, no Explosive (or anything else) ever clears it. It's a dead end for good; the
  // only way past is around it.
  var isCollapsed = !!existing && existing.status === "collapsed";
  if (isCollapsed) {
    return { error: "blocked_by_collapse" };
  }

  var isHeavyStone = existing ? existing.isHeavyStone : Math.random() < mineStoneChanceForDepth(targetY);
  var blockedByCap = doc.digsToday >= params.dailyDigCap;
  var blockedByLadder = params.direction === "down" && doc.ladderCount <= 0;
  var usedExplosive = false;
  if (blockedByCap || blockedByLadder || isHeavyStone) {
    if (doc.explosiveCount <= 0) {
      if (!existing) {
        // Cache the discovery even on a rejected attempt, same as a Flare scout would -
        // no need to re-discover this tile's stone status next time.
        doc.dugTiles.push({ x: targetX, y: targetY, oreTier: null, isHeavyStone: true, status: "blocked" });
        await doc.save();
      }
      return { error: isHeavyStone ? "blocked_by_stone" : blockedByCap ? "no_digs_remaining" : "no_ladders" };
    }
    usedExplosive = true;
  }

  doc.digsToday += 1;
  if (usedExplosive) {
    doc.explosiveCount -= 1;
  }
  if (params.direction === "down" && !usedExplosive) {
    doc.ladderCount -= 1;
  }

  var outcome;
  var resolvedOreTier = null;
  if (isHeavyStone) {
    // A pure obstacle - clearing it always just opens the passage through, never rolls
    // ore or a cave-in.
    outcome = MINE_OUTCOME.STONE_CLEARED;
    if (existing) {
      existing.status = "mined";
      existing.isHeavyStone = false;
    } else {
      doc.dugTiles.push({ x: targetX, y: targetY, oreTier: null, isHeavyStone: false, status: "mined" });
    }
    doc.positionX = targetX;
    doc.positionY = targetY;
  } else {
    var caveIn = Math.random() < mineCaveInChanceForDepth(targetY);
    if (caveIn && doc.reinforcementCount > 0) {
      doc.reinforcementCount -= 1;
      caveIn = false;
    }
    if (caveIn) {
      outcome = MINE_OUTCOME.CAVE_IN;
      doc.digsToday = params.dailyDigCap; // a collapse locks out the rest of today's digs
      if (existing) {
        existing.status = "collapsed";
      } else {
        doc.dugTiles.push({ x: targetX, y: targetY, oreTier: null, isHeavyStone: false, status: "collapsed" });
      }
    } else {
      resolvedOreTier = existing && existing.status === "scouted" ? existing.oreTier : (Math.random() < mineOreChanceForDepth(targetY) ? pickOreTier(targetY) : null);
      outcome = resolvedOreTier ? MINE_OUTCOME.ORE : MINE_OUTCOME.EMPTY;
      if (existing) {
        existing.status = "mined";
        existing.oreTier = resolvedOreTier;
      } else {
        doc.dugTiles.push({ x: targetX, y: targetY, oreTier: resolvedOreTier, isHeavyStone: false, status: "mined" });
      }
      doc.positionX = targetX;
      doc.positionY = targetY;
      if (resolvedOreTier && tierRank(resolvedOreTier) > tierRank(doc.bestGemTier)) {
        doc.bestGemTier = resolvedOreTier;
      }
    }
  }

  if (doc.positionY > doc.deepestDepthReached) {
    doc.deepestDepthReached = doc.positionY;
  }

  await doc.save();
  return {
    outcome: outcome,
    oreTier: resolvedOreTier,
    position: { x: doc.positionX, y: doc.positionY },
    digsToday: doc.digsToday,
    targetY: targetY,
    usedExplosive: usedExplosive,
    doc: doc,
  };
};

xenCasinoMineStateSchema.statics.addEquipment = async function (userId, item, amount) {
  var doc = await this.getState(userId);
  if (item === "ladder") {
    doc.ladderCount += amount;
  } else if (item === "explosive") {
    doc.explosiveCount += amount;
  } else if (item === "reinforcement") {
    doc.reinforcementCount += amount;
  }
  await doc.save();
  return doc;
};

// A Flare is bought and burned in the same action - the only way to preview a tile (its
// gem tier, or whether it's heavy stone) before committing to dig it, now that there's
// no passive/automatic scouting. `flareRadius` is route-owned economics, passed in.
xenCasinoMineStateSchema.statics.useFlare = async function (userId, flareRadius) {
  var doc = await this.getState(userId);
  scoutTilesInRadius(doc, flareRadius);
  await doc.save();
  return doc;
};

// Wipes the whole dug map and returns to the shaft entrance - equipment inventory and
// today's dig count are untouched, only the physical layout/position resets. The route
// charges a flat cheddar fee for this before calling it.
xenCasinoMineStateSchema.statics.resetMap = async function (userId) {
  var doc = await this.getState(userId);
  doc.dugTiles = [];
  doc.positionX = 0;
  doc.positionY = 0;
  await doc.save();
  return doc;
};

var XenCasinoMineState = mongoose.model("XenCasinoMineState", xenCasinoMineStateSchema);

// ---------------------------------------------------------------------------------------
// Cheddar Ranch - creature-collection game. Hatching is a gacha-style weighted rarity pull
// (RANCH_RARITY_TIERS, route-owned economics in casinoRanch.ts); each creature is its own
// document in its own collection (a growing, unbounded-per-user roster, unlike Garden's
// fixed 3x3 grid or Mine's singleton position) since feeding/racing/releasing all act on
// one creature at a time and need independent per-creature lifecycle (feed cooldown, win/
// loss record). Feeding is guarded by the same "re-validate against a fresh read" pattern
// as Garden's water()/Mine's applyDig() - never trust an earlier GET.
// ---------------------------------------------------------------------------------------

var xenCasinoRanchCreatureSchema = new mongoose.Schema({
    userId: { type: String, required: true, index: true },
    species: { type: String, required: true }, // cosmetic flavor + the key into route-owned SPECIES_TYPE/SPECIES_ITEM_KEY
    name: { type: String, required: true }, // rolled from CREATURE_NAMES at hatch time
    nickname: { type: String, required: true }, // rolled from CREATURE_NICKNAMES at hatch time, shown alongside name
    rarityTier: { type: String, required: true }, // key into RANCH_RARITY_TIERS (route-owned)
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
    // Ticks of neglect decay already applied since the current no-feeding period started
    // (see resolveRanchDecay in casinoRanch.ts) - reset whenever lastFedAt moves forward.
    // Same "catch up correctly across any gap, no cron" shape as Garden's decayTicksApplied,
    // anchored on lastFedAt (falling back to createdAt when never fed) rather than a
    // separate timestamp field.
    decayTicksApplied: { type: Number, default: 0 },
    // Gates the 24h item-production cooldown (see statics.collect) - null means never
    // collected, always immediately available, same convention as lastFedAt/lastWateredAt.
    lastCollectedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
});
xenCasinoRanchCreatureSchema.index({ userId: 1, createdAt: 1 });

xenCasinoRanchCreatureSchema.statics.createForUser = async function (userId, params) {
    return this.create({
        userId: userId,
        species: params.species,
        name: params.name,
        nickname: params.nickname,
        rarityTier: params.rarityTier,
        stats: params.stats,
    });
};

xenCasinoRanchCreatureSchema.statics.listByUser = async function (userId) {
    return this.find({ userId: userId }).sort({ createdAt: 1 }).exec();
};

xenCasinoRanchCreatureSchema.statics.getOwned = async function (userId, creatureId) {
    return this.findOne({ _id: creatureId, userId: userId }).exec();
};

// Re-reads fresh and rejects (returns null) if the creature isn't owned by userId or is
// still on cooldown, rather than trusting an earlier GET - same guard Garden's water() and
// Mine's applyDig() use. No stat ceiling - `gains` is an already-rolled { statKey: amount }
// object (one Feed item now bumps every stat at once, see casinoRanch.ts), applied as a
// single atomic $inc across every key it contains, guarded on the previously-read
// lastFedAt so a concurrent feed on the same creature can't double-apply.
xenCasinoRanchCreatureSchema.statics.feed = async function (userId, creatureId, gains, cooldownMs) {
    var creature = await this.findOne({ _id: creatureId, userId: userId }).exec();
    if (!creature) {
        return null;
    }
    var now = new Date();
    if (creature.lastFedAt && now.getTime() - creature.lastFedAt.getTime() < cooldownMs) {
        return null;
    }
    var inc = { feedCount: 1 };
    Object.keys(gains).forEach(function (statKey) {
        inc["stats." + statKey] = gains[statKey];
    });
    var updated = await this.findOneAndUpdate(
        { _id: creatureId, userId: userId, lastFedAt: creature.lastFedAt },
        // decayTicksApplied resets here because lastFedAt (the neglect anchor) is moving
        // forward - same "watering restarts the neglect clock" reset Garden's water() does
        // to its own decayTicksApplied, otherwise a stale tick count from before this feed
        // would wrongly suppress decay that's genuinely due again later.
        { $inc: inc, $set: { lastFedAt: now, decayTicksApplied: 0 } },
        { new: true }
    ).exec();
    return updated;
};

// Atomic $inc of raceWins/raceLosses - called only after the route has already resolved
// the win/loss roll (and, on a win, after the payout transfer succeeds).
xenCasinoRanchCreatureSchema.statics.recordRaceResult = async function (userId, creatureId, won) {
    return this.findOneAndUpdate(
        { _id: creatureId, userId: userId },
        won ? { $inc: { raceWins: 1 } } : { $inc: { raceLosses: 1 } },
        { new: true }
    ).exec();
};

// Same re-read-and-guard shape as statics.feed - re-validates ownership and the 24h
// cooldown against a fresh read, then atomically stamps lastCollectedAt via
// findOneAndUpdate guarded on the previously-read value so a concurrent collect on the
// same creature can't double-apply.
xenCasinoRanchCreatureSchema.statics.collect = async function (userId, creatureId, cooldownMs) {
    var creature = await this.findOne({ _id: creatureId, userId: userId }).exec();
    if (!creature) {
        return null;
    }
    var now = new Date();
    if (creature.lastCollectedAt && now.getTime() - creature.lastCollectedAt.getTime() < cooldownMs) {
        return null;
    }
    var updated = await this.findOneAndUpdate(
        { _id: creatureId, userId: userId, lastCollectedAt: creature.lastCollectedAt },
        { $set: { lastCollectedAt: now } },
        { new: true }
    ).exec();
    return updated;
};

// Deletes only if still owned by userId - the route charges/credits the cheddar sell
// value before calling this, same "resolve money first" order as Garden's
// clearHarvestedSquare.
xenCasinoRanchCreatureSchema.statics.releaseOwned = async function (userId, creatureId) {
    return this.findOneAndDelete({ _id: creatureId, userId: userId }).exec();
};

var XenCasinoRanchCreature = mongoose.model("XenCasinoRanchCreature", xenCasinoRanchCreatureSchema);

// A per-user fungible item stack (itemKey -> quantity) produced by creatures via
// statics.collect above - one singleton doc per user, same shape as Garden/Mine's
// per-user state, rather than one document per item unit, since items of the same key are
// interchangeable (their "power" is expressed as how many units a collection yields, via
// the source creature's level, not as per-unit potency - see casinoRanch.ts).
var xenCasinoRanchInventorySchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    items: { type: Map, of: Number, default: {} },
});

xenCasinoRanchInventorySchema.statics.getState = async function (userId) {
    return this.findOneAndUpdate({ userId: userId }, {}, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
};

xenCasinoRanchInventorySchema.statics.addItem = async function (userId, itemKey, amount) {
    return this.findOneAndUpdate(
        { userId: userId },
        { $inc: { ["items." + itemKey]: amount } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).exec();
};

// Guarded decrement - only applies if at least `amount` is still present at update time,
// so a sell/use action can never drive a stack negative even under a concurrent request.
// Returns null (rather than throwing) if the guard doesn't match, same "treat null as
// nothing to reconcile" convention as XenCasinoRound.applyConditionsUpdate.
xenCasinoRanchInventorySchema.statics.subtractItem = async function (userId, itemKey, amount) {
    return this.findOneAndUpdate(
        { userId: userId, ["items." + itemKey]: { $gte: amount } },
        { $inc: { ["items." + itemKey]: -amount } },
        { new: true }
    ).exec();
};

var XenCasinoRanchInventory = mongoose.model("XenCasinoRanchInventory", xenCasinoRanchInventorySchema);

// Cheddar Ranch's "prepare a race, then bet on it" primitive - one pending race at a time
// per user, same one-thing-in-progress shape as XenCasinoPrinterState's `run`, deliberately
// NOT XenCasinoRound: every XenCasinoRound consumer debits the wager the instant a round is
// created (that's the whole point of its recovery-sweep machinery), but that's actually a
// closer fit here than it first looks - Cheddar Ranch's race attempt now costs a real,
// non-refundable-on-abandonment entry fee at the moment it starts (see /race/start in
// casinoRanch.ts). So unlike a truly free "nothing's at stake yet" prepare step, starting a
// second attempt while one is already in flight must be refused, not silently discarded -
// same "refuse a second start" semantics as Printer's startRun, via statics.startIfClear.
// `pending` holds { creatureId, racers, stage, course, odds, createdAt, expiresAt } -
// `stage` ("awaiting-course" | "awaiting-bet") tracks how far the 3-step start -> spin
// course -> bet flow has gotten; `course`/`odds` are null until the course-spin step fills
// them in. The exact field/course/odds the player is shown is always what a later bet
// resolves against, never anything re-rolled or client-supplied.
var xenCasinoRanchPendingRaceSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    pending: { type: Object, default: null },
});

xenCasinoRanchPendingRaceSchema.statics.getState = async function (userId) {
    return this.findOneAndUpdate({ userId: userId }, {}, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
};

function pendingRaceIsLive(pending) {
    return !!pending && new Date(pending.expiresAt).getTime() >= Date.now();
}

// Only starts if there's no live (unexpired) pending race already - unlike the old
// unconditional startPending, a real entry fee is charged before this is called, so a
// second start while one is already in flight must be refused (the route checks this
// BEFORE charging) rather than silently discarding a race the player already paid for.
xenCasinoRanchPendingRaceSchema.statics.startIfClear = async function (userId, pending) {
    var doc = await this.getState(userId);
    if (pendingRaceIsLive(doc.pending)) {
        return null;
    }
    doc.pending = pending;
    doc.markModified("pending");
    await doc.save();
    return doc.pending;
};

// Advances an in-flight race from "awaiting-course" to "awaiting-bet" - guarded on the
// pending race still matching this exact creature and still being at the expected stage,
// so a stale/duplicate course-spin request can't double-advance or clobber a race that's
// already moved on. Refreshes expiresAt so the player gets a fresh window for the next step
// rather than a deadline that started ticking back at step 1.
xenCasinoRanchPendingRaceSchema.statics.advanceToCourse = async function (userId, creatureId, course, odds, expiresAt) {
    var doc = await this.getState(userId);
    if (
        !doc.pending ||
        doc.pending.creatureId !== creatureId ||
        doc.pending.stage !== "awaiting-course" ||
        !pendingRaceIsLive(doc.pending)
    ) {
        return null;
    }
    doc.pending.stage = "awaiting-bet";
    doc.pending.course = course;
    doc.pending.odds = odds;
    doc.pending.expiresAt = expiresAt;
    doc.markModified("pending");
    await doc.save();
    return doc.pending;
};

// Clears unconditionally - called once a bet has resolved (win or lose), same "the caller
// has already decided this is done" shape as Printer's clearRun.
xenCasinoRanchPendingRaceSchema.statics.clearPending = async function (userId) {
    var doc = await this.findOne({ userId: userId }).exec();
    if (!doc) {
        return null;
    }
    doc.pending = null;
    await doc.save();
    return doc;
};

var XenCasinoRanchPendingRace = mongoose.model("XenCasinoRanchPendingRace", xenCasinoRanchPendingRaceSchema);

module.exports = {
  XenCasino,
  XenCasinoRound,
  XenCasinoUserState,
  XenCasinoActivity,
  XenCasinoGardenState,
  // Exported so casinoGarden.ts can build SEED_TIERS' growDurationMs from waterAmount
  // and render the same cooldown it's actually enforcing, rather than a second copy.
  GARDEN_WATER_COOLDOWN_MS: GARDEN_WATER_COOLDOWN_MS,
  GARDEN_NEGLECT_GRACE_MS: GARDEN_NEGLECT_GRACE_MS,
  // Exported so casinoGarden.ts can render/pre-check the same per-square cooldown
  // (shorter once bonemeal is applied) it's actually enforcing, rather than a second copy.
  effectiveWaterCooldownMs: effectiveWaterCooldownMs,
  XenCasinoPrinterState,
  XenCasinoMineState,
  MINE_OUTCOME: MINE_OUTCOME,
  // Exported so casinoMine.ts can build its own $-value-per-tier table and render tier
  // labels/unlock depths, without duplicating the minDepth/weight gating logic here.
  MINE_ORE_TIERS: MINE_ORE_TIERS,
  // Exported so casinoPrinter.ts can render the same raid-risk percentage it's actually
  // being rolled against, rather than approximating it with a second copy of the formula.
  PRINTER_RISK_RAMP_MS: PRINTER_RISK_RAMP_MS,
  PRINTER_BASE_RAID_CHANCE: PRINTER_BASE_RAID_CHANCE,
  PRINTER_MAX_RAID_CHANCE: PRINTER_MAX_RAID_CHANCE,
  XenCasinoRanchCreature,
  XenCasinoRanchInventory,
  XenCasinoRanchPendingRace,
  dailyQuestDateKey: todayKey,
  // Exported for unit testing the lazy-reset-on-date-change logic without a live Mongo
  // connection - pure functions over plain objects, no I/O.
  dailyQuestStatus: dailyQuestStatus,
  DAILY_QUEST_TARGET: DAILY_QUEST_TARGET,
};
