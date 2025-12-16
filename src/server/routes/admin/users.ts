import express = require("express");
const { User } = require("../../models/user");
import { authenticateToken } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/admin";
import { AuthenticatedRequest } from "../../types";

module.exports = function (app: express.Application) {
  app.get("/api/admin/users", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
    const users = await User.find({}, "username email _id roles avatar").exec();
    
    return res.json({
      status: true,
      message: "",
      data: {
        users: users.map((user: any) => ({
          _id: user._id,
          username: user.username,
          email: user.email,
          roles: (user.roles || []).map((role: string) => role.toLowerCase()),
          avatar: user.avatar,
        })),
      },
    });
  });

  app.put("/api/admin/users/:userId", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
    const { userId } = req.params;
    const { roles } = req.body;

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

    await user.save();

    return res.json({
      status: true,
      message: "User updated successfully",
      data: {
        user: {
          _id: user._id,
          username: user.username,
          email: user.email,
          roles: user.roles,
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
};

