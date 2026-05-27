import express = require("express");
import { authenticateToken } from "../middleware/auth";
import { AuthenticatedRequest } from "../types";
import { ShopItem } from "../types/shopItem";
const { User } = require("../models/user");
const { SHOP_ITEMS } = require("../constants/shopItems");
const { ITEMS } = require("../constants/items");

module.exports = function (app: express.Application) {

    //Get points shop items
    app.get("/api/points/shop", authenticateToken, async function (req: express.Request, res: express.Response) {
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
        const { itemId } = req.body;

        const shopItem: ShopItem | undefined = SHOP_ITEMS.find((item: ShopItem) => item.id === itemId);
        if (!shopItem) {
            return res.status(404).json({
                status: false,
                message: "Item not found",
            });
        }

        const user = await User.findById(userId).exec();

        if (!user) {
            return res.status(404).json({
                status: false,
                message: "User not found",
            });
        }

        if (user.points < shopItem.price) {
            return res.json({
                status: false,
                message: "Insufficient points",
            });
        }

        // Run onPurchase if it exists
        if (shopItem.onPurchase) {
            await shopItem.onPurchase(user);
        }

        // Add to inventory if addToInventory is true (default)
        if (shopItem.addToInventory !== false) {
            const item = ITEMS[shopItem.itemKey];
            user.inventory.push({
                itemKey: shopItem.itemKey,
                name: item.name,
                description: item.description,
                image: item.image,
                redeemable: item.redeemable,
                purchasedAt: new Date(),
                used: false,
            });
        }

        user.points -= shopItem.price;
        await user.save();

        return res.json({
            status: true,
            message: "Points redeemed successfully",
        });
    });
};