import mongoose, { Schema, type InferSchemaType } from "mongoose";

// BLOG POST SCHEMA
const blogPostSchema = new Schema({
  title: { type: String, required: true },
  slug: { type: String, required: true, unique: true, index: true },
  markdown: { type: String, required: true },
  publishDate: { type: Date, required: true },
  assets: [{ type: String }], // Array of direct GCS public URLs
  featuredImage: { type: String }, // Direct GCS public URL
  categories: [{ type: String }],
  tags: [{ type: String }],
  featured: { type: Boolean, default: false },
  published: { type: Boolean, default: false },
  author: { type: Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Update updatedAt before saving
blogPostSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

export type BlogPostAttrs = InferSchemaType<typeof blogPostSchema>;

const BlogPost = mongoose.model("BlogPost", blogPostSchema);

export { BlogPost };
