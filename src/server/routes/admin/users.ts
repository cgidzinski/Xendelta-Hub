import express = require("express");
const { User } = require("../../models/user");
import { authenticateToken } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/admin";
import { AuthenticatedRequest } from "../../types";

const { ITEMS } = require("../../constants/items");
const Notification = require("../../models/notification");
const { SocketManager } = require("../../infrastructure/SocketManager");

module.exports = function (app: express.Application) {
  app.get("/api/admin/users", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
    const users = await User.find({}, "username email _id roles avatar xenbox points inventory").populate("xenbox.files").exec();
    
    return res.json({
      status: true,
      message: "",
      data: {
        users: users.map((user: any) => {
          // Calculate quota stats
          const xenboxFiles = user.xenbox?.files || [];
          const fileCount = xenboxFiles.length;
          const spaceUsed = xenboxFiles.reduce((acc: number, file: any) => acc + (file?.size || 0), 0);
          
          return {
            _id: user._id,
            username: user.username,
            email: user.email,
            roles: (user.roles || []).map((role: string) => role.toLowerCase()),
            avatar: user.avatar,
            points: user.points || 0,
            inventory: user.inventory || [],
            xenbox: {
              fileCount,
              spaceUsed,
              spaceAllowed: user.xenbox?.spaceAllowed || 0,
            },
          };
        }),
      },
    });
  });

  app.put("/api/admin/users/:userId", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
    const { userId } = req.params;
    const { roles, xenboxQuota } = req.body;

    const user = await User.findOne({ _id: userId }).exec();
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    if (roles !== undefined) {
      if (!Array.isArray(roles)) {
        return res.status(400).json({
          status: false,
          message: "Roles must be an array",
        });
      }
      // Normalize all roles to lowercase
      user.roles = roles.map((role: string) => role.toLowerCase());
    }

    if (xenboxQuota !== undefined) {
      if (typeof xenboxQuota !== "number" || xenboxQuota < 0) {
        return res.status(400).json({
          status: false,
          message: "XenBox quota must be a non-negative number",
        });
      }
      // Initialize xenbox if it doesn't exist
      if (!user.xenbox) {
        user.xenbox = { files: [], spaceAllowed: 0 };
      }
      user.xenbox.spaceAllowed = xenboxQuota;
    }

    await user.save();

    // Get updated quota stats
    await user.populate("xenbox.files");
    const xenboxFiles = user.xenbox?.files || [];
    const fileCount = xenboxFiles.length;
    const spaceUsed = xenboxFiles.reduce((acc: number, file: any) => acc + (file?.size || 0), 0);

    return res.json({
      status: true,
      message: "User updated successfully",
      data: {
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          roles: user.roles,
          xenbox: {
            fileCount,
            spaceUsed,
            spaceAllowed: user.xenbox?.spaceAllowed || 0,
          },
        },
      },
    });
  });

  app.post("/api/admin/users/:userId/avatar/reset", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
    const { userId } = req.params;

    const user = await User.findOne({ _id: userId }).exec();
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    user.avatar = "/avatars/default-avatar.png";
    await user.save();

    return res.json({
      status: true,
      message: "Avatar reset successfully",
      data: {
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatar,
        },
      },
    });
  });

  app.delete("/api/admin/users/:userId", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
    const { userId } = req.params;

    const currentUserId = (req as AuthenticatedRequest).user!._id;
    if (userId === currentUserId) {
      return res.status(400).json({
        status: false,
        message: "Cannot delete yourself",
      });
    }

    const user = await User.findOne({ _id: userId }).exec();
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    await User.deleteOne({ _id: userId }).exec();

    return res.json({
      status: true,
      message: "User deleted successfully",
    });
  });

  app.post("/api/admin/users/:userId/give-item", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
    const { userId } = req.params;
    const { itemKey } = req.body;

    if (!itemKey) {
      return res.status(400).json({
        status: false,
        message: "Item key is required",
      });
    }

    const item = ITEMS[itemKey];

    if (!item) {
      return res.status(404).json({
        status: false,
        message: "Item not found",
      });
    }

    const user = await User.findOne({ _id: userId }).exec();

    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    user.inventory.push({
      itemKey: item.key,
      name: item.name,
      description: item.description,
      image: item.image,
      redeemable: item.redeemable,
      purchasedAt: new Date(),
      used: false,
    });

    await user.save();

    // Apply item effects if it has an apply function (for immediate effects like points)
    if (item.apply) {
      await item.apply(user);
    }

    // Create notification for the user
    const notification = new Notification({
      userId: user._id,
      title: "You got a gift!",
      message: `You received a ${item.name}`,
      icon: "announcement",
      unread: true,
      time: new Date(),
    });
    await notification.save();

    // Emit socket event for real-time notification (non-blocking)
    try {
      const socketManager = SocketManager.getInstance();
      socketManager.emitToUser(user._id.toString(), "notification", notification);
    } catch (err) {
      console.error("Failed to emit socket notification:", err);
    }

    return res.json({
      status: true,
      message: `Gave ${item.name} to ${user.username}`,
    });
  });

  app.delete("/api/admin/users/:userId/inventory/:itemKey", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
    const { userId, itemKey } = req.params;

    const user = await User.findOne({ _id: userId }).exec();
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    const itemIndex = user.inventory.findIndex((item: any) => item.itemKey === itemKey);
    if (itemIndex === -1) {
      return res.status(404).json({
        status: false,
        message: "Item not found in user inventory",
      });
    }

    user.inventory.splice(itemIndex, 1);
    await user.save();

    return res.json({
      status: true,
      message: `Removed ${itemKey} from ${user.username}`,
    });
  });
};

