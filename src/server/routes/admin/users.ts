import express = require("express");
const { User } = require("../../models/user");
import { authenticateToken } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/admin";

module.exports = function (app: express.Application) {
  app.get("/api/admin/users", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
    const users = await User.find({}, "username email _id roles avatar canRespond").exec();
    
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
          canRespond: user.canRespond !== false, // Default to true if not set
        })),
      },
    });
  });

  app.put("/api/admin/users/:userId/roles", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
    const { userId } = req.params;
    const { roles } = req.body;

    if (!Array.isArray(roles)) {
      return res.status(400).json({
        status: false,
        message: "Roles must be an array",
      });
    }

    const user = await User.findOne({ _id: userId }).exec();
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    // Normalize all roles to lowercase
    user.roles = roles.map((role: string) => role.toLowerCase());
    await user.save();

    return res.json({
      status: true,
      message: "User roles updated successfully",
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

  app.put("/api/admin/users/:userId/booleans", authenticateToken, requireAdmin, async function (req: express.Request, res: express.Response) {
    const { userId } = req.params;
    const { canRespond } = req.body;

    const user = await User.findOne({ _id: userId }).exec();
    if (!user) {
      return res.status(404).json({
        status: false,
        message: "User not found",
      });
    }

    if (canRespond !== undefined) {
      user.canRespond = canRespond;
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
          canRespond: user.canRespond !== false,
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

    const adminUser = (req as any).adminUser;
    if (userId === adminUser._id.toString()) {
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

