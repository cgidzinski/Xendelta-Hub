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
// growing. This model only owns square lifecycle (empty -> growing -> ready/dead) and the
// watering-deadline + vermin/disease tick loop over whatever values got snapshotted.
// ---------------------------------------------------------------------------------------

var GARDEN_GRID_SIZE = 9;
// Uniform across every seed - minimum time between two waterings of the *same* square.
// Also doubles as the hazard-tick period (vermin/disease chance still varies by seed;
// only the cadence they're rolled at is now fixed) and the neglect-death threshold
// (2 missed cooldowns in a row kills the square).
var GARDEN_WATER_COOLDOWN_MS = 60 * 60 * 1000;

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
    // Snapshotted from the seed tier at plant time (see casinoGarden.ts SEED_TIERS) -
    // this square's own copy, immune to later tier rebalances.
    cost: { type: Number, default: 0 },
    waterAmount: { type: Number, default: 0 }, // total waterings required to mature - a vermin hit raises this
    waterCount: { type: Number, default: 0 }, // waterings delivered so far
    verminChance: { type: Number, default: 0 }, // per tick, while unprotected - adds +1 to waterAmount
    diseaseChance: { type: Number, default: 0 }, // per tick, while unprotected - kills outright
    baseMultiplier: { type: Number, default: 0 }, // harvest payout = cost * baseMultiplier * (1 +/- variance)
    variance: { type: Number, default: 0 },
    protection: {
      pesticide: { type: Boolean, default: false }, // blocks vermin for the rest of this square's grow cycle
      fungicide: { type: Boolean, default: false }, // blocks disease for the rest of this square's grow cycle
    },
    status: { type: String, enum: ["empty", "growing", "ready", "dead"], default: "empty" },
  },
  { _id: false }
);

var xenCasinoGardenStateSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  squares: { type: [gardenSquareSchema], default: emptyGardenSquares },
});

