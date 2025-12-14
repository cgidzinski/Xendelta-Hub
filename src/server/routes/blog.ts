import express = require("express");
const { BlogPost } = require("../models/blogPost");
const { User } = require("../models/user");
import { authenticateToken } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import {
  validate,
  validateParams,
  createBlogPostSchema,
  updateBlogPostSchema,
  blogPostIdParamSchema,
  blogPostSlugParamSchema,
} from "../utils/validation";
import { generateSlug, ensureUniqueSlug, isValidSlug } from "../utils/slugUtils";
import { saveBlogImage, deleteBlogImage } from "../utils/blogImageUtils";
import { uploadBlogImage } from "../config/multer";
import { successResponse, notFoundResponse, badRequestResponse } from "../utils/responseHelpers";

module.exports = function (app: express.Application) {
  // Public: Get all published blog posts (sorted by featured first, then publishDate desc)
  app.get("/api/blog", async function (req: express.Request, res: express.Response) {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const totalCount = await BlogPost.countDocuments({}).exec();
    const posts = await BlogPost.find({})
      .populate("author", "username avatar")
      .sort({ featured: -1, publishDate: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    const formattedPosts = posts.map((post: any) => ({
      _id: post._id.toString(),
      title: post.title,
      slug: post.slug,
      markdown: post.markdown,
      publishDate: post.publishDate.toISOString(),
      image: post.image || post.featuredImage || (post.images && post.images[0]) || null,
      images: post.images || [],
      featuredImage: post.featuredImage || null,
      categories: post.categories || [],
      tags: post.tags || [],
      featured: post.featured || false,
      author: post.author
        ? {
            _id: post.author._id.toString(),
            username: post.author.username,
            avatar: post.author.avatar,
          }
        : null,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    }));

    return res.json({
      status: true,
      message: "",
      data: {
        posts: formattedPosts,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / limit),
        },
      },
    });
  });

  // Public: Get single blog post by slug
  app.get(
    "/api/blog/:slug",
    validateParams(blogPostSlugParamSchema),
    async function (req: express.Request, res: express.Response) {
      const { slug } = req.params;

      const post = await BlogPost.findOne({ slug })
        .populate("author", "username avatar")
        .exec();

      if (!post) {
        return notFoundResponse(res, "Blog post not found");
      }

      return res.json({
        status: true,
        message: "",
        data: {
          post: {
            _id: post._id.toString(),
            title: post.title,
            slug: post.slug,
            markdown: post.markdown,
            publishDate: post.publishDate.toISOString(),
            image: post.image || post.featuredImage || (post.images && post.images[0]) || null,
            images: post.images || [],
            featuredImage: post.featuredImage || null,
            categories: post.categories || [],
            tags: post.tags || [],
            featured: post.featured || false,
            author: post.author
              ? {
                  _id: post.author._id.toString(),
                  username: post.author.username,
                  avatar: post.author.avatar,
                }
              : null,
            createdAt: post.createdAt.toISOString(),
            updatedAt: post.updatedAt.toISOString(),
          },
        },
      });
    }
  );

  // Admin: Get all blog posts (for management)
  app.get("/api/admin/blog", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
    const posts = await BlogPost.find({})
      .populate("author", "username avatar")
      .sort({ createdAt: -1 })
      .exec();

    const formattedPosts = posts.map((post: any) => ({
      _id: post._id.toString(),
      title: post.title,
      slug: post.slug,
      markdown: post.markdown,
      publishDate: post.publishDate.toISOString(),
      image: post.image || post.featuredImage || (post.images && post.images[0]) || null,
      images: post.images || [],
      featuredImage: post.featuredImage || null,
      categories: post.categories || [],
      tags: post.tags || [],
      featured: post.featured || false,
      author: post.author
        ? {
            _id: post.author._id.toString(),
            username: post.author.username,
            avatar: post.author.avatar,
          }
        : null,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    }));

    return res.json({
      status: true,
      message: "",
      data: {
        posts: formattedPosts,
      },
    });
  });

  // Admin: Create new blog post
  app.post(
    "/api/admin/blog",
    authenticateToken,
    requireAdmin,
    validate(createBlogPostSchema),
    async function (req: express.Request, res: express.Response) {
      const { title, slug, markdown, publishDate, image, images, featuredImage, categories, tags, featured } = req.body;
      const userId = (req as any).user._id;

      // Validate slug format
      if (!isValidSlug(slug)) {
        return badRequestResponse(res, "Invalid slug format");
      }

      // Ensure slug is unique
      const uniqueSlug = await ensureUniqueSlug(slug);

      const post = new BlogPost({
        title,
        slug: uniqueSlug,
        markdown,
        publishDate: new Date(publishDate),
        image: image || undefined, // Legacy support
        images: images || [],
        featuredImage: featuredImage || undefined,
        categories: categories || [],
        tags: tags || [],
        featured: featured || false,
        author: userId,
      });

      await post.save();


      const savedPost = await BlogPost.findById(post._id).populate("author", "username avatar").exec();

      return res.json({
        status: true,
        message: "Blog post created successfully",
        data: {
          post: {
            _id: savedPost._id.toString(),
            title: savedPost.title,
            slug: savedPost.slug,
            markdown: savedPost.markdown,
            publishDate: savedPost.publishDate.toISOString(),
            image: savedPost.image || savedPost.featuredImage || (savedPost.images && savedPost.images[0]) || null,
            images: savedPost.images || [],
            featuredImage: savedPost.featuredImage || null,
            categories: savedPost.categories || [],
            tags: savedPost.tags || [],
            featured: savedPost.featured || false,
            author: savedPost.author
              ? {
                  _id: savedPost.author._id.toString(),
                  username: savedPost.author.username,
                  avatar: savedPost.author.avatar,
                }
              : null,
            createdAt: savedPost.createdAt.toISOString(),
            updatedAt: savedPost.updatedAt.toISOString(),
          },
        },
      });
    }
  );

  // Admin: Update blog post
  app.put(
    "/api/admin/blog/:id",
    authenticateToken,
    requireAdmin,
    validateParams(blogPostIdParamSchema),
    validate(updateBlogPostSchema),
    async function (req: express.Request, res: express.Response) {
      const { id } = req.params;
      const { title, slug, markdown, publishDate, image, images, featuredImage, categories, tags, featured } = req.body;

      const post = await BlogPost.findById(id).exec();

      if (!post) {
        return notFoundResponse(res, "Blog post not found");
      }

      // If slug is being updated, validate and ensure uniqueness
      if (slug && slug !== post.slug) {
        if (!isValidSlug(slug)) {
          return badRequestResponse(res, "Invalid slug format");
        }
        post.slug = await ensureUniqueSlug(slug, id);
      }

      if (title !== undefined) post.title = title;
      if (markdown !== undefined) post.markdown = markdown;
      if (publishDate !== undefined) post.publishDate = new Date(publishDate);
      if (image !== undefined) {
        // Legacy support - if image is provided, set it
        post.image = image || undefined;
      }
      if (images !== undefined) post.images = images;
      if (featuredImage !== undefined) post.featuredImage = featuredImage || undefined;
      if (categories !== undefined) post.categories = categories;
      if (tags !== undefined) post.tags = tags;
      if (featured !== undefined) post.featured = featured;

      await post.save();

      const updatedPost = await BlogPost.findById(post._id).populate("author", "username avatar").exec();

      return res.json({
        status: true,
        message: "Blog post updated successfully",
        data: {
          post: {
            _id: updatedPost._id.toString(),
            title: updatedPost.title,
            slug: updatedPost.slug,
            markdown: updatedPost.markdown,
            publishDate: updatedPost.publishDate.toISOString(),
            image: updatedPost.image || updatedPost.featuredImage || (updatedPost.images && updatedPost.images[0]) || null,
            images: updatedPost.images || [],
            featuredImage: updatedPost.featuredImage || null,
            categories: updatedPost.categories || [],
            tags: updatedPost.tags || [],
            featured: updatedPost.featured || false,
            author: updatedPost.author
              ? {
                  _id: updatedPost.author._id.toString(),
                  username: updatedPost.author.username,
                  avatar: updatedPost.author.avatar,
                }
              : null,
            createdAt: updatedPost.createdAt.toISOString(),
            updatedAt: updatedPost.updatedAt.toISOString(),
          },
        },
      });
    }
  );

  // Admin: Delete blog post
  app.delete(
    "/api/admin/blog/:id",
    authenticateToken,
    requireAdmin,
    validateParams(blogPostIdParamSchema),
    async function (req: express.Request, res: express.Response) {
      const { id } = req.params;

      const post = await BlogPost.findById(id).exec();

      if (!post) {
        return notFoundResponse(res, "Blog post not found");
      }

      // Delete associated images
      const { deleteBlogImageById } = require("../utils/blogImageUtils");
      if (post.images && post.images.length > 0) {
        for (const imagePath of post.images) {
          const imageId = imagePath.split("/").pop()?.split(".")[0];
          if (imageId) {
            await deleteBlogImageById(imageId);
          }
        }
      } else if (post.image) {
        // Legacy: single image
        await deleteBlogImage(post._id.toString());
      }

      await BlogPost.findByIdAndDelete(id).exec();

      return res.json({
        status: true,
        message: "Blog post deleted successfully",
      });
    }
  );

  // Admin: Upload blog post image(s)
  app.post(
    "/api/admin/blog/upload-image",
    authenticateToken,
    requireAdmin,
    uploadBlogImage.single("image"),
    async function (req: express.Request, res: express.Response) {
      if (!req.file) {
        return badRequestResponse(res, "No image file provided");
      }

      // Generate a unique ID for the image
      const imageId = `img-${Date.now()}-${Math.round(Math.random() * 1e9)}`;

      const imagePath = await saveBlogImage(req.file, imageId);

      return res.json({
        status: true,
        message: "Image uploaded successfully",
        data: {
          imagePath,
          imageId,
        },
      });
    }
  );

  // Admin: Delete blog post image
  app.delete(
    "/api/admin/blog/image/:imageId",
    authenticateToken,
    requireAdmin,
    async function (req: express.Request, res: express.Response) {
      const { imageId } = req.params;
      const { deleteBlogImageById } = require("../utils/blogImageUtils");

      await deleteBlogImageById(imageId);

      return res.json({
        status: true,
        message: "Image deleted successfully",
      });
    }
  );
};
