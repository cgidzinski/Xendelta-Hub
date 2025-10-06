var mongoose = require("mongoose");
var bcrypt = require("bcrypt-nodejs");
var Schema = mongoose.Schema;

// NOTIFICATION SCHEMA
var notificationSchema = new mongoose.Schema({
  title: { type: String },
  message: { type: String },
  time: { type: String },
  icon: { type: String },
  unread: { type: Boolean },
});

//USER
var userSchema = new mongoose.Schema({
  name: { type: String },
  username: { type: String },
  email: { type: String },
  avatar: { type: String, default: "https://i.pravatar.cc/300" },
  roles: [{ type: String }],
  password: { type: String },
  notifications: [notificationSchema],
  resetPassword: {
    token: { type: String },
    expires: { type: Date },
  },
});
userSchema.methods.generateHash = function (password) {
  return bcrypt.hashSync(password, bcrypt.genSaltSync(8), null);
};
userSchema.methods.validPassword = function (password) {
  return bcrypt.compareSync(password, this.password);
};
var User = mongoose.model("User", userSchema);
//
module.exports = { User };