// Advances one growing square against `now`: kills it if 2 full GARDEN_WATER_COOLDOWN_MS
// periods passed with no watering, then rolls vermin/disease once per completed
// GARDEN_WATER_COOLDOWN_MS tick since planting (or the last roll) - catching up
// correctly across any gap, same pattern as resolveStillBatch below. A vermin hit raises
// `waterAmount` by 1 (needs one more watering to mature); disease kills. Flips growing ->
// ready once `waterCount` reaches `waterAmount`. No-op for any square not currently
// growing. Mutates in place; returns whether anything changed.
function resolveGardenSquare(square, now) {
  if (square.status !== "growing") {
    return false;
  }
  var changed = false;

  if (now.getTime() - square.lastWateredAt.getTime() >= GARDEN_WATER_COOLDOWN_MS * 2) {
    square.status = "dead";
    return true;
  }

  var tick = new Date((square.lastCareCheckAt || square.plantedAt).getTime());
  while (now.getTime() - tick.getTime() >= GARDEN_WATER_COOLDOWN_MS) {
    tick = new Date(tick.getTime() + GARDEN_WATER_COOLDOWN_MS);
    changed = true;
    if (!square.protection.fungicide && Math.random() < square.diseaseChance) {
      square.status = "dead";
      square.lastCareCheckAt = tick;
      return true;
    }
    if (!square.protection.pesticide && Math.random() < square.verminChance) {
      square.waterAmount += 1;
    }
  }
  if (changed) {
    square.lastCareCheckAt = tick;
  }

  if (square.waterCount >= square.waterAmount) {
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
  square.cost = 0;
  square.waterAmount = 0;
  square.waterCount = 0;
  square.verminChance = 0;
  square.diseaseChance = 0;
  square.baseMultiplier = 0;
  square.variance = 0;
  square.protection = { pesticide: false, fungicide: false };
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
  square.lastWateredAt = now;
  square.lastCareCheckAt = now;
  square.cost = tier.cost;
  square.waterAmount = tier.waterAmount;
  square.waterCount = 1; // planting counts as the first watering
  square.verminChance = tier.verminChance;
  square.diseaseChance = tier.diseaseChance;
  square.baseMultiplier = tier.baseMultiplier;
  square.variance = tier.variance;
  square.protection = { pesticide: false, fungicide: false };
  square.status = square.waterCount >= square.waterAmount ? "ready" : "growing";
  await doc.save();
  return square;
};

// The one place the 1h-per-square cooldown is enforced - rejects (returns null) if this
// square was already watered within the last GARDEN_WATER_COOLDOWN_MS, so the route can
// respond with a clear "still on cooldown" 400 rather than silently no-op'ing.
xenCasinoGardenStateSchema.statics.water = async function (userId, squareId) {
  var doc = await this.getState(userId);
  var square = doc.squares.find(function (s) { return s.squareId === squareId; });
  if (!square || square.status !== "growing") {
    return null;
  }
  var now = new Date();
  if (now.getTime() - square.lastWateredAt.getTime() < GARDEN_WATER_COOLDOWN_MS) {
    return null;
  }
  square.lastWateredAt = now;
  square.waterCount += 1;
  if (square.waterCount >= square.waterAmount) {
    square.status = "ready";
  }
  await doc.save();
  return square;
};

xenCasinoGardenStateSchema.statics.protect = async function (userId, squareId, item) {
  var doc = await this.getState(userId);
  var square = doc.squares.find(function (s) { return s.squareId === squareId; });
  if (!square || square.status !== "growing") {
    return null;
  }
  square.protection[item] = true;
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
// Bootleg Still - one batch at a time. Payout multiplier and raid risk are both derived
// from elapsed time (computed on read), never stored as a "current value" - only the
// timestamps needed to derive them are persisted. Ingredient price / peak duration /
// bribe cost / payout multiplier ceiling are all route-owned economics, passed in.
// ---------------------------------------------------------------------------------------

var STILL_ROLL_INTERVAL_MS = 5 * 60 * 1000; // how often a raid chance is rolled while a batch runs
var STILL_RISK_RAMP_MS = 2 * 60 * 60 * 1000; // time since last bribe for the per-roll raid chance to reach its ceiling
var STILL_MAX_RAID_CHANCE = 0.35; // per-roll ceiling - rising risk, never a certainty

function stillRaidChance(now, batch) {
  var since = now.getTime() - new Date(batch.lastBribeAt || batch.startedAt).getTime();
  return Math.min(STILL_MAX_RAID_CHANCE, (since / STILL_RISK_RAMP_MS) * STILL_MAX_RAID_CHANCE);
}

// Rolls one raid check per completed STILL_ROLL_INTERVAL_MS tick since the batch started
// (or was last rolled) - catches up correctly across gaps of any length between reads, no
// cron needed. Stops at the first hit. Mutates `batch` in place; returns whether it changed.
function resolveStillBatch(batch, now) {
  if (!batch || batch.raidedAt) {
    return false;
  }
  var lastRoll = new Date(batch.lastRiskRollAt || batch.startedAt);
  var initial = lastRoll.getTime();
  while (now.getTime() - lastRoll.getTime() >= STILL_ROLL_INTERVAL_MS) {
    lastRoll = new Date(lastRoll.getTime() + STILL_ROLL_INTERVAL_MS);
    if (Math.random() < stillRaidChance(lastRoll, batch)) {
      batch.raidedAt = lastRoll;
      break;
    }
  }
  var changed = batch.raidedAt || lastRoll.getTime() !== initial;
  if (changed) {
    batch.lastRiskRollAt = lastRoll;
  }
  return !!changed;
}

var xenCasinoStillStateSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  stillLevel: { type: Number, default: 1 },
  // { startedAt, ingredientCost, peakAt, lastBribeAt, lastRiskRollAt, raidedAt } | null -
  // Mixed/Object rather than a fixed sub-schema since it's null whenever no batch is running.
  batch: { type: Object, default: null },
});

