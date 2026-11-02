var mongoose = require("mongoose");
var Schema = mongoose.Schema;

// One person's relationship to a routine: the owner is always a member, sharers are
// added by the owner. Notification preferences live here (not on the routine) so each
// person decides for themselves how they are nagged about a shared routine.
var memberSchema = new Schema({
  user_id: { type: String, required: true },
  role: { type: String, enum: ["owner", "sharer"], default: "sharer" },
  channels: {
    inapp: { type: Boolean, default: true },
    push: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
  },
  muted: { type: Boolean, default: false },
}, { _id: false });

var historySchema = new Schema({
  action: { type: String, enum: ["done", "postponed"], required: true },
  at: { type: Date, default: Date.now },
  by_user: { type: String },
  note: { type: String, maxlength: 500 },
  // For "done": how many occurrences this one completion covered (sliding a later
  // occurrence completes the earlier ones too).
  count: { type: Number, min: 1, default: 1 },
  // For "postponed": the due date it was pushed to.
  due_at: { type: Date },
}, { _id: false });

var xenRoutineSchema = new Schema({
  owner_id: { type: String, required: true },
  name: { type: String, required: true, maxlength: 100 },
  category: { type: String, default: "", maxlength: 50 },
  // Free text: part numbers, filter models, where the spare lives.
  notes: { type: String, default: "", maxlength: 1000 },
  interval: {
    every: { type: Number, required: true, min: 1, max: 1000 },
    unit: { type: String, enum: ["days", "weeks", "months", "years"], required: true },
  },
  last_done_at: { type: Date, default: null },
  due_at: { type: Date, required: true },
  enabled: { type: Boolean, default: true },
  last_notified_at: { type: Date, default: null },
  remind_again_days: { type: Number, default: 3, min: 1, max: 365 },
  members: { type: [memberSchema], default: [] },
  history: { type: [historySchema], default: [] },
  created_at: { type: Date, default: Date.now },
});

xenRoutineSchema.index({ enabled: 1, due_at: 1 });
xenRoutineSchema.index({ "members.user_id": 1 });

module.exports = mongoose.model("XenRoutine", xenRoutineSchema);
