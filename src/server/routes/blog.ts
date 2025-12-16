import express = require("express");
const { BlogPost } = require("../models/blogPost");

module.exports = function (app: express.Application) {
  app.get("/api/blog", async function (req: express.Request, res: express.Response) {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    const totalCount = await BlogPost.countDocuments({ published: true }).exec();
    const posts = await BlogPost.find({ published: true })
      .populate("author", "username avatar")
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
  });

  app.get("/api/blog/:slug", async function (req: express.Request, res: express.Response) {
    const post = await BlogPost.findOne({ slug: req.params.slug, published: true })
      .populate("author", "username avatar")
      .lean()
      .exec();

    if (!post) {
      return res.status(404).json({
        status: false,
        message: "Blog post not found",
      });
    }

    return res.json({
      status: true,
      data: { post },
    });
  });


};
