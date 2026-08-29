import express = require("express");
import { authenticateToken } from "../middleware/auth";
import { uploadRecipaintAsset as multerUploadRecipaintAsset } from "../config/multer";
import {
  uploadRecipaintAsset,
  generateUniqueFilename,
  deleteRecipaintAssetByUrl,
} from "../utils/mediaUtils";
import { AuthenticatedRequest } from "../types";
import { sanitizeCompletedSteps } from "../../shared/recipaint/progress";
const { Recipe } = require("../models/recipe");
const { RecipeProgress } = require("../models/recipeProgress");
const mongoose = require("mongoose");
const {
  Types: { ObjectId },
} = mongoose;

const DEFAULT_LIST_LIMIT = 24;
const MAX_LIST_LIMIT = 100;

/**
 * Parse ?limit / ?offset into a sane, bounded page. A junk value falls back to the
 * default rather than erroring - these are list endpoints, not form submissions.
 */
function parsePaging(req: express.Request): { limit: number; offset: number } {
  const rawLimit = Number(req.query.limit);
  const rawOffset = Number(req.query.offset);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), MAX_LIST_LIMIT) : DEFAULT_LIST_LIMIT;
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
  return { limit, offset };
}

/**
 * Fetch a page of recipe summaries: newest first, with `steps` replaced by a `stepCount`.
 * List views only need the count, and a recipe's steps carry every step's image array -
 * shipping them made the list response grow without bound.
 */
async function findRecipeSummaries(match: any, limit: number, offset: number) {
  const recipes = await Recipe.aggregate([
    { $match: match },
    { $sort: { dateUpdated: -1 } },
    { $skip: offset },
    { $limit: limit },
    { $addFields: { stepCount: { $size: { $ifNull: ["$steps", []] } } } },
    { $project: { steps: 0 } },
  ]).exec();

  // $lookup would need two more stages per field; populate() on plain objects is clearer.
  return Recipe.populate(recipes, [
    { path: "author", select: "username avatar" },
    { path: "owner", select: "username avatar" },
  ]);
}

