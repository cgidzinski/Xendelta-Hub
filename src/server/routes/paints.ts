import express = require("express");
import { authenticateToken } from "../middleware/auth";
import { AuthenticatedRequest } from "../types";
import { isSameId } from "../utils/objectId";
import { normalizePaintInput } from "../../shared/recipaint/paints";
const { Paint } = require("../models/paint");
const mongoose = require("mongoose");
const {
  Types: { ObjectId },
} = mongoose;

// The user's paint collection.
//
// Mounted at /api/paints rather than under /api/recipaint, even though the page lives inside
// Recipaint. Express matches in registration order, so a literal path under /api/recipaint
// declared in a second route file would be swallowed by /api/recipaint/:id unless this file
// happened to be required first - the exact shadowing bug that broke DELETE
// /api/recipaint/asset. A distinct prefix cannot be shadowed whatever the require order.

const DUPLICATE_KEY = 11000;

module.exports = function (app: express.Application) {
  // List the caller's paints, newest brands grouped naturally by brand then name.
  app.get("/api/paints", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = (req as AuthenticatedRequest).user!._id;

    const paints = await Paint.find({ owner: new ObjectId(userId) })
      .sort({ brand: 1, name: 1 })
      .lean()
      .exec();

    return res.json({
      status: true,
      data: { paints },
    });
  });

  // Add a paint to the collection.
  app.post("/api/paints", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = (req as AuthenticatedRequest).user!._id;

    // normalizePaintInput takes brand/name/range/hex/type/quantity/catalogueKey and derives
    // the range-aware dedupe key; anything else in the body is ignored.
    const normalized = normalizePaintInput(req.body);
    if (!normalized) {
      return res.status(400).json({
        status: false,
        message: "A paint needs a name",
      });
    }

    try {
      const paint = new Paint({ ...normalized, owner: userId });
      await paint.save();
      return res.json({
        status: true,
        message: "Paint added",
        data: { paint: paint.toObject() },
      });
    } catch (error: any) {
      // The unique index is the only thing enforcing "one entry per paint"; a race between
      // two adds lands here rather than creating a duplicate.
      if (error?.code === DUPLICATE_KEY) {
        return res.status(409).json({
          status: false,
          message: "That paint is already in your collection",
        });
      }
      throw error;
    }
  });

  // Update a paint (rename, recolour, retype, or change how many you own).
  app.put("/api/paints/:paintId", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = (req as AuthenticatedRequest).user!._id;

    const paint = await Paint.findById(req.params.paintId).exec();
    if (!paint) {
      return res.status(404).json({ status: false, message: "Paint not found" });
    }
    if (!isSameId(paint.owner, userId)) {
      return res.status(403).json({ status: false, message: "Access denied" });
    }

    // Merge onto the stored values so a partial update (e.g. quantity only) keeps the rest,
    // and re-derive the key: renaming a paint changes its identity.
    const normalized = normalizePaintInput({
      brand: req.body.brand ?? paint.brand,
      name: req.body.name ?? paint.name,
      range: req.body.range ?? paint.range,
      hex: req.body.hex ?? paint.hex,
      type: req.body.type ?? paint.type,
      quantity: req.body.quantity ?? paint.quantity,
      catalogueKey: req.body.catalogueKey ?? paint.catalogueKey,
    });
    if (!normalized) {
      return res.status(400).json({ status: false, message: "A paint needs a name" });
    }

    Object.assign(paint, normalized);

    try {
      await paint.save();
    } catch (error: any) {
      if (error?.code === DUPLICATE_KEY) {
        return res.status(409).json({
          status: false,
          message: "Another paint in your collection already has that brand, range and name",
        });
      }
      throw error;
    }

    return res.json({
      status: true,
      message: "Paint updated",
      data: { paint: paint.toObject() },
    });
  });

  // Remove a paint from the collection. Recipes are untouched - their steps hold their own
  // snapshot, so a recipe never loses its paint list because the shelf changed.
  app.delete("/api/paints/:paintId", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = (req as AuthenticatedRequest).user!._id;

    const paint = await Paint.findById(req.params.paintId).exec();
    if (!paint) {
      return res.status(404).json({ status: false, message: "Paint not found" });
    }
    if (!isSameId(paint.owner, userId)) {
      return res.status(403).json({ status: false, message: "Access denied" });
    }

    await Paint.findByIdAndDelete(paint._id).exec();

    return res.json({ status: true, message: "Paint removed" });
  });
};
