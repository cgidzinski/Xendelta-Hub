var mongoose = require("mongoose");

// Persisted state shared by every XenCasino game - one singleton document,
// not a model per game. Games call the statics below rather than touching
// the schema directly.

var JACKPOT_SEED = 100;

var xenCasinoSchema = new mongoose.Schema({
  _id: { type: String, default: "singleton" },
  slotsJackpotPool: { type: Number, default: JACKPOT_SEED },
});

xenCasinoSchema.statics.getSingleton = async function () {
  var existing = await this.findById("singleton").exec();
  if (existing) {
    return existing;
  }
  return this.create({ _id: "singleton" });
};

// Atomic - safe under concurrent spins.
xenCasinoSchema.statics.incrementJackpotPool = async function (amount) {
  var doc = await this.findByIdAndUpdate(
    "singleton",
    { $inc: { slotsJackpotPool: amount } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).exec();
  return doc.slotsJackpotPool;
};

xenCasinoSchema.statics.resetJackpotPool = async function () {
  var doc = await this.findByIdAndUpdate(
    "singleton",
    { $set: { slotsJackpotPool: JACKPOT_SEED } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).exec();
  return doc.slotsJackpotPool;
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
});
xenCasinoRoundSchema.index({ game: 1, userId: 1 }, { unique: true }); // one active round per user per game

xenCasinoRoundSchema.statics.startRound = async function (params) {
  return this.create({
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

// Scoped to one game on purpose - "stale" means something different per game (a game that
// forfeits on abandonment vs. one like Slots/Scratch where the outcome was already decided
// and may still owe a payout, which only that game's own recovery logic knows how to
// replay). A blanket cross-game sweep would risk deleting an unsettled winning round
// before it's paid.
xenCasinoRoundSchema.statics.sweepStale = async function (game, ttlMs) {
  return this.find({ game: game, startedAt: { $lt: new Date(Date.now() - ttlMs) } }).exec();
};

var XenCasinoRound = mongoose.model("XenCasinoRound", xenCasinoRoundSchema);

module.exports = { XenCasino, XenCasinoRound, JACKPOT_SEED };
