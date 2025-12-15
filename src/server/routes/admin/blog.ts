import express = require("express");
const { BlogPost } = require("../../models/blogPost");
import { authenticateToken } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/admin";
import { validate, createBlogPostSchema, updateBlogPostSchema } from "../../utils/validation";
import { ensureUniqueSlug } from "../../utils/slugUtils";
import { uploadBlogAsset as multerUploadBlogAsset } from "../../config/multer";
import { notFoundResponse, badRequestResponse } from "../../utils/responseHelpers";
import { uploadBlogAsset, generateUniqueFilename } from "../../utils/mediaUtils";
import { deleteFromPublicGCS } from "../../utils/gcsUtils";

module.exports = function (app: express.Application) {
  app.get("/api/admin/blog", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
    const posts = await BlogPost.find({})
      .populate("author", "username avatar")
      .populate("assets", "filename mimeType")
      .populate("featuredImage", "filename")
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    return res.json({
      status: true,
      data: { posts },
    });
  });

  app.post("/api/admin/blog", authenticateToken, requireAdmin, validate(createBlogPostSchema), async function (req: express.Request, res: express.Response) {
    const { title, slug, markdown, publishDate, assets, featuredImage, categories, tags, featured, published } = req.body;
    const userId = (req as any).user._id;

    const uniqueSlug = await ensureUniqueSlug(slug);

    const post = new BlogPost({
      title,
      slug: uniqueSlug,
      markdown,
      publishDate: new Date(publishDate),
      assets: assets || [],
      featuredImage: featuredImage || undefined,
      categories: categories || [],
      tags: tags || [],
      featured: featured || false,
      published: published || false,
      author: userId,
    });

    await post.save();

    const saved = await BlogPost.findById(post._id)
      .populate("author", "username avatar")
      .lean()
      .exec();

    return res.json({
      status: true,
      message: "Blog post created successfully",
      data: { post: saved },
    });
  });

  app.post("/api/admin/blog/upload-asset", authenticateToken, requireAdmin, multerUploadBlogAsset.single("asset"), async function (req: express.Request, res: express.Response) {
    if (!req.file) {
      return badRequestResponse(res, "No asset file provided");
    }

    const postId = req.body.postId || req.query.postId;
    if (!postId) {
      return badRequestResponse(res, "Post ID is required");
    }

    const post = await BlogPost.findById(postId).exec();
    if (!post) {
      return notFoundResponse(res, "Blog post");
    }

    // Generate unique filename
    const filename = generateUniqueFilename(req.file.originalname);
    
    // Upload to public GCS and get direct URL
    const assetData = await uploadBlogAsset(req.file, filename);

    if (!post.assets) post.assets = [];
    if (!post.assets.includes(assetData.url)) {
      post.assets.push(assetData.url);
      await post.save();
    }

    return res.json({
      status: true,
      message: "Asset uploaded successfully",
      data: {
        url: assetData.url,
        filename: assetData.filename,
        mimeType: assetData.mimeType,
        size: assetData.size,
      },
    });
  });

  app.delete("/api/admin/blog/asset", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
    const postId = req.query.postId as string;
    const assetUrl = req.query.assetUrl as string;
    
    if (!postId) {
      return badRequestResponse(res, "Post ID is required");
    }
    
    if (!assetUrl) {
      return badRequestResponse(res, "Asset URL is required");
    }

    const post = await BlogPost.findById(postId).exec();
    if (!post) {
      return notFoundResponse(res, "Blog post");
    }

    // Remove URL from assets array
    if (post.assets) {
      post.assets = post.assets.filter((url: string) => url !== assetUrl);
      await post.save();
    }

    // Delete from public GCS
    const urlParts = assetUrl.split("/");
    const filename = urlParts[urlParts.length - 1];
    const gcsPath = `blog-assets/${filename}`;
    await deleteFromPublicGCS(gcsPath).catch(() => {
      // Ignore errors if file doesn't exist
    });

    return res.json({
      status: true,
      message: "Asset deleted successfully",
    });
  });

  app.put("/api/admin/blog/:id", authenticateToken, requireAdmin, validate(updateBlogPostSchema), async function (req: express.Request, res: express.Response) {
    const post = await BlogPost.findById(req.params.id).exec();

    if (!post) {
      return notFoundResponse(res, "Blog post");
    }

    const { title, slug, markdown, publishDate, assets, featuredImage, categories, tags, featured, published } = req.body;

    if (slug && slug !== post.slug) {
      post.slug = await ensureUniqueSlug(slug, post._id.toString());
    }
    if (title !== undefined) post.title = title;
    if (markdown !== undefined) post.markdown = markdown;
    if (publishDate !== undefined) post.publishDate = new Date(publishDate);
    if (assets !== undefined) post.assets = assets;
    if (featuredImage !== undefined) {
      post.featuredImage = featuredImage ? featuredImage : null;
    }
    if (categories !== undefined) post.categories = categories;
    if (tags !== undefined) post.tags = tags;
    if (featured !== undefined) post.featured = featured;
    if (published !== undefined) post.published = published;

    await post.save();

    const updated = await BlogPost.findById(post._id)
      .populate("author", "username avatar")
      .lean()
      .exec();

    return res.json({
      status: true,
      message: "Blog post updated successfully",
      data: { post: updated },
    });
  });

  app.delete("/api/admin/blog/:id", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
    const post = await BlogPost.findById(req.params.id).exec();

    if (!post) {
      return notFoundResponse(res, "Blog post");
    }

    // Delete associated assets from public GCS
    if (post.assets && post.assets.length > 0) {
      for (const assetUrl of post.assets) {
        // Extract filename from URL (e.g., "https://storage.googleapis.com/bucket/blog-assets/filename.ext")
        const urlParts = assetUrl.split("/");
        const filename = urlParts[urlParts.length - 1];
        const gcsPath = `blog-assets/${filename}`;
        await deleteFromPublicGCS(gcsPath).catch(() => {
          // Ignore errors if file doesn't exist
        });
      }
    }
    
    if (post.featuredImage) {
      // Extract filename from URL
      const urlParts = post.featuredImage.split("/");
      const filename = urlParts[urlParts.length - 1];
      const gcsPath = `blog-assets/${filename}`;
      await deleteFromPublicGCS(gcsPath).catch(() => {
        // Ignore errors if file doesn't exist
      });
    }

    await BlogPost.findByIdAndDelete(req.params.id).exec();

    return res.json({
      status: true,
      message: "Blog post deleted successfully",
    });
  });

};

