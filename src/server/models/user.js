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

// User-specific conversation metadata (references Conversation collection)
var userConversationMetadataSchema = new mongoose.Schema({
  conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
  unread: { type: Boolean, default: true }, // true if user has unread messages in this conversation
  lastReadAt: { type: String }, // timestamp of last read
});

// AUTHENTICATION PROVIDER SCHEMA
var authProviderSchema = new mongoose.Schema({
  provider: { type: String, required: true }, // 'local', 'google', 'facebook', etc.
  providerId: { type: String }, // Google ID, Facebook ID, etc.
  email: { type: String }, // Email from this provider
  linkedAt: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
});

//USER
var userSchema = new mongoose.Schema({
  name: { type: String },
  username: { type: String },
  email: { type: String },
  avatar: { type: String, default: "/avatars/default-avatar.png" }, // Direct GCS public URL or local default
  roles: [{ type: String }],
  password: { type: String }, // For local authentication
  authProviders: [authProviderSchema], // Multiple authentication methods
  notifications: [notificationSchema],
  conversations: [userConversationMetadataSchema], // References to conversations with user-specific metadata
  canRespond: { type: Boolean, default: true }, // Whether user can be selected for conversations
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

// Helper methods for authentication providers
userSchema.methods.addAuthProvider = function (provider, providerId, email) {
  // Check if provider already exists
  const existingProvider = this.authProviders.find(p => p.provider === provider);
  if (existingProvider) {
    existingProvider.providerId = providerId;
    existingProvider.email = email;
    existingProvider.isActive = true;
    existingProvider.linkedAt = new Date();
  } else {
    this.authProviders.push({
      provider: provider,
      providerId: providerId,
      email: email,
      linkedAt: new Date(),
      isActive: true
    });
  }
  return this.save();
};

userSchema.methods.removeAuthProvider = function (provider) {
  const providerIndex = this.authProviders.findIndex(p => p.provider === provider);
  if (providerIndex !== -1) {
    this.authProviders[providerIndex].isActive = false;
    return this.save();
  }
  return Promise.resolve(this);
};

userSchema.methods.hasAuthProvider = function (provider) {
  return this.authProviders.some(p => p.provider === provider && p.isActive);
};

userSchema.methods.getActiveProviders = function () {
  return this.authProviders.filter(p => p.isActive);
};
var User = mongoose.model("User", userSchema);
//
module.exports = { User };
