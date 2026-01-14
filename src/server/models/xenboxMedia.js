var mongoose = require("mongoose");
var Schema = mongoose.Schema;
var { deleteFromGCS } = require("../utils/gcsUtils");

// MEDIA SCHEMA
var xenboxMediaSchema = new mongoose.Schema({
  location: { type: String, required: true }, // Folder location (e.g., "blog", "avatar")
  filename: { type: String, required: true }, // Filename with extension (e.g., "image-1234567890.jpg")
  mimeType: { type: String, required: true }, // MIME type (e.g., "image/jpeg", "application/pdf")
  size: { type: Number }, // File size in bytes
  uploadedBy: { type: Schema.Types.ObjectId, ref: "User" }, // User who uploaded (optional)
  createdAt: { type: Date, default: Date.now },
  password: { type: String }, // Plain text password for file access (optional)
  expiry: { type: Date }, // Expiry date for file access (optional)
  shareToken: { type: String, unique: true, sparse: true }, // Unique token for sharing
});

// Pre-save hook: Generate share token if not exists
xenboxMediaSchema.pre("save", function(next) {
  if (!this.shareToken) {
    // Generate a unique token using timestamp and random string
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 15);
    this.shareToken = `${timestamp}-${random}`;
  }
  next();
});

// Method for password verification (plain text comparison)
xenboxMediaSchema.methods.validPassword = function (password) {
  if (!this.password) return true; // No password set, allow access
  return this.password === password; // Plain text comparison
};

xenboxMediaSchema.methods.isExpired = function () {
  if (!this.expiry) return false; // No expiry set, not expired
  return new Date() > this.expiry;
};

// Pre-delete hook: Delete from GCS when Media document is deleted
// This handles findOneAndDelete, findByIdAndDelete, deleteOne, etc.
xenboxMediaSchema.pre(["findOneAndDelete", "deleteOne"], async function() {
  const doc = await this.model.findOne(this.getQuery());
  if (doc && doc.filename && doc.uploadedBy) {
    const userId = doc.uploadedBy.toString();
    const gcsPath = `xenbox/${userId}/${doc.filename}`;
    await deleteFromGCS(gcsPath, true).catch(() => {
      // Ignore errors if file doesn't exist
    });
  }
});

var XenBoxMedia = mongoose.model("XenBoxMedia", xenboxMediaSchema);

module.exports = { XenBoxMedia };

