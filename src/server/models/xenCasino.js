var mongoose = require("mongoose");

// Timezone for daily resets (quests, mine digs, etc.) — midnight in this IANA timezone.
// Change to your local timezone. Also mirrored in src/server/constants/index.ts for reference.
var CASINO_TIMEZONE = "America/New_York";

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

var DAILY_QUEST_DEFINITIONS = [
  { key: "unique-games", target: 5, reward: 10000, label: "Play 5 different games" },
  { key: "rounds-10", target: 10, reward: 10000, label: "Play 10 rounds" },
  { key: "rounds-20", target: 20, reward: 50000, label: "Play 20 rounds" },
];

var DEFAULT_DAILY_QUESTS = DAILY_QUEST_DEFINITIONS.map(function (def) {
  return { key: def.key, date: null, progress: 0, claimed: false };
});

function todayKey() {
  // Returns "YYYY-MM-DD" in the configured CASINO_TIMEZONE (not UTC). en-CA locale
  // natively produces YYYY-MM-DD format — no manual string building needed.
  return new Intl.DateTimeFormat("en-CA", { timeZone: CASINO_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

// One doc per user for whatever per-user XenCasino state accumulates over time.
var xenCasinoUserStateSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  dailyQuests: [
    {
      key: { type: String, required: true },
      date: { type: String, default: null },
      progress: { type: Number, default: 0 },
      claimed: { type: Boolean, default: false },
    },
  ],
  gamesPlayedToday: [{ type: String }], // deduplicated list of game slugs played today
});

// Returns status for all three daily quests. Lazy-resets any quest whose stored date
// doesn't match today (UTC). `roundsPlayedToday` and `gamesPlayedToday` are derived
// from the dailyQuests array directly for rounds quests, plus gamesPlayedToday for
// the unique-games quest.
function dailyQuestsStatus(doc) {
  var today = todayKey();
  var uniqueGames = doc.gamesPlayedToday || [];

  // Find any rounds quest to get total rounds played today.
  var roundsQuest = (doc.dailyQuests || []).find(function (q) {
    return (q.key === "rounds-10" || q.key === "rounds-20") && q.date === today;
  });
  var roundsPlayedToday = roundsQuest ? roundsQuest.progress : 0;

  return DAILY_QUEST_DEFINITIONS.map(function (def) {
    var quest = (doc.dailyQuests || []).find(function (q) { return q.key === def.key && q.date === today; });
    var progress = 0;
    var claimed = false;

    if (def.key === "unique-games") {
      // Unique-games progress always comes from gamesPlayedToday length,
      // regardless of whether the quest entry is fresh.
      progress = uniqueGames.length;
      claimed = quest ? quest.claimed : false;
    } else if (quest) {
      // Rounds quests: progress from the quest's own field.
      progress = quest.progress;
      claimed = quest.claimed;
    }

    return {
      key: def.key,
      label: def.label,
      target: def.target,
      reward: def.reward,
      progress: progress,
      claimed: claimed,
      canClaim: progress >= def.target && !claimed,
    };
  });
}

// Called once per successfully settled casino round. Accepts the game slug so we can
// track which unique games the user has played today, in addition to raw round count.
xenCasinoUserStateSchema.statics.recordRoundPlayed = async function (userId, game) {
  var doc = await this.findOneAndUpdate({ userId: userId }, {}, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
  var today = todayKey();

  // Init dailyQuests if absent.
  if (!doc.dailyQuests || doc.dailyQuests.length === 0) {
    doc.dailyQuests = DEFAULT_DAILY_QUESTS.map(function (q) { return Object.assign({}, q); });
  }

  // Lazy-reset any quest whose date doesn't match today.
  for (var i = 0; i < doc.dailyQuests.length; i++) {
    if (!doc.dailyQuests[i].date || doc.dailyQuests[i].date !== today) {
      doc.dailyQuests[i].date = today;
      doc.dailyQuests[i].progress = 0;
      doc.dailyQuests[i].claimed = false;
    }
  }

  // Increment progress for rounds quests.
  for (var j = 0; j < doc.dailyQuests.length; j++) {
    if (doc.dailyQuests[j].key === "rounds-10" || doc.dailyQuests[j].key === "rounds-20") {
      doc.dailyQuests[j].progress += 1;
    }
  }

  // Track unique games.
  if (game && (!doc.gamesPlayedToday || doc.gamesPlayedToday.indexOf(game) === -1)) {
    if (!doc.gamesPlayedToday) doc.gamesPlayedToday = [];
    doc.gamesPlayedToday.push(game);
  }

  await doc.save();
  var status = dailyQuestsStatus(doc);
  return { status: status };
};

xenCasinoUserStateSchema.statics.getDailyQuestStatus = async function (userId) {
  var doc = await this.findOne({ userId: userId }).exec();
  return doc ? dailyQuestsStatus(doc) : dailyQuestsStatus({ dailyQuests: [], gamesPlayedToday: [] });
};

// Marks a specific quest claimed — called only after the reward transfer succeeds.
xenCasinoUserStateSchema.statics.markDailyQuestClaimed = async function (userId, date, questKey) {
  var doc = await this.findOneAndUpdate({ userId: userId }, {}, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
  var quest = (doc.dailyQuests || []).find(function (q) { return q.key === questKey && q.date === date; });
  if (quest) {
    quest.claimed = true;
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

// Rolls one raid check per completed interval tick since the run started (or was last
// rolled) - catches up correctly across gaps of any length between reads, no cron needed.
// Signal Jammer doubles the interval (10 min instead of 5). Whistleblower blocks the
// first hit and is consumed. Stops at the first unblocked hit. Mutates `run` in place.
function resolvePrinterRun(run, now) {
  if (!run || run.raidedAt) {
    return false;
  }
  var intervalMs = run.hasSignalJammer ? PRINTER_ROLL_INTERVAL_MS * 2 : PRINTER_ROLL_INTERVAL_MS;
  var lastRoll = new Date(run.lastRiskRollAt || run.startedAt);
  var initial = lastRoll.getTime();
  while (now.getTime() - lastRoll.getTime() >= intervalMs) {
    lastRoll = new Date(lastRoll.getTime() + intervalMs);
    if (Math.random() < printerRaidChance(lastRoll, run)) {
      if (run.hasWhistleblower) {
        run.hasWhistleblower = false; // consumed — blocked the first hit
      } else {
        run.raidedAt = lastRoll;
        break;
      }
    }
  }
  var changed = run.raidedAt || run.hasWhistleblower === false && lastRoll.getTime() !== initial || lastRoll.getTime() !== initial;
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
    usedMachineUpgrade: !!usedMachineUpgrade,
    // Utility part flags — each enables a unique mechanic (see casinoPrinter.ts).
    hasWhistleblower: partKeys.indexOf("whistleblower") !== -1,
    hasSignalJammer: partKeys.indexOf("signal-jammer") !== -1,
    hasForgedDocuments: partKeys.indexOf("forged-documents") !== -1,
    hasInsurance: partKeys.indexOf("insurance") !== -1,
    hasDecoyRig: partKeys.indexOf("decoy-rig") !== -1,
    lastBribeAt: now,
    lastRiskRollAt: now,
    raidedAt: null,
    bribeCount: 0,
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
  name: { type: String, required: true }, // a single silly nickname, rolled from CREATURE_NAMES at hatch time
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
  // Gates the 24h item-production cooldown (see statics.collect). createForUser seeds
  // this to the creature's own creation time (not null) so a freshly hatched creature has
  // to wait out the same cooldown before its very first collect too - null here only
  // means "an older creature from before this field existed", still treated as
  // already-ready for backward compatibility.
  lastCollectedAt: { type: Date, default: null },
  lastCollectDate: { type: String, default: null }, // "YYYY-MM-DD" of last collect in CASINO_TIMEZONE — midnight-based daily cap
  // How many times in a row this creature has been collected from without racing (see
  // statics.collect) - capped at RANCH_COLLECT_STREAK_LIMIT (casinoRanch.ts), past which
  // collect refuses to produce anything until the creature races again. Reset to 0 by
  // statics.recordRaceResult on every resolved race, win or lose.
  collectStreak: { type: Number, default: 0 },
  // Set by using a Decay Shield item (casinoRanch.ts) - resolveRanchDecay short-circuits
  // with zero decay while now < decayShieldUntil, same shape as the neglect grace period
  // it sits alongside. Null (the default) means no active shield.
  decayShieldUntil: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});
xenCasinoRanchCreatureSchema.index({ userId: 1, createdAt: 1 });

xenCasinoRanchCreatureSchema.statics.createForUser = async function (userId, params) {
  return this.create({
    userId: userId,
    species: params.species,
    name: params.name,
    rarityTier: params.rarityTier,
    lastCollectedAt: new Date(),
    lastCollectDate: todayKey(),
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
// the win/loss roll (and, on a win, after the payout transfer succeeds). Also resets
// collectStreak to 0 - racing at all (win or lose) is what re-enables collecting, not
// winning specifically. `statBoost` is an optional { statKey: amount } object (see
// raceStatBoostForPlace in casinoRanch.ts) folded into the same $inc so the placement
// reward lands in the same atomic update as everything else here.
xenCasinoRanchCreatureSchema.statics.recordRaceResult = async function (userId, creatureId, won, statBoost) {
  var inc = won ? { raceWins: 1 } : { raceLosses: 1 };
  if (statBoost) {
    Object.keys(statBoost).forEach(function (key) {
      if (statBoost[key]) {
        inc["stats." + key] = statBoost[key];
      }
    });
  }
  return this.findOneAndUpdate({ _id: creatureId, userId: userId }, { $inc: inc, $set: { collectStreak: 0 } }, { new: true }).exec();
};

// Midnight-based daily collect: a creature can be collected once per CASINO_TIMEZONE day.
// Re-validates ownership and the date guard, then atomically stamps lastCollectDate and
// bumps collectStreak via findOneAndUpdate guarded on the previously-read value so a
// concurrent collect on the same creature can't double-apply.
xenCasinoRanchCreatureSchema.statics.collect = async function (userId, creatureId) {
  var creature = await this.findOne({ _id: creatureId, userId: userId }).exec();
  if (!creature) {
    return null;
  }
  var today = todayKey();
  if (creature.lastCollectDate === today) {
    return null; // already collected today
  }
  var updated = await this.findOneAndUpdate(
    { _id: creatureId, userId: userId, lastCollectDate: creature.lastCollectDate },
    { $set: { lastCollectedAt: new Date(), lastCollectDate: today }, $inc: { collectStreak: 1 } },
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

// Applies a Tonic's flat, guaranteed gain to one stat (see TONIC_ITEMS in casinoRanch.ts) -
// no cooldown/guard needed since Tonics aren't rate-limited like feed().
xenCasinoRanchCreatureSchema.statics.applyTonic = async function (userId, creatureId, statKey, gain) {
  var inc = {};
  inc["stats." + statKey] = gain;
  return this.findOneAndUpdate({ _id: creatureId, userId: userId }, { $inc: inc }, { new: true }).exec();
};

// Used by a Type-Swap Serum (casinoRanch.ts) - only species (and therefore the derived
// type/produced item) changes; stats and level are untouched.
xenCasinoRanchCreatureSchema.statics.setSpecies = async function (userId, creatureId, species) {
  return this.findOneAndUpdate({ _id: creatureId, userId: userId }, { $set: { species: species } }, { new: true }).exec();
};

// Used by a Decay Shield (casinoRanch.ts) - `until` is compared against resolveRanchDecay's
// `now` on every subsequent read.
xenCasinoRanchCreatureSchema.statics.setDecayShield = async function (userId, creatureId, until) {
  return this.findOneAndUpdate({ _id: creatureId, userId: userId }, { $set: { decayShieldUntil: until } }, { new: true }).exec();
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
// `pending` holds { creatureId, racers, course, odds, createdAt, expiresAt } - the whole
// field/course/odds are rolled together in one /race/start call, so there's no in-between
// stage to track: a pending race is always immediately ready for a bet (or a forfeit) the
// moment it exists. The exact field/course/odds the player is shown is always what a later
// bet resolves against, never anything re-rolled or client-supplied.
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

// Clears unconditionally - called once a bet has resolved (win or lose) or the player
// forfeits, same "the caller has already decided this is done" shape as Printer's
// clearRun.
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
  XenCasinoPrinterState,
  // Exported so casinoPrinter.ts can render the same raid-risk percentage it's actually
  // being rolled against, rather than approximating it with a second copy of the formula.
  PRINTER_RISK_RAMP_MS: PRINTER_RISK_RAMP_MS,
  PRINTER_BASE_RAID_CHANCE: PRINTER_BASE_RAID_CHANCE,
  PRINTER_MAX_RAID_CHANCE: PRINTER_MAX_RAID_CHANCE,
  XenCasinoRanchCreature,
  XenCasinoRanchInventory,
  XenCasinoRanchPendingRace,
  CASINO_TIMEZONE: CASINO_TIMEZONE,
  dailyQuestDateKey: todayKey,
  // Exported for unit testing the lazy-reset-on-date-change logic without a live Mongo
  // connection - pure functions over plain objects, no I/O.
  dailyQuestsStatus: dailyQuestsStatus,
  DAILY_QUEST_DEFINITIONS: DAILY_QUEST_DEFINITIONS,
};
