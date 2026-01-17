import express = require("express");
import { authenticateToken } from "../middleware/auth";
import { AuthenticatedRequest } from "../types";
const { User } = require("../models/user");

module.exports = function (app: express.Application) {

    const pointsShopItems = [
        {
            id: "1",
            name: "Free 1000 Points",
            description: "Get 1000 points for free",
            price: -1000,
            image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQDjzenTPwlSFWa0lUXHTtHLoX18nv8D4fyTA&s",
            function: async (userId: string) => {
                console.log("Item 1 function");
            }
        },
        {
            id: "2",
            name: "1GB XenBox Space",
            description: "Get 1GB of XenBox space",
            price: 1000,
            image: "https://cdn-icons-png.flaticon.com/512/4008/4008946.png",
            function: async (userId: string) => {
                const user = await User.findById(userId).exec();
                if (!user) {
                    throw new Error("User not found");
                }
                user.xenbox.spaceAllowed += 1024 * 1024 * 1024;
                await user.save();
            }
        },
        {
            id: "3",
            name: "Item 3",
            description: "Description 3",
            price: 300,
            image: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSxvaPt8IsliozniJc7g__qxXBMDb3Wzi6E1A&s",
            function: async (userId: string) => {
                console.log("Item 3 function");
            }
        },
    ];
    //Get points shop items
    app.get("/api/points/shop", authenticateToken, async function (req: express.Request, res: express.Response) {
        const items = pointsShopItems.map((item) => ({
            id: item.id,
            name: item.name,
            description: item.description,
            price: item.price,
            image: item.image,
        }));
        return res.json({
            status: true,
            data: { items },
        });
    });

    //Buy items
    app.post("/api/points/redeemItem", authenticateToken, async function (req: express.Request, res: express.Response) {
        const userId = (req as AuthenticatedRequest).user!._id;
        const { itemId } = req.body;

        const item = pointsShopItems.find((item) => item.id === itemId);
        if (!item) {
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

        if (user.points < item.price) {
            return res.json({
                status: false,
                message: "Insufficient points",
            });
        }

        user.points -= item.price;
        await item.function(userId).catch((error: any) => {
            return res.status(500).json({
                status: false,
                message: error.message,
            });
        });
        await user.save();

        return res.json({
            status: true,
            message: "Points redeemed successfully",
        });
    });


    // // Redeem points
    // app.post("/api/points/redeem", authenticateToken, async function (req: express.Request, res: express.Response) {
    //     const userId = (req as AuthenticatedRequest).user!._id;
    //     const { points } = req.body;

    //     const user = await User.findById(userId).exec();

    //     if (!user) {
    //         return res.status(404).json({
    //             status: false,
    //             message: "User not found",
    //         });
    //     }

    //     user.points -= points;
    // });
};
