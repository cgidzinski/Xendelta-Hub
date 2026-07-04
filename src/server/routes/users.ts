import express = require("express");
const { User } = require("../models/user");
const Notification = require("../models/notification");
const { ITEMS } = require("../constants/items");
import { authenticateToken } from "../middleware/auth";
import { SocketManager } from "../infrastructure/SocketManager";
import { uploadAvatarFile } from "../utils/mediaUtils";
import { deleteFromGCS } from "../utils/gcsUtils";
import { validate, updateProfileSchema } from "../utils/validation";
import { upload } from "../config/multer";
import { AuthenticatedRequest } from "../types";

module.exports = function (app: express.Application) {
  app.get("/api/user/profile", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = (req as AuthenticatedRequest).user!._id;
    const user = await User.findOne({ _id: userId })
      .populate("xenbox.files")
      .exec();

    // Check if user has any unread messages in any conversation
    // user.conversations now contains metadata with unread flag
    const hasUnreadMessages = (user.conversations || []).some((convMetadata: any) => {
      return convMetadata.unread === true;
    });

    // Check for unread notifications in separate collection
    const unreadNotificationsCount = await Notification.countDocuments({ userId, unread: true });
    const hasUnreadNotifications = unreadNotificationsCount > 0;

    // Check for new notifications since last checked
    const lastChecked = user.notificationsLastCheckedAt ? user.notificationsLastCheckedAt.toISOString() : new Date(0).toISOString();
    const hasNewNotifications = await Notification.exists({ userId, time: { $gt: lastChecked } });

    // Calculate xenbox quota stats from populated files
    const xenboxFiles = user.xenbox?.files || [];
    const fileCount = xenboxFiles.length;
    const spaceUsed = xenboxFiles.reduce((acc: number, file: any) => acc + (file?.size || 0), 0);
    return res.json({
      status: true,
      message: "",
      data: {
        user: {
          _id: user._id.toString(),
          username: user.username,
          email: user.email,
          avatar: user.avatar || "/avatars/default-avatar.png",
          roles: (user.roles || []).map((role: string) => role.toLowerCase()),
          points: user.points || 0,
          unread_messages: hasUnreadMessages,
          unread_notifications: hasUnreadNotifications,
          has_new_notifications: !!hasNewNotifications,
          pinnedApps: user.pinnedApps || [],
          xenbox: {
            fileCount: fileCount,
            spaceUsed: spaceUsed,
            spaceAllowed: user.xenbox?.spaceAllowed || 0,
          },
        },
      },
    });
  });

  app.put(
    "/api/user/profile",
    authenticateToken,
    validate(updateProfileSchema),
    async function (req: express.Request, res: express.Response) {
      const userId = (req as AuthenticatedRequest).user!._id;
      const { username } = req.body;
      const user = await User.findOne({ _id: userId }).exec();

      if (username !== undefined) {
        // Check uniqueness — reject if another user already has this username
        const existing = await User.findOne({ username, _id: { $ne: userId } }).exec();
        if (existing) {
          return res.status(400).json({
            status: false,
            message: "Username is already taken",
          });
        }
        user.username = username;
        await user.save();
      }

      const newNotification = new Notification({
        userId: userId,
        title: "Profile updated",
        message: "Your profile has been successfully updated",
        time: new Date().toISOString(),
        icon: "person",
        unread: true,
      });

      await newNotification.save();

      // Send socket notification
      const socketManager = SocketManager.getInstance();
      socketManager.sendNotification(userId.toString(), newNotification);
      return res.json({
        status: true,
        message: "",
        data: {
          user: {
            username: user.username,
            email: user.email,
            avatar: user.avatar || "/avatars/default-avatar.png",
            unread_messages: false,
            unread_notifications: true,
            has_new_notifications: true,
          },
        },
      });
    }
  );

  // Avatar upload endpoint
  app.post(
    "/api/user/avatar",
    authenticateToken,
    upload.single("avatar"),
    async function (req: express.Request, res: express.Response) {
      const user = await User.findOne({ _id: (req as AuthenticatedRequest).user!._id }).exec();

      if (!req.file) {
        return res.status(400).json({
          status: false,
          message: "No file uploaded",
        });
      }

      const userId = user._id.toString();

      // Delete old avatar from public GCS if it exists (only if it's a GCS URL, not local default)
      if (user.avatar && user.avatar.startsWith("http")) {
        // Extract filename from URL (e.g., "https://storage.googleapis.com/bucket/avatar/userid.jpg" -> "avatar/userid.jpg")
        const urlParts = user.avatar.split("/");
        const filename = urlParts[urlParts.length - 1];
        const gcsPath = `avatar/${filename}`;
        await deleteFromGCS(gcsPath).catch(() => {
          // Ignore errors if file doesn't exist
        });
      }

      // Upload new avatar to public GCS and get direct URL
      let url: string;
      try {
        const uploadResult = await uploadAvatarFile(req.file, userId);
        if (!uploadResult || !uploadResult.url) {
          console.error("Avatar upload failed: Invalid response from uploadAvatarFile", uploadResult);
          return res.status(500).json({
            status: false,
            message: "Failed to upload avatar: Invalid response from upload service",
          });
        }
        url = uploadResult.url;
        console.log("Avatar uploaded successfully:", url);
      } catch (error: any) {
        console.error("Avatar upload error:", error);
        console.error("Error stack:", error.stack);
        console.error("File info:", {
          originalname: req.file?.originalname,
          mimetype: req.file?.mimetype,
          size: req.file?.size,
        });
        return res.status(500).json({
          status: false,
          message: error.message || "Failed to upload avatar",
        });
      }

      // Store direct URL in user model
      user.avatar = url;
      await user.save();

      const newNotification = new Notification({
        userId: user._id,
        title: "Avatar updated",
        message: "Your avatar has been successfully updated",
        time: new Date().toISOString(),
        icon: "person",
        unread: true,
      });

      await newNotification.save();

      // Send socket notification
      const socketManager = SocketManager.getInstance();
      socketManager.sendNotification(user._id.toString(), newNotification);

      return res.json({
        status: true,
        message: "Avatar uploaded successfully",
        data: {
          avatar: url,
        },
      });
    }
  );

  // Get user's linked authentication providers
  app.get("/api/user/auth-providers", authenticateToken, async function (req: express.Request, res: express.Response) {
    try {
      const user = (req as AuthenticatedRequest).user!;
      const fullUser = await User.findById(user._id).exec();

      if (!fullUser) {
        return res.json({
          success: false,
          message: "User not found",
        });
      }

      const activeProviders = fullUser.getActiveProviders();

      return res.json({
        success: true,
        providers: activeProviders,
        canUnlinkLocal: activeProviders.length > 1 || !fullUser.hasAuthProvider("local"),
      });
    } catch (error) {
      console.error("Get auth providers error:", error);
      return res.json({
        success: false,
        message: "Failed to get authentication providers",
      });
    }
  });

  // Link Google account to existing account
  app.post("/api/user/link-google", authenticateToken, async function (req: express.Request, res: express.Response) {
    try {
      const user = (req as AuthenticatedRequest).user!;

      // Check if Google is already linked
      const fullUser = await User.findById(user._id).exec();
      if (fullUser.hasAuthProvider("google")) {
        return res.json({
          success: false,
          message: "Google account is already linked",
        });
      }

      return res.json({
        success: true,
        message: "Redirect to Google OAuth for account linking",
        redirectUrl: `/api/auth/google?state=link&userId=${user._id}`,
      });
    } catch (error) {
      console.error("Link Google account error:", error);
      return res.json({
        success: false,
        message: "Failed to initiate Google account linking",
      });
    }
  });

  // Link GitHub account to existing account
  app.post("/api/user/link-github", authenticateToken, async function (req: express.Request, res: express.Response) {
    try {
      const user = (req as AuthenticatedRequest).user!;

      // Check if GitHub is already linked
      const fullUser = await User.findById(user._id).exec();
      if (fullUser.hasAuthProvider("github")) {
        return res.json({
          success: false,
          message: "GitHub account is already linked",
        });
      }

      return res.json({
        success: true,
        message: "Redirect to GitHub OAuth for account linking",
        redirectUrl: `/api/auth/github?state=link&userId=${user._id}`,
      });
    } catch (error) {
      console.error("Link GitHub account error:", error);
      return res.json({
        success: false,
        message: "Failed to initiate GitHub account linking",
      });
    }
  });

  // Link Discord account to existing account
  app.post("/api/user/link-discord", authenticateToken, async function (req: express.Request, res: express.Response) {
    try {
      const user = (req as AuthenticatedRequest).user!;

      // Check if Discord is already linked
      const fullUser = await User.findById(user._id).exec();
      if (fullUser.hasAuthProvider("discord")) {
        return res.json({
          success: false,
          message: "Discord account is already linked",
        });
      }

      return res.json({
        success: true,
        message: "Redirect to Discord OAuth for account linking",
        redirectUrl: `/api/auth/discord?state=link&userId=${user._id}`,
      });
    } catch (error) {
      console.error("Link Discord account error:", error);
      return res.json({
        success: false,
        message: "Failed to initiate Discord account linking",
      });
    }
  });

  // Unlink authentication provider
  app.post(
    "/api/user/unlink-provider",
    authenticateToken,
    async function (req: express.Request, res: express.Response) {
      try {
        const user = (req as AuthenticatedRequest).user!;
        const { provider } = req.body;

        if (!provider) {
          return res.json({
            success: false,
            message: "Provider is required",
          });
        }

        const fullUser = await User.findById(user._id).exec();

        if (!fullUser.hasAuthProvider(provider)) {
          return res.json({
            success: false,
            message: `${provider} account is not linked`,
          });
        }

        // Prevent unlinking if it's the only authentication method
        const activeProviders = fullUser.getActiveProviders();
        if (activeProviders.length <= 1) {
          return res.json({
            success: false,
            message: "Cannot unlink the only authentication method. Please add another method first.",
          });
        }

        await fullUser.removeAuthProvider(provider);

        return res.json({
          success: true,
          message: `${provider} account unlinked successfully`,
          providers: fullUser.getActiveProviders(),
        });
      } catch (error) {
        console.error("Unlink provider error:", error);
        return res.json({
          success: false,
          message: "Failed to unlink authentication provider",
        });
      }
    }
  );

  // Add password to Google-only account
  app.post("/api/user/add-password", authenticateToken, async function (req: express.Request, res: express.Response) {
    try {
      const user = (req as AuthenticatedRequest).user!;
      const { password } = req.body;

      if (!password) {
        return res.json({
          success: false,
          message: "Password is required",
        });
      }

      const fullUser = await User.findById(user._id).exec();

      if (fullUser.password) {
        return res.json({
          success: false,
          message: "Account already has a password",
        });
      }

      fullUser.password = fullUser.generateHash(password);
      await fullUser.addAuthProvider("local", null, fullUser.email);

      return res.json({
        success: true,
        message: "Password added successfully. You can now sign in with email and password.",
        providers: fullUser.getActiveProviders(),
      });
    } catch (error) {
      console.error("Add password error:", error);
      return res.json({
        success: false,
        message: "Failed to add password",
      });
    }
  });

  // Get all users (for admin and message participant selection)
  app.get("/api/users", authenticateToken, async function (req: express.Request, res: express.Response) {
    const users = await User.find({}, "username email _id roles avatar").exec();

    return res.json({
      status: true,
      message: "",
      data: {
        users: users.map((user: any) => ({
          _id: user._id,
          username: user.username,
          email: user.email,
          avatar: user.avatar || "/avatars/default-avatar.png",
          roles: (user.roles || []).map((role: string) => role.toLowerCase()),
        })),
      },
    });
  });

  // Search users by username (for UserSelect autocomplete)
  app.get("/api/users/search", authenticateToken, async function (req: express.Request, res: express.Response) {
    const { q } = req.query;
    const currentUserId = (req as AuthenticatedRequest).user!._id;

    const query: any = {};
    if (q && typeof q === "string") {
      query.username = { $regex: q, $options: "i" };
    }

    const users = await User.find(query, "username _id avatar").limit(20).exec();

    return res.json({
      status: true,
      message: "",
      data: {
        users: users
          .filter((u: any) => u._id.toString() !== currentUserId.toString())
          .map((user: any) => ({
            _id: user._id,
            username: user.username,
            avatar: user.avatar || "/avatars/default-avatar.png",
          })),
      },
    });
  });

  // Get user's pinned apps
  app.get("/api/user/pinned-apps", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = (req as AuthenticatedRequest).user!._id;
    const user = await User.findById(userId).exec();
    return res.json({
      status: true,
      data: { pinnedApps: user.pinnedApps || [] },
    });
  });

  // Update user's pinned apps
  app.put("/api/user/pinned-apps", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = (req as AuthenticatedRequest).user!._id;
    const { pinnedApps } = req.body;
    const user = await User.findById(userId).exec();
    user.pinnedApps = pinnedApps || [];
    await user.save();
    return res.json({
      status: true,
      data: { pinnedApps: user.pinnedApps },
    });
  });

  // Get user's inventory
  app.get("/api/user/inventory", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = (req as AuthenticatedRequest).user!._id;
    const user = await User.findById(userId).exec();
    return res.json({
      status: true,
      data: { inventory: user.inventory || [] },
    });
  });

  // Use inventory item
  app.post("/api/user/inventory/:inventoryItemId/use", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = (req as AuthenticatedRequest).user!._id;
    const { inventoryItemId } = req.params;
    const user = await User.findById(userId).exec();

    const item = user.inventory.id(inventoryItemId);
    if (!item) {
      return res.status(404).json({
        status: false,
        message: "Item not found in inventory",
      });
    }

    if (item.used) {
      return res.status(400).json({
        status: false,
        message: "Item already used",
      });
    }

    const itemDef = ITEMS[item.itemKey as keyof typeof ITEMS];
    if (itemDef) {
      await itemDef.apply(user);
    }

    item.used = true;
    item.usedAt = new Date();
    await user.save();

    return res.json({
      status: true,
      message: "Item used successfully",
    });
  });

  // Trash inventory item
  app.delete("/api/user/inventory/:inventoryItemId", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = (req as AuthenticatedRequest).user!._id;
    const { inventoryItemId } = req.params;
    const user = await User.findById(userId).exec();

    const item = user.inventory.id(inventoryItemId);
    if (!item) {
      return res.status(404).json({
        status: false,
        message: "Item not found in inventory",
      });
    }

    user.inventory.pull({ _id: inventoryItemId });
    await user.save();

    return res.json({
      status: true,
      message: "Item trashed",
    });
  });
};