module.exports = function (app: express.Application) {
  // Get all recipes for authenticated user
  app.get("/api/recipaint", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = (req as AuthenticatedRequest).user!._id;
    const search = req.query.search as string;
    const { limit, offset } = parsePaging(req);

    const query: any = { owner: new ObjectId(userId) };
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
        { "steps.paints.name": { $regex: search, $options: "i" } },
        { "steps.paints.brand": { $regex: search, $options: "i" } },
      ];
    }

    const recipes = await findRecipeSummaries(query, limit, offset);

    return res.json({
      status: true,
      data: { recipes },
    });
  });

  // Get public recipes from other users
  app.get("/api/recipaint/public", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = (req as AuthenticatedRequest).user!._id;
    const { limit, offset } = parsePaging(req);

    const recipes = await findRecipeSummaries(
      { isPublic: true, owner: { $ne: new ObjectId(userId) } },
      limit,
      offset,
    );

    return res.json({
      status: true,
      data: { recipes },
    });
  });

  // Get single recipe
  app.get("/api/recipaint/public/:id", async function (req: express.Request, res: express.Response) {
    const recipeId = req.params.id;

    const recipe = await Recipe.findById(recipeId)
      .populate("author", "username avatar")
      .populate("owner", "username avatar")
      .lean()
      .exec();

    if (!recipe) {
      return res.status(404).json({
        status: false,
        message: "Recipe not found",
      });
    }

    // If recipe is not public, return 401
    if (!recipe.isPublic) {
      return res.status(401).json({
        status: false,
        message: "Access denied",
      });
    }

    return res.json({
      status: true,
      data: {
        recipe,
      },
    });
  });

  // Distinct paints the user has already used, to seed the paint editor's autocomplete.
  // Registered before /api/recipaint/:id so "paints" isn't parsed as a recipe id.
  app.get("/api/recipaint/paints", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = (req as AuthenticatedRequest).user!._id;

    const rows = await Recipe.aggregate([
      { $match: { owner: new ObjectId(userId) } },
      { $unwind: "$steps" },
      { $unwind: "$steps.paints" },
      {
        $group: {
          // Case-insensitive identity, but keep the spelling the user actually typed.
          _id: { brand: { $toLower: "$steps.paints.brand" }, name: { $toLower: "$steps.paints.name" } },
          brand: { $first: "$steps.paints.brand" },
          name: { $first: "$steps.paints.name" },
          hex: { $first: "$steps.paints.hex" },
          type: { $first: "$steps.paints.type" },
        },
      },
      { $sort: { brand: 1, name: 1 } },
      { $limit: 500 },
      { $project: { _id: 0, brand: 1, name: 1, hex: 1, type: 1 } },
    ]).exec();

    return res.json({
      status: true,
      data: { paints: rows },
    });
  });

  // Get single recipe
  app.get("/api/recipaint/:id", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = (req as AuthenticatedRequest).user!._id;
    const recipeId = req.params.id;

    const recipe = await Recipe.findById(recipeId)
      .populate("author", "username avatar")
      .populate("owner", "username avatar")
      .lean()
      .exec();

    if (!recipe) {
      return res.status(404).json({
        status: false,
        message: "Recipe not found",
      });
    }
    // If recipe is public, allow access to anyone
    if (recipe.isPublic) {
      return res.json({
        status: true,
        data: {
          recipe,
        },
      });
    }

    // If recipe is private, require authentication and check if user is owner
    if (!userId) {
      return res.status(401).json({
        status: false,
        message: "Authentication required",
      });
    }
    // Check if user is the owner
    let ownerObjectId: typeof ObjectId;
    if (recipe.owner && typeof recipe.owner === "object" && "_id" in recipe.owner) {
      // Populated owner
      ownerObjectId = new ObjectId(recipe.owner._id);
    } else {
      // Unpopulated owner
      ownerObjectId = new ObjectId(recipe.owner);
    }

    const userObjectId = new ObjectId(userId);
    const isOwner = ownerObjectId.equals(userObjectId);

    if (!isOwner) {
      return res.status(403).json({
        status: false,
        message: "Access denied",
      });
    }

    return res.json({
      status: true,
      data: {
        recipe,
      },
    });
  });

  // Create new recipe
  app.post("/api/recipaint", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = (req as AuthenticatedRequest).user!._id;
    const { showcase, title, description, steps, isPublic } = req.body;

    if (!title) {
      return res.status(400).json({
        status: false,
        message: "Title is required",
      });
    }

    const recipe = new Recipe({
      showcase: showcase || [],
      title,
      description: description || "",
      steps: steps || [],
      isPublic: isPublic || false,
      author: userId,
      owner: userId,
    });

    await recipe.save();

    const saved = await Recipe.findById(recipe._id)
      .populate("author", "username avatar")
      .populate("owner", "username avatar")
      .lean()
      .exec();

    return res.json({
      status: true,
      message: "Recipe created successfully",
      data: { recipe: saved },
    });
  });

  // Update recipe
  app.put("/api/recipaint/:id", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = (req as AuthenticatedRequest).user!._id;
    const recipeId = req.params.id;
    const { showcase, title, description, steps, isPublic } = req.body;

    const recipe = await Recipe.findById(recipeId).exec();

    if (!recipe) {
      return res.status(404).json({
        status: false,
        message: "Recipe not found",
      });
    }

    // Check if user is the owner using ObjectId comparison
    const ownerObjectId = new ObjectId(recipe.owner);
    const userObjectId = new ObjectId(userId);

    if (!ownerObjectId.equals(userObjectId)) {
      return res.status(403).json({
        status: false,
        message: "Access denied",
      });
    }

    // Validate that steps are only RecipeStep objects (not recipe IDs)
    if (steps !== undefined) {
      if (!Array.isArray(steps)) {
        return res.status(400).json({
          status: false,
          message: "Steps must be an array",
        });
      }
      for (const step of steps) {
        if (typeof step === "string" || (typeof step === "object" && step !== null && !("index" in step))) {
          return res.status(400).json({
            status: false,
            message: "Steps must be RecipeStep objects only. Recipe references are not supported.",
          });
        }
      }
    }

    if (showcase !== undefined) recipe.showcase = showcase;
    if (title !== undefined) recipe.title = title;
    if (description !== undefined) recipe.description = description;
    if (steps !== undefined) recipe.steps = steps;
    if (isPublic !== undefined) recipe.isPublic = isPublic;

    await recipe.save();

    const updated = await Recipe.findById(recipe._id)
      .populate("author", "username avatar")
      .populate("owner", "username avatar")
      .lean()
      .exec();

    return res.json({
      status: true,
      message: "Recipe updated successfully",
      data: {
        recipe: updated,
      },
    });
  });

  // Registered before DELETE /api/recipaint/:id - Express matches in registration order,
  // so with the routes the other way round this path was swallowed as a recipe id of
  // "asset", which then failed to cast to an ObjectId and 500ed. Asset deletion never ran.
  // Delete recipaint asset endpoint
  app.delete("/api/recipaint/asset", authenticateToken, async function (req: express.Request, res: express.Response) {
    const assetUrl = req.query.assetUrl as string;

    if (!assetUrl) {
      return res.status(400).json({
        status: false,
        message: "Asset URL is required",
      });
    }

    await deleteRecipaintAssetByUrl(assetUrl);

    return res.json({
      status: true,
      message: "Asset deleted successfully",
    });
  });

  // --- Paint-along progress -------------------------------------------------------------
  // Progress is per user per recipe, so you can put a mini down for a week and pick it up.

  /** You may track progress on your own recipe, or on anyone's public one. */
  async function canTrackProgress(recipeId: string, userId: string): Promise<boolean> {
    const recipe = await Recipe.findById(recipeId).select("owner isPublic").lean().exec();
    if (!recipe) return false;
    if (recipe.isPublic) return true;
    return new ObjectId(recipe.owner).equals(new ObjectId(userId));
  }

  app.get(
    "/api/recipaint/:id/progress",
    authenticateToken,
    async function (req: express.Request, res: express.Response) {
      const userId = (req as AuthenticatedRequest).user!._id;
      const recipeId = req.params.id;

      if (!(await canTrackProgress(recipeId, userId))) {
        return res.status(404).json({ status: false, message: "Recipe not found" });
      }

      const progress = await RecipeProgress.findOne({
        user: new ObjectId(userId),
        recipe: new ObjectId(recipeId),
      })
        .lean()
        .exec();

      return res.json({
        status: true,
        data: { completedSteps: progress?.completedSteps || [] },
      });
    },
  );

  app.put(
    "/api/recipaint/:id/progress",
    authenticateToken,
    async function (req: express.Request, res: express.Response) {
      const userId = (req as AuthenticatedRequest).user!._id;
      const recipeId = req.params.id;
      const { completedSteps } = req.body;

      if (!Array.isArray(completedSteps)) {
        return res.status(400).json({ status: false, message: "completedSteps must be an array" });
      }

      const recipe = await Recipe.findById(recipeId).select("owner isPublic steps").lean().exec();
      if (!recipe) {
        return res.status(404).json({ status: false, message: "Recipe not found" });
      }
      if (!recipe.isPublic && !new ObjectId(recipe.owner).equals(new ObjectId(userId))) {
        return res.status(403).json({ status: false, message: "Access denied" });
      }

      const cleaned = sanitizeCompletedSteps(completedSteps, (recipe.steps || []).length);

      const saved = await RecipeProgress.findOneAndUpdate(
        { user: new ObjectId(userId), recipe: new ObjectId(recipeId) },
        { $set: { completedSteps: cleaned, updatedAt: new Date() } },
        { upsert: true, new: true },
      )
        .lean()
        .exec();

      return res.json({
        status: true,
        data: { completedSteps: saved.completedSteps || [] },
      });
    },
  );

  // Delete recipe
  app.delete("/api/recipaint/:id", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = (req as AuthenticatedRequest).user!._id;
    const recipeId = req.params.id;

    const recipe = await Recipe.findById(recipeId).exec();

    if (!recipe) {
      return res.status(404).json({
        status: false,
        message: "Recipe not found",
      });
    }

    // Check if user is the owner
    const ownerId = recipe.owner?.toString() || String(recipe.owner);
    if (ownerId !== userId) {
      return res.status(403).json({
        status: false,
        message: "Access denied",
      });
    }

    // Delete the recipe's images - showcase and every step's - along with their thumbnails.
    const assetUrls: string[] = [
      ...(recipe.showcase || []),
      ...(recipe.steps || []).flatMap((step: any) =>
        step && typeof step === "object" && Array.isArray(step.images) ? step.images : [],
      ),
    ].filter((url: unknown): url is string => typeof url === "string" && url.startsWith("http"));

    await Promise.all(assetUrls.map((url) => deleteRecipaintAssetByUrl(url)));

    await Recipe.findByIdAndDelete(recipeId).exec();
    // Nobody's progress can refer to this recipe any more.
    await RecipeProgress.deleteMany({ recipe: new ObjectId(recipeId) }).exec();

    return res.json({
      status: true,
      message: "Recipe deleted successfully",
    });
  });

  // Upload recipaint asset endpoint
  app.post(
    "/api/recipaint/upload-asset",
    authenticateToken,
    multerUploadRecipaintAsset.single("asset"),
    async function (req: express.Request, res: express.Response) {
      if (!req.file) {
        return res.status(400).json({
          status: false,
          message: "No asset file provided",
        });
      }

      // Generate unique filename
      const filename = generateUniqueFilename(req.file.originalname);

      // Upload to public GCS bucket (returns public URL)
      const assetData = await uploadRecipaintAsset(req.file, filename);

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
    },
  );

  // Clone recipe endpoint
  app.post("/api/recipaint/:id/clone", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = (req as AuthenticatedRequest).user!._id;
    const recipeId = req.params.id;

    const originalRecipe = await Recipe.findById(recipeId).populate("author", "username avatar").lean().exec();

    if (!originalRecipe) {
      return res.status(404).json({
        status: false,
        message: "Recipe not found",
      });
    }

    // If recipe is private, check if user is the owner
    if (!originalRecipe.isPublic) {
      let ownerObjectId: typeof ObjectId;
      if (originalRecipe.owner && typeof originalRecipe.owner === "object" && "_id" in originalRecipe.owner) {
        ownerObjectId = new ObjectId(originalRecipe.owner._id);
      } else {
        ownerObjectId = new ObjectId(originalRecipe.owner);
      }
      const userObjectId = new ObjectId(userId);
      if (!ownerObjectId.equals(userObjectId)) {
        return res.status(403).json({
          status: false,
          message: "Access denied",
        });
      }
    }
    // If recipe is public, anyone can clone it

    // Get the author ID (could be populated or not)
    const authorId =
      originalRecipe.author && typeof originalRecipe.author === "object" && "_id" in originalRecipe.author
        ? originalRecipe.author._id
        : originalRecipe.author;

    // Create cloned recipe
    const clonedRecipe = new Recipe({
      showcase: originalRecipe.showcase || [],
      title: `Copy of ${originalRecipe.title}`,
      description: originalRecipe.description || "",
      steps: originalRecipe.steps || [],
      isPublic: originalRecipe.isPublic || false,
      author: authorId,
      owner: userId,
      originalRecipeId: originalRecipe._id,
    });

    await clonedRecipe.save();

    const saved = await Recipe.findById(clonedRecipe._id)
      .populate("author", "username avatar")
      .populate("owner", "username avatar")
      .lean()
      .exec();

    return res.json({
      status: true,
      message: "Recipe cloned successfully",
      data: { recipe: saved },
    });
  });
};
