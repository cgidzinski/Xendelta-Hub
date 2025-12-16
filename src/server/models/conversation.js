var mongoose = require("mongoose");
var Schema = mongoose.Schema;

// MESSAGE SCHEMA (within conversation/group)
var messageSchema = new mongoose.Schema({
  from: { type: String }, // user ID
  message: { type: String },
  time: { type: String },
  parentMessageId: { type: String }, // optional - for threaded replies
});

// CONVERSATION/GROUP SCHEMA
var conversationSchema = new mongoose.Schema({
  participants: [{ type: String }], // array of user IDs
  name: { type: String }, // optional group name
  createdBy: { type: String }, // user ID of the conversation creator
  updatedAt: { type: String, default: () => new Date().toISOString() },
  messages: [messageSchema], // array of messages in this conversation/group
});

module.exports = mongoose.model("Conversation", conversationSchema);

