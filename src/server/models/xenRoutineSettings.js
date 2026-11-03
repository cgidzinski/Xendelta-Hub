var mongoose = require("mongoose");
var Schema = mongoose.Schema;

// One document per user: when (in their timezone) XenRoutine reminders should land, and
// and how to reach them. The timezone itself lives in the main Profile setting
// (User.timezone). browser_timezone is only a fallback for users who leave that on
// "follow my browser" - the server can't know that zone, so the client reports it.
var xenRoutineSettingsSchema = new Schema({
  user_id: { type: String, required: true, unique: true },
  remind_hour: { type: Number, min: 0, max: 23, default: 8 },
  // How this person wants to be reached, for every routine. Email additionally needs the
  // global email switch in Profile (checked inside notify()).
  channels: {
    inapp: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
  },
  browser_timezone: { type: String },
});

module.exports = mongoose.model("XenRoutineSettings", xenRoutineSettingsSchema);
