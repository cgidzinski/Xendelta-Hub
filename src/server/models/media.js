var mongoose = require("mongoose");
var Schema = mongoose.Schema;
var { deleteFromGCS } = require("../utils/gcsUtils");

// MEDIA SCHEMA
var mediaSchema = new mongoose.Schema({
  location: { type: String, required: true }, // Folder location (e.g., "blog", "avatar")
  filename: { type: String, required: true, unique: true, index: true }, // Filename with extension (e.g., "image-1234567890.jpg")
  type: { 
    type: String, 
    required: true,
    enum: ["avatar", "blog"], // Media type enum
  },
  mimeType: { type: String, required: true }, // MIME type (e.g., "image/jpeg", "application/pdf")
  size: { type: Number }, // File size in bytes
  uploadedBy: { type: Schema.Types.ObjectId, ref: "User" }, // User who uploaded (optional)
  createdAt: { type: Date, default: Date.now },
});

// Pre-delete hook: Delete from GCS when Media document is deleted
// This handles findOneAndDelete, findByIdAndDelete, deleteOne, etc.
mediaSchema.pre(["findOneAndDelete", "deleteOne"], async function() {
  const doc = await this.model.findOne(this.getQuery());
  if (doc && doc.location && doc.filename) {
    const gcsPath = `media/${doc.location}/${doc.filename}`;
    await deleteFromGCS(gcsPath).catch(() => {
      // Ignore errors if file doesn't exist
    });
  }
});

var Media = mongoose.model("Media", mediaSchema);

module.exports = { Media };

