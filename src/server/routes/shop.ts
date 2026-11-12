import express = require("express");
import { buyShopItemSchema, validate } from "../utils/validation";
import { authenticateToken } from "../middleware/auth";
import { AuthenticatedRequest } from "../types";
import { ShopItem } from "../types/shopItem";
const mongoose = require("mongoose");
import { User } from "../models/user";
import { GemPurchase } from "../models/gemPurchase";
import { SHOP_ITEMS } from "../constants/shopItems";
import { ITEMS } from "../constants/items";
import { AppError, loadCaller } from "../utils/http";
import { canUseProvider, fulfilGemPurchase, getPaymentProvider } from "../payments";

const isAdmin = (roles: string[] | undefined) => (roles || []).some((r) => r.toLowerCase() === "admin");

module.exports = function (app: express.Application) {
  // Everything the Shop sells, gem packs included, and whether paying with money is switched on for this person.
  app.get("/api/shop", authenticateToken, async function (req: express.Request, res: express.Response) {
    const caller = await loadCaller(req);
    const provider = getPaymentProvider();
    const available = !!provider && canUseProvider(provider, isAdmin(caller.roles));
    const items = SHOP_ITEMS.map((shopItem: ShopItem) => ({ ...shopItem, item: ITEMS[shopItem.itemKey] }));
    return res.json({
      status: true,
      data: { items, payments: { available, testMode: !!provider?.isTest } },
    });
  });

  // Buy any item. Items priced in gems are paid for from the balance; items priced in money (the gem packs) go
  // through the payment provider and then add their gems.
  app.post(
    "/api/shop/buy",
    authenticateToken,
    validate(buyShopItemSchema),
    async function (req: express.Request, res: express.Response) {
      const itemId = typeof req.body?.itemId === "string" ? req.body.itemId : undefined;
      const shopItem: ShopItem | undefined = SHOP_ITEMS.find((item: ShopItem) => item.id === itemId);
      if (!shopItem) throw new AppError(404, "Item not found");

      if (shopItem.priceCents !== undefined) return buyWithMoney(req, res, shopItem);
      return buyWithGems(req, res, shopItem);
    },
  );
};

async function buyWithGems(req: express.Request, res: express.Response, shopItem: ShopItem) {
  const userId = (req as AuthenticatedRequest).user!._id;
  const price = shopItem.price;
  if (price === undefined) throw new AppError(500, "Item has no price");

  // One atomic update: the balance check, the deduction and the inventory grant happen
  // together in Mongo, so two simultaneous purchases can't both pass the check and
  // spend the same gems (the old read-modify-save allowed that).
  const inventoryId = new mongoose.Types.ObjectId();
  const grant = shopItem.addToInventory !== false;
  const item = ITEMS[shopItem.itemKey];
  const update: any = { $inc: { gems: -price } };
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

  const updated = await User.findOneAndUpdate({ _id: userId, gems: { $gte: price } }, update, {
    new: true,
  }).exec();

  if (!updated) {
    const exists = await User.exists({ _id: userId });
    if (!exists) throw new AppError(404, "User not found");
    return res.json({ status: false, message: "Not enough gems" });
  }

  if (shopItem.onPurchase) {
    try {
      await shopItem.onPurchase(updated);
    } catch (e) {
      // Roll the purchase back rather than keep the gems for nothing.
      console.error("Shop onPurchase failed, refunding:", e);
      await User.updateOne(
        { _id: userId },
        { $inc: { gems: price }, ...(grant ? { $pull: { inventory: { _id: inventoryId } } } : {}) },
      ).exec();
      throw new AppError(500, "Purchase failed");
    }
  }

  return res.json({ status: true, message: `Purchased ${item.name}`, data: { result: "completed" } });
}

async function buyWithMoney(req: express.Request, res: express.Response, shopItem: ShopItem) {
  const caller = await loadCaller(req);
  const provider = getPaymentProvider();
  if (!provider || !canUseProvider(provider, isAdmin(caller.roles))) {
    throw new AppError(503, "Buying this is not available yet");
  }
  const { priceCents, currency, grantsGems } = shopItem;
  if (priceCents === undefined || !currency || !grantsGems) throw new AppError(500, "Item is not for sale");

  const purchase = await GemPurchase.create({
    user: caller._id,
    itemId: shopItem.id,
    gems: grantsGems,
    amountCents: priceCents,
    currency,
    provider: provider.name,
  });

  let result;
  try {
    result = await provider.startCheckout({
      purchaseId: purchase._id.toString(),
      userId: caller._id.toString(),
      itemId: shopItem.id,
      amountCents: priceCents,
      currency,
    });
  } catch (e) {
    console.error("Payment provider failed:", e);
    await GemPurchase.updateOne({ _id: purchase._id }, { $set: { status: "failed" } }).exec();
    throw new AppError(502, "The payment could not be started");
  }

  if (result.kind === "redirect") {
    return res.json({ status: true, data: { result: "redirect", url: result.url } });
  }
  const gems = await fulfilGemPurchase(purchase._id.toString(), result.providerRef);
  return res.json({
    status: true,
    message: `${gems.toLocaleString()} gems added`,
    data: { result: "completed", gems },
  });
}
