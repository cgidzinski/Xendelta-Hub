import express = require("express");
import { blogListQuerySchema, blogSlugParamSchema, validateParams, validateQuery } from "../utils/validation";
import { BlogPost } from "../models/blogPost";
import { PUBLIC_USER_FIELDS } from "../utils/publicUser";
import { AppError } from "../utils/http";

module.exports = function (app: express.Application) {
  app.get(
    "/api/blog",
    validateQuery(blogListQuerySchema),
    async function (req: express.Request, res: express.Response) {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const skip = (page - 1) * limit;

      const totalCount = await BlogPost.countDocuments({ published: true }).exec();
      const posts = await BlogPost.find({ published: true })
        .populate("author", PUBLIC_USER_FIELDS)
        .sort({ featured: -1, publishDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec();

      return res.json({
        status: true,
        data: {
          posts,
          pagination: {
            page,
            limit,
            total: totalCount,
            totalPages: Math.ceil(totalCount / limit),
          },
        },
      });
    },
  );

  app.get(
    "/api/blog/:slug",
    validateParams(blogSlugParamSchema),
    async function (req: express.Request, res: express.Response) {
      const post = await BlogPost.findOne({ slug: req.params.slug, published: true })
        .populate("author", PUBLIC_USER_FIELDS)
        .lean()
        .exec();

      if (!post) {
        throw new AppError(404, "Blog post not found");
      }

      return res.json({
        status: true,
        data: { post },
      });
    },
  );
};