xenCasinoStillStateSchema.statics.getState = async function (userId) {
  var doc = await this.findOneAndUpdate({ userId: userId }, {}, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
  if (doc.batch && resolveStillBatch(doc.batch, new Date())) {
    doc.markModified("batch");
    await doc.save();
  }
  return doc;
};

xenCasinoStillStateSchema.statics.startBatch = async function (userId, ingredientCost, peakDurationMs) {
  var doc = await this.getState(userId);
  if (doc.batch) {
    return null;
  }
  var now = new Date();
  doc.batch = {
    startedAt: now,
    ingredientCost: ingredientCost,
    peakAt: new Date(now.getTime() + peakDurationMs),
    lastBribeAt: now,
    lastRiskRollAt: now,
    raidedAt: null,
  };
  doc.markModified("batch");
  await doc.save();
  return doc.batch;
};

xenCasinoStillStateSchema.statics.bribe = async function (userId) {
  var doc = await this.getState(userId);
  if (!doc.batch || doc.batch.raidedAt) {
    return null;
  }
  doc.batch.lastBribeAt = new Date();
  doc.markModified("batch");
  await doc.save();
  return doc.batch;
};

// Called after a successful collect payout (or to dismiss a raided batch, which pays
// nothing) - clears unconditionally since by this point the caller has already decided
// the batch is done being acted on.
xenCasinoStillStateSchema.statics.clearBatch = async function (userId) {
  var doc = await this.findOne({ userId: userId }).exec();
  if (!doc) {
    return null;
  }
  doc.batch = null;
  await doc.save();
  return doc;
};

xenCasinoStillStateSchema.statics.upgrade = async function (userId, maxLevel) {
  var doc = await this.getState(userId);
  if (doc.stillLevel >= maxLevel) {
    return null;
  }
  doc.stillLevel += 1;
  await doc.save();
  return doc.stillLevel;
};

var XenCasinoStillState = mongoose.model("XenCasinoStillState", xenCasinoStillStateSchema);

// ---------------------------------------------------------------------------------------
// Chip Mine - a dark, side-view shaft the player actively digs into. Down digs consume a
// ladder and enter a higher risk band; sideways digs don't. Ore value / cave-in odds by
// depth, and equipment prices, are route-owned economics passed into applyDig.
// ---------------------------------------------------------------------------------------

var MINE_OUTCOME = { ORE: "ore", EMPTY: "empty", CAVE_IN: "cave_in" };

var mineTileSchema = new mongoose.Schema(
  { x: { type: Number, required: true }, y: { type: Number, required: true }, hasOre: Boolean, mined: Boolean },
  { _id: false }
);

var xenCasinoMineStateSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  positionX: { type: Number, default: 0 },
  positionY: { type: Number, default: 0 }, // depth - increases downward from the shaft entrance at 0
  dugTiles: { type: [mineTileSchema], default: [] },
  digsToday: { type: Number, default: 0 },
  digsDate: { type: String, default: null }, // "YYYY-MM-DD" (UTC) digsToday applies to, lazy-reset like the daily quest
  ladderCount: { type: Number, default: 3 }, // a few free starter ladders
  torchFuel: { type: Number, default: 20 },
  pickaxeLevel: { type: Number, default: 1 }, // raises the daily dig cap
  torchLevel: { type: Number, default: 1 }, // raises base visibility radius
});

