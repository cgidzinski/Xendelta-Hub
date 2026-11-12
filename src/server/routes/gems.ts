import express = require("express");
import { buyShopItemSchema, gemCheckoutSchema, validate } from "../utils/validation";
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
import { GEM_PACKS, findGemPack } from "@shared/monetization";

const isAdmin = (roles: string[] | undefined) => (roles || []).some((r) => r.toLowerCase() === "admin");

module.exports = function (app: express.Application) {
  // The shop's items, with their details attached.
  app.get("/api/gems/shop", authenticateToken, async function (_req: express.Request, res: express.Response) {
    const itemsWithDetails = SHOP_ITEMS.map((shopItem: ShopItem) => ({
      ...shopItem,
      item: ITEMS[shopItem.itemKey],
    }));
    return res.json({
      status: true,
      data: { items: itemsWithDetails },
    });
  });

  // Buy an item with gems.
  app.post(
    "/api/gems/shop/buy",
    authenticateToken,
    validate(buyShopItemSchema),
    async function (req: express.Request, res: express.Response) {
      const userId = (req as AuthenticatedRequest).user!._id;
      const itemId = typeof req.body?.itemId === "string" ? req.body.itemId : undefined;

      const shopItem: ShopItem | undefined = SHOP_ITEMS.find((item: ShopItem) => item.id === itemId);
      if (!shopItem) throw new AppError(404, "Item not found");

      // One atomic update: the balance check, the deduction and the inventory grant happen
      // together in Mongo, so two simultaneous purchases can't both pass the check and
      // spend the same gems (the old read-modify-save allowed that).
      const inventoryId = new mongoose.Types.ObjectId();
      const grant = shopItem.addToInventory !== false;
      const item = ITEMS[shopItem.itemKey];
      const update: any = { $inc: { gems: -shopItem.price } };
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

      const updated = await User.findOneAndUpdate({ _id: userId, gems: { $gte: shopItem.price } }, update, {
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
            { $inc: { gems: shopItem.price }, ...(grant ? { $pull: { inventory: { _id: inventoryId } } } : {}) },
          ).exec();
          throw new AppError(500, "Purchase failed");
        }
      }

      return res.json({ status: true, message: `Purchased ${item.name}` });
    },
  );

  // The gem packs on sale, and whether buying them is switched on for this person.
  app.get("/api/gems/packs", authenticateToken, async function (req: express.Request, res: express.Response) {
    const caller = await loadCaller(req);
    const provider = getPaymentProvider();
    const available = !!provider && canUseProvider(provider, isAdmin(caller.roles));
    return res.json({
      status: true,
      data: { packs: GEM_PACKS, available, testMode: !!provider?.isTest },
    });
  });

  // Buy a pack of gems.
  app.post(
    "/api/gems/checkout",
    authenticateToken,
    validate(gemCheckoutSchema),
    async function (req: express.Request, res: express.Response) {
      const caller = await loadCaller(req);
      const provider = getPaymentProvider();
      if (!provider || !canUseProvider(provider, isAdmin(caller.roles))) {
        throw new AppError(503, "Gem purchases are not available yet");
      }
      const pack = findGemPack(req.body.packId);
      if (!pack) throw new AppError(404, "Pack not found");

      const purchase = await GemPurchase.create({
        user: caller._id,
        packId: pack.id,
        gems: pack.gems,
        amountCents: pack.priceCents,
        currency: pack.currency,
        provider: provider.name,
      });

      let result;
      try {
        result = await provider.startCheckout({
          purchaseId: purchase._id.toString(),
          userId: caller._id.toString(),
          pack,
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
    },
  );
};
