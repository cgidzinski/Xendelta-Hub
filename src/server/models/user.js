var mongoose = require("mongoose");
var bcrypt = require("bcrypt-nodejs");
var Schema = mongoose.Schema
//USER
var userSchema = new mongoose.Schema({
  name: { type: String },
  username: { type: String },
  email: { type: String },
  avatar: { type: String, default: "https://i.pravatar.cc/300" },
  roles: [{ type: String }],
  password: { type: String },
});
userSchema.methods.generateHash = function (password) {
  return bcrypt.hashSync(password, bcrypt.genSaltSync(8), null);
};
userSchema.methods.validPassword = function (password) {
  return bcrypt.compareSync(password, this.password);
};
var User = mongoose.model("User", userSchema);
//
module.exports = User;