xenCasinoMineStateSchema.statics.getState = async function (userId) {
  var doc = await this.findOneAndUpdate({ userId: userId }, {}, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
  var today = todayKey();
  if (doc.digsDate !== today) {
    doc.digsDate = today;
    doc.digsToday = 0;
    await doc.save();
  }
  return doc;
};

// Re-validates quota/ladder availability itself against a fresh read (rather than
// trusting an earlier GET), rolls the outcome, and persists the result - all in one call
// so a dig is never left half-applied. `dailyDigCap`, `oreChance`, and `caveInChance` are
// computed by the route from the target tile's depth/direction before calling this.
xenCasinoMineStateSchema.statics.applyDig = async function (userId, params) {
  var doc = await this.getState(userId);
  if (doc.digsToday >= params.dailyDigCap) {
    return { error: "no_digs_remaining" };
  }
  if (params.direction === "down" && doc.ladderCount <= 0) {
    return { error: "no_ladders" };
  }

  var targetX = doc.positionX + (params.direction === "left" ? -1 : params.direction === "right" ? 1 : 0);
  var targetY = doc.positionY + (params.direction === "down" ? 1 : 0);

  doc.digsToday += 1;
  if (params.direction === "down") {
    doc.ladderCount -= 1;
  }
  if (doc.torchFuel > 0) {
    doc.torchFuel -= 1;
  }

  var roll = Math.random();
  var outcome;
  if (roll < params.caveInChance) {
    outcome = MINE_OUTCOME.CAVE_IN;
    doc.digsToday = params.dailyDigCap; // a collapse locks out the rest of today's digs
  } else {
    if (roll < params.caveInChance + params.oreChance) {
      outcome = MINE_OUTCOME.ORE;
    } else {
      outcome = MINE_OUTCOME.EMPTY;
    }
    doc.positionX = targetX;
    doc.positionY = targetY;
  }

  var existing = doc.dugTiles.find(function (t) { return t.x === targetX && t.y === targetY; });
  if (!existing) {
    doc.dugTiles.push({ x: targetX, y: targetY, hasOre: outcome === MINE_OUTCOME.ORE, mined: outcome !== MINE_OUTCOME.CAVE_IN });
  }

  await doc.save();
  return { outcome: outcome, position: { x: doc.positionX, y: doc.positionY }, digsToday: doc.digsToday, targetY: targetY };
};

xenCasinoMineStateSchema.statics.addEquipment = async function (userId, item, amount) {
  var doc = await this.getState(userId);
  if (item === "ladder") {
    doc.ladderCount += amount;
  } else if (item === "torch") {
    doc.torchFuel += amount;
  }
  await doc.save();
  return doc;
};

xenCasinoMineStateSchema.statics.upgrade = async function (userId, upgrade, maxLevel) {
  var doc = await this.getState(userId);
  var field = upgrade === "pickaxe" ? "pickaxeLevel" : "torchLevel";
  if (doc[field] >= maxLevel) {
    return null;
  }
  doc[field] += 1;
  await doc.save();
  return doc[field];
};

var XenCasinoMineState = mongoose.model("XenCasinoMineState", xenCasinoMineStateSchema);

module.exports = {
  XenCasino,
  XenCasinoRound,
  XenCasinoUserState,
  XenCasinoActivity,
  XenCasinoGardenState,
  // Exported so casinoGarden.ts can build SEED_TIERS' growDurationMs from waterAmount
  // and render the same cooldown it's actually enforcing, rather than a second copy.
  GARDEN_WATER_COOLDOWN_MS: GARDEN_WATER_COOLDOWN_MS,
  XenCasinoStillState,
  XenCasinoMineState,
  MINE_OUTCOME: MINE_OUTCOME,
  // Exported so casinoStill.ts can render the same raid-risk percentage it's actually
  // being rolled against, rather than approximating it with a second copy of the formula.
  STILL_RISK_RAMP_MS: STILL_RISK_RAMP_MS,
  STILL_MAX_RAID_CHANCE: STILL_MAX_RAID_CHANCE,
  dailyQuestDateKey: todayKey,
  // Exported for unit testing the lazy-reset-on-date-change logic without a live Mongo
  // connection - pure functions over plain objects, no I/O.
  dailyQuestStatus: dailyQuestStatus,
  DAILY_QUEST_TARGET: DAILY_QUEST_TARGET,
};
