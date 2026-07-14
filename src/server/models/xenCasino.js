var mongoose = require("mongoose");

// Persisted state shared by every XenCasino game - one singleton document,
// not a model per game. Games call the statics below rather than touching
// the schema directly.

var JACKPOT_SEED = 100;
var MAX_RECENT_CRASHES = 20;

var crashRoundSchema = new mongoose.Schema(
  {
    crashPoint: { type: Number, required: true },
    endedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

var xenCasinoSchema = new mongoose.Schema({
  _id: { type: String, default: "singleton" },
  slotsJackpotPool: { type: Number, default: JACKPOT_SEED },
  crashRecentRounds: [crashRoundSchema],
});

xenCasinoSchema.statics.getSingleton = async function () {
  var existing = await this.findById("singleton").exec();
  if (existing) {
    return existing;
  }
  return this.create({ _id: "singleton" });
};

xenCasinoSchema.statics.recordCrashRound = async function (crashPoint) {
  await this.findByIdAndUpdate(
    "singleton",
    {
      $push: {
        crashRecentRounds: {
          $each: [{ crashPoint: crashPoint, endedAt: new Date() }],
          $slice: -MAX_RECENT_CRASHES,
        },
      },
    },
    { upsert: true, setDefaultsOnInsert: true }
  ).exec();
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
module.exports = { XenCasino, JACKPOT_SEED };
