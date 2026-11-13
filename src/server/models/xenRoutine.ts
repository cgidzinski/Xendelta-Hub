import mongoose, { Schema, type InferSchemaType } from "mongoose";

// One person's relationship to a routine: the owner is always a member, sharers are
// added by the owner. Per-routine reminder options live here (mute, heads-up, activity) so
// each person decides for themselves; delivery channels are per user (XenRoutineSettings).
const memberSchema = new Schema(
  {
    user_id: { type: String, required: true },
    role: { type: String, enum: ["owner", "editor"], default: "editor" },
    muted: { type: Boolean, default: false },
    // Also remind this many days before it's due (0 = off). On by default: one day ahead.
    lead_days: { type: Number, min: 0, max: 30, default: 1 },
    // Tell this person when someone else completes or postpones the routine.
    activity: { type: Boolean, default: true },
    // Per-person reminder throttling: people have their own reminder hour and timezone,
    // so one routine-wide "last notified" no longer works.
    last_due_notified_at: { type: Date, default: null },
    lead_notified_for: { type: Date, default: null },
  },
  { _id: false },
);

// A step on a routine's checklist (the monthly car check: tyres, oil, lights). `done` is the tick for the occurrence
// that is due now, shared by everyone on the routine; completing the routine resets every tick.
const checklistItemSchema = new Schema(
  {
    text: { type: String, required: true, maxlength: 100 },
    done: { type: Boolean, default: false },
  },
  { _id: true },
);

const historySchema = new Schema(
  {
    action: { type: String, enum: ["done", "postponed"], required: true },
    at: { type: Date, default: Date.now },
    by_user: { type: String },
    note: { type: String, maxlength: 500 },
    // For "done": which scheduled occurrence this completion was for, when it was done
    // ahead of its time (a later occurrence completed while earlier ones are still pending).
    occurrence_at: { type: Date },
    // For "postponed": the due date it was pushed to.
    due_at: { type: Date },
    // For "done" on a routine with a checklist: what was ticked off, out of how many steps there were.
    steps_done: { type: [String], default: undefined },
    steps_total: { type: Number, min: 0 },
  },
  { _id: false },
);

const xenRoutineSchema = new Schema({
  owner_id: { type: String, required: true },
  name: { type: String, required: true, maxlength: 100 },
  category: { type: String, default: "", maxlength: 50 },
  // Free text: part numbers, filter models, where the spare lives.
  notes: { type: String, default: "", maxlength: 1000 },
  checklist: { type: [checklistItemSchema], default: [] },
  interval: {
    every: { type: Number, required: true, min: 1, max: 1000 },
    unit: { type: String, enum: ["days", "weeks", "months", "years"], required: true },
  },
  last_done_at: { type: Date, default: null },
  due_at: { type: Date, required: true },
  enabled: { type: Boolean, default: true },
  last_notified_at: { type: Date, default: null },
  // Future occurrences already completed ahead of time. The schedule grid is
  // due_at + k * interval; these dates are skipped when the grid reaches them.
  done_ahead: { type: [Date], default: [] },
  remind_again_days: { type: Number, default: 3, min: 1, max: 365 },
  members: { type: [memberSchema], default: [] },
  history: { type: [historySchema], default: [] },
  created_at: { type: Date, default: Date.now },
});

xenRoutineSchema.index({ enabled: 1, due_at: 1 });
xenRoutineSchema.index({ "members.user_id": 1 });

export type XenRoutineAttrs = InferSchemaType<typeof xenRoutineSchema>;

export const XenRoutine = mongoose.model("XenRoutine", xenRoutineSchema);
