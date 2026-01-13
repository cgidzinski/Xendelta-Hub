import express = require("express");
import { authenticateToken } from "../middleware/auth";
import { uploadRecipaintAsset as multerUploadRecipaintAsset } from "../config/multer";
import { uploadRecipaintAsset, generateUniqueFilename } from "../utils/mediaUtils";
import { deleteFromGCS } from "../utils/gcsUtils";
import { AuthenticatedRequest } from "../types";
const { Recipe } = require("../models/recipe");
const mongoose = require("mongoose");
const { Types: { ObjectId } } = mongoose;

module.exports = function (app: express.Application) {

  // Get all recipes for authenticated user
  app.get("/api/recipaint", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = (req as AuthenticatedRequest).user!._id;
    const search = req.query.search as string;
    
    const query: any = { owner: userId };
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }
    
    const recipes = await Recipe.find(query)
      .populate("author", "username avatar")
      .populate("owner", "username avatar")
      .sort({ dateUpdated: -1 })
      .lean()
      .exec();

    return res.json({
      status: true,
      data: { recipes },
    });
  });

  // Get public recipes from other users
  app.get("/api/recipaint/public", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = (req as AuthenticatedRequest).user!._id;
    
    const recipes = await Recipe.find({
      isPublic: true,
      owner: { $ne: userId },
    })
      .populate("author", "username avatar")
      .populate("owner", "username avatar")
      .sort({ dateUpdated: -1 })
      .lean()
      .exec();

    return res.json({
      status: true,
      data: { recipes },
    });
  });

  // Get single recipe
  app.get("/api/recipaint/:id",authenticateToken, async function (req: express.Request, res: express.Response) {
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

    // Delete associated assets from public GCS
    if (recipe.showcase && recipe.showcase.length > 0) {
      for (const assetUrl of recipe.showcase) {
        if (assetUrl && assetUrl.startsWith("http")) {
          const urlParts = assetUrl.split("/");
          const filename = urlParts[urlParts.length - 1];
          const gcsPath = `recipaint-assets/${filename}`;
          await deleteFromGCS(gcsPath).catch(() => {
            // Ignore errors if file doesn't exist
          });
        }
      }
    }

    // Delete step images
    if (recipe.steps && recipe.steps.length > 0) {
      for (const step of recipe.steps) {
        if (step && typeof step === "object" && "images" in step && Array.isArray(step.images)) {
          for (const imageUrl of step.images) {
            if (imageUrl && typeof imageUrl === "string" && imageUrl.startsWith("http")) {
              const urlParts = imageUrl.split("/");
              const filename = urlParts[urlParts.length - 1];
              const gcsPath = `recipaint-assets/${filename}`;
              await deleteFromGCS(gcsPath).catch(() => {
                // Ignore errors if file doesn't exist
              });
            }
          }
        }
      }
    }

    await Recipe.findByIdAndDelete(recipeId).exec();

    return res.json({
      status: true,
      message: "Recipe deleted successfully",
    });
  });

  // Upload recipaint asset endpoint
  app.post("/api/recipaint/upload-asset", authenticateToken, multerUploadRecipaintAsset.single("asset"), async function (req: express.Request, res: express.Response) {
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
  });

  // Delete recipaint asset endpoint
  app.delete("/api/recipaint/asset", authenticateToken, async function (req: express.Request, res: express.Response) {
    const assetUrl = req.query.assetUrl as string;
    
    if (!assetUrl) {
      return res.status(400).json({
        status: false,
        message: "Asset URL is required",
      });
    }

    // Delete from public GCS bucket
    // assetUrl is a public URL, extract the path
    if (assetUrl.startsWith("http")) {
      const urlParts = assetUrl.split("/");
      const filename = urlParts[urlParts.length - 1];
      const gcsPath = `recipaint-assets/${filename}`;
      await deleteFromGCS(gcsPath, false).catch(() => {
        // Ignore errors if file doesn't exist
      });
    } else {
      // If it's already a GCS path, use it directly
      await deleteFromGCS(assetUrl, false).catch(() => {
        // Ignore errors if file doesn't exist
      });
    }

    return res.json({
      status: true,
      message: "Asset deleted successfully",
    });
  });

  // Clone recipe endpoint
  app.post("/api/recipaint/:id/clone", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = (req as AuthenticatedRequest).user!._id;
    const recipeId = req.params.id;
    
    const originalRecipe = await Recipe.findById(recipeId)
      .populate("author", "username avatar")
      .lean()
      .exec();

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
    const authorId = originalRecipe.author && typeof originalRecipe.author === "object" && "_id" in originalRecipe.author
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
