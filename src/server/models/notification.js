var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var notificationSchema = new mongoose.Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String },
  message: { type: String },
  time: { type: String },
  icon: { type: String },
  unread: { type: Boolean, default: true },
});

notificationSchema.index({ userId: 1, time: -1 });

module.exports = mongoose.model("Notification", notificationSchema);