var mongoose = require("mongoose");
var Schema = mongoose.Schema;

// One document per user: when (in their timezone) XenRoutine reminders should land, and
// whether to batch them. The timezone itself lives in the main Profile setting
// (User.timezone). browser_timezone is only a fallback for users who leave that on
// "follow my browser" - the server can't know that zone, so the client reports it.
var xenRoutineSettingsSchema = new Schema({
  user_id: { type: String, required: true, unique: true },
  remind_hour: { type: Number, min: 0, max: 23, default: 8 },
  digest: { type: Boolean, default: false },
  browser_timezone: { type: String },
});

module.exports = mongoose.model("XenRoutineSettings", xenRoutineSettingsSchema);
