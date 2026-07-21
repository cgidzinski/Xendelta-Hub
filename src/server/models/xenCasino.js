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
var xenCasinoSchema = new mongoose.Schema({
  _id: { type: String, default: "singleton" },
  slotsJackpotPools: { type: Map, of: Number, default: {} },
  pachinkoJackpotPool: { type: Number, default: 0 },
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

module.exports = {
  XenCasino,
  XenCasinoRound,
  XenCasinoUserState,
  dailyQuestDateKey: todayKey,
  // Exported for unit testing the lazy-reset-on-date-change logic without a live Mongo
  // connection - pure functions over plain objects, no I/O.
  dailyQuestStatus: dailyQuestStatus,
  DAILY_QUEST_TARGET: DAILY_QUEST_TARGET,
};
