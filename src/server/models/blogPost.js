var mongoose = require("mongoose");
var Schema = mongoose.Schema;

// BLOG POST SCHEMA
var blogPostSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true, index: true },
  markdown: { type: String, required: true },
  publishDate: { type: Date, required: true },
  images: [{ type: String }], // Array of image paths
  featuredImage: { type: String }, // Path to featured image (one of the images)
  categories: [{ type: String }],
  tags: [{ type: String }],
  featured: { type: Boolean, default: false },
  author: { type: Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Update updatedAt before saving
blogPostSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

var BlogPost = mongoose.model("BlogPost", blogPostSchema);

module.exports = { BlogPost };
