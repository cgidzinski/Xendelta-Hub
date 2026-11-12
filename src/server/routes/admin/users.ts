import express = require("express");
import { usageFor, usageForAll } from "../../utils/xendriveUtils";
import {
  adminGrantItemSchema,
  adminUpdateUserSchema,
  adminUserIdParamSchema,
  adminUserItemParamSchema,
  validate,
  validateParams,
} from "../../utils/validation";
import { User } from "../../models/user";
import { authenticateToken } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/admin";
import { AuthenticatedRequest } from "../../types";

import { ITEMS } from "../../constants/items";
import { Notification } from "../../models/notification";
import { SocketManager } from "../../infrastructure/SocketManager";

module.exports = function (app: express.Application) {
  app.get(
    "/api/admin/users",
    authenticateToken,
    requireAdmin,
    async function (_req: express.Request, res: express.Response) {
      const users = await User.find({}, "username email _id roles avatar xendrive gems inventory").exec();
      const usage = await usageForAll();

      return res.json({
        status: true,
        message: "",
        data: {
          users: users.map((user: any) => {
            const { fileCount, spaceUsed } = usage.get(user._id.toString()) ?? { fileCount: 0, spaceUsed: 0 };

            return {
              _id: user._id,
              username: user.username,
              email: user.email,
              roles: (user.roles || []).map((role: string) => role.toLowerCase()),
              avatar: user.avatar,
              gems: user.gems || 0,
              inventory: user.inventory || [],
              xendrive: {
                fileCount,
                spaceUsed,
                spaceAllowed: user.xendrive?.spaceAllowed || 0,
              },
            };
          }),
        },
      });
    },
  );

  app.put(
    "/api/admin/users/:userId",
    authenticateToken,
    requireAdmin,
    validateParams(adminUserIdParamSchema),
    validate(adminUpdateUserSchema),
    async function (req: express.Request, res: express.Response) {
      const { userId } = req.params;
      const { roles, xendriveQuota } = req.body;

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

      if (xendriveQuota !== undefined) {
        if (typeof xendriveQuota !== "number" || xendriveQuota < 0) {
          return res.status(400).json({
            status: false,
            message: "XenDrive quota must be a non-negative number",
          });
        }
        // Initialize xendrive if it doesn't exist
        if (!user.xendrive) {
          user.xendrive = { spaceAllowed: 0 };
        }
        user.xendrive.spaceAllowed = xendriveQuota;
      }

      await user.save();

      // Get updated quota stats
      const { fileCount, spaceUsed } = await usageFor(user._id.toString());

      return res.json({
        status: true,
        message: "User updated successfully",
        data: {
          user: {
            _id: user._id,
            username: user.username,
            email: user.email,
            roles: user.roles,
            xendrive: {
              fileCount,
              spaceUsed,
              spaceAllowed: user.xendrive?.spaceAllowed || 0,
            },
          },
        },
      });
    },
  );

  app.post(
    "/api/admin/users/:userId/avatar/reset",
    authenticateToken,
    requireAdmin,
    validateParams(adminUserIdParamSchema),
    async function (req: express.Request, res: express.Response) {
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
    },
  );

  app.delete(
    "/api/admin/users/:userId",
    authenticateToken,
    requireAdmin,
    validateParams(adminUserIdParamSchema),
    async function (req: express.Request, res: express.Response) {
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
    },
  );

  app.post(
    "/api/admin/users/:userId/give-item",
    authenticateToken,
    requireAdmin,
    validateParams(adminUserIdParamSchema),
    validate(adminGrantItemSchema),
    async function (req: express.Request, res: express.Response) {
      const { userId } = req.params;
      const { itemKey } = req.body;

      if (!itemKey) {
        return res.status(400).json({
          status: false,
          message: "Item key is required",
        });
      }

      const item = ITEMS[itemKey];

      // A gift only lands in the inventory; the person redeems it themselves. Applying the effect here as
      // well used to leave the item redeemable, so a gifted voucher paid out twice.
      if (!item || item.legacy) {
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
        socketManager.sendNotification(user._id.toString(), notification);
      } catch (err) {
        console.error("Failed to emit socket notification:", err);
      }

      return res.json({
        status: true,
        message: `Gave ${item.name} to ${user.username}`,
      });
    },
  );

  app.delete(
    "/api/admin/users/:userId/inventory/:itemKey",
    authenticateToken,
    requireAdmin,
    validateParams(adminUserItemParamSchema),
    async function (req: express.Request, res: express.Response) {
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
    },
  );
};
