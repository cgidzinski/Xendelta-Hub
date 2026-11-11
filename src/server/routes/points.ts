import express = require("express");
import { authenticateToken } from "../middleware/auth";
import { AuthenticatedRequest } from "../types";
import { ShopItem } from "../types/shopItem";
const mongoose = require("mongoose");
const { User } = require("../models/user");
const { SHOP_ITEMS } = require("../constants/shopItems");
const { ITEMS } = require("../constants/items");

module.exports = function (app: express.Application) {
  //Get points shop items
  app.get("/api/points/shop", authenticateToken, async function (_req: express.Request, res: express.Response) {
    const itemsWithDetails = SHOP_ITEMS.map((shopItem: ShopItem) => ({
      ...shopItem,
      item: ITEMS[shopItem.itemKey],
    }));
    return res.json({
      status: true,
      data: { items: itemsWithDetails },
    });
  });

  //Buy items
  app.post("/api/points/redeemItem", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = (req as AuthenticatedRequest).user!._id;
    const itemId = typeof req.body?.itemId === "string" ? req.body.itemId : undefined;

    const shopItem: ShopItem | undefined = SHOP_ITEMS.find((item: ShopItem) => item.id === itemId);
    if (!shopItem) {
      return res.status(404).json({
        status: false,
        message: "Item not found",
      });
    }

    // One atomic update: the balance check, the deduction and the inventory grant happen
    // together in Mongo, so two simultaneous purchases can't both pass the check and
    // spend the same points (the old read-modify-save allowed that).
    const inventoryId = new mongoose.Types.ObjectId();
    const grant = shopItem.addToInventory !== false;
    const item = ITEMS[shopItem.itemKey];
    const update: any = { $inc: { points: -shopItem.price } };
    if (grant) {
      update.$push = {
        inventory: {
          _id: inventoryId,
          itemKey: shopItem.itemKey,
          name: item.name,
          description: item.description,
          image: item.image,
          redeemable: item.redeemable,
          purchasedAt: new Date(),
          used: false,
        },
      };
    }

    const updated = await User.findOneAndUpdate({ _id: userId, points: { $gte: shopItem.price } }, update, {
      new: true,
    }).exec();

    if (!updated) {
      const exists = await User.exists({ _id: userId });
      return exists
        ? res.json({ status: false, message: "Insufficient points" })
        : res.status(404).json({ status: false, message: "User not found" });
    }

    if (shopItem.onPurchase) {
      try {
        await shopItem.onPurchase(updated);
      } catch (e) {
        // Roll the purchase back rather than keep the points for nothing.
        console.error("Shop onPurchase failed, refunding:", e);
        await User.updateOne(
          { _id: userId },
          { $inc: { points: shopItem.price }, ...(grant ? { $pull: { inventory: { _id: inventoryId } } } : {}) },
        ).exec();
        return res.status(500).json({ status: false, message: "Purchase failed" });
      }
    }

    return res.json({
      status: true,
      message: "Points redeemed successfully",
    });
  });
};
