var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var scheduledTaskSchema = new Schema({
  task_type: { type: String, required: true },
  enabled: { type: Boolean, default: true },
  // Next due date. Invariant (recurring): run_at === advanceDate(anchor_date, frequency, run_count).
  // One-shot (frequency null): run_at === anchor_date.
  run_at: { type: Date, required: true },
  anchor_date: { type: Date, required: true },
  frequency: {
    type: String,
    // "30s" exists for testing the scheduler; real schedules are daily or longer
    enum: ["30s", "daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"],
    default: null, // null => one-shot
  },
  end_date: { type: Date }, // inclusive
  max_runs: { type: Number },
  run_count: { type: Number, default: 0 },
  // "all" = handler sees every missed due date (backfill); "latest" = handler sees
  // only the newest due date but the counter advances past all of them
  catch_up: { type: String, enum: ["all", "latest"], default: "all" },
  last_run_at: { type: Date },
  last_error: { type: String },
  payload: { type: Object, default: {} },
  created_by: { type: String },
  created_at: { type: Date, default: Date.now },
});

scheduledTaskSchema.index({ enabled: 1, run_at: 1 }); // dispatcher tick query
scheduledTaskSchema.index({ task_type: 1, "payload.group_id": 1 }); // xensplit serializer/route lookups

module.exports = mongoose.model("ScheduledTask", scheduledTaskSchema);
