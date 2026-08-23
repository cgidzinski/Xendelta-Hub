var mongoose = require("mongoose");
var Schema = mongoose.Schema;

// One row per subscribed device. A user with a phone and a laptop has two rows;
// `endpoint` is the push service URL the browser handed us at subscribe time and
// uniquely identifies that device, so re-subscribing upserts instead of duplicating.
var pushSubscriptionSchema = new mongoose.Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  endpoint: { type: String, required: true, unique: true },
  keys: {
    p256dh: { type: String, required: true },
    auth: { type: String, required: true },
  },
  userAgent: { type: String },
  createdAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("PushSubscription", pushSubscriptionSchema);
