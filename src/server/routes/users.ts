import express = require("express");
import { totalSpaceAllowed, usageFor } from "../utils/xendriveUtils";
import { AppError, callerId, loadCaller } from "../utils/http";
import { User } from "../models/user";
import { Notification } from "../models/notification";
import { ITEMS } from "../constants/items";
import { unequipIfNotOwned } from "../utils/cosmetics";
import { authenticateToken } from "../middleware/auth";
import { SocketManager } from "../infrastructure/SocketManager";
import { uploadAvatarFile } from "../utils/mediaUtils";
import { unreadConversationCount } from "../chat/service";
import { deleteFromGCS } from "../utils/gcsUtils";
import {
  addPasswordSchema,
  inventoryItemIdParamSchema,
  pinnedAppsSchema,
  unlinkProviderSchema,
  updateProfileSchema,
  validate,
  validateParams,
} from "../utils/validation";
import { upload } from "../config/multer";
import { AuthenticatedRequest } from "../types";
import { DEFAULT_CURRENCY } from "@shared/currencies";

/** "timezone", "timezone and username", "timezone, username and e-transfer details". */
function formatList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
import { normalizeEtransfer } from "@shared/etransfer";

/** The profile's e-transfer destination on the wire: always present, blank handle when unset. */
function etransferPayload(user: any) {
  return {
    handle: user.etransfer?.handle || "",
    currency: user.etransfer?.currency || DEFAULT_CURRENCY,
  };
}

module.exports = function (app: express.Application) {
  app.get("/api/user/profile", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = callerId(req);
    const user = await User.findOne({ _id: userId }).exec();
    if (!user) throw new AppError(404, "User not found");

    // Does the user have anything unread in any conversation?
    const hasUnreadMessages = (await unreadConversationCount(userId)) > 0;

    // Check for unread notifications in separate collection
    const unreadNotificationsCount = await Notification.countDocuments({ userId, unread: true });
    const hasUnreadNotifications = unreadNotificationsCount > 0;

    // Check for new notifications since last checked
    const lastChecked = user.notificationsLastCheckedAt
      ? user.notificationsLastCheckedAt.toISOString()
      : new Date(0).toISOString();
    const hasNewNotifications = await Notification.exists({ userId, time: { $gt: lastChecked } });

    const { fileCount, spaceUsed } = await usageFor(user._id.toString());
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
          gems: user.gems || 0,
          cosmetics: user.cosmetics?.badge ? { badge: user.cosmetics.badge } : {},
          unread_messages: hasUnreadMessages,
          unread_notifications: hasUnreadNotifications,
          has_new_notifications: !!hasNewNotifications,
          pinnedApps: user.pinnedApps || [],
          timezone: user.timezone || "",
          theme: user.theme || "",
          emailNotifications: user.notificationPrefs?.email !== false,
          etransfer: etransferPayload(user),
          xendrive: {
            fileCount: fileCount,
            spaceUsed: spaceUsed,
            spaceAllowed: totalSpaceAllowed(user.xendrive?.spaceAllowed),
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
      const userId = callerId(req);
      const { username, timezone, emailNotifications, etransfer, theme } = req.body;
      // Which fields this request actually changed. A preference toggle should not
      // announce itself as "Profile updated" in the notification centre.
      const changed: string[] = [];
      const user = await User.findOne({ _id: userId }).exec();
      if (!user) throw new AppError(404, "User not found");

      if (timezone !== undefined) {
        // "" clears the preference, putting the user back on their browser's zone.
        user.timezone = timezone || undefined;
        await user.save();
        changed.push("timezone");
      }

      if (theme !== undefined) {
        // "" clears it, putting the user back on their system setting. Deliberately
        // not pushed to `changed`: flipping a theme is not news.
        user.theme = theme || undefined;
        await user.save();
      }

      if (emailNotifications !== undefined) {
        user.notificationPrefs = { ...(user.notificationPrefs || {}), email: emailNotifications };
        await user.save();
        changed.push("email notifications");
      }

      if (etransfer !== undefined) {
        // A blank handle drops the whole thing — a currency on its own means nothing.
        user.etransfer = etransfer.handle
          ? { handle: normalizeEtransfer(etransfer.handle), currency: etransfer.currency || DEFAULT_CURRENCY }
          : undefined;
        await user.save();
        changed.push("e-transfer details");
      }

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
        changed.push("username");
      }

      // Only for changes worth telling the user about. This fired on EVERY profile PUT,
      // so a preference toggle -- theme especially, which people flip repeatedly --
      // filled the notification centre with "Profile updated".
      if (changed.length > 0) {
        const newNotification = new Notification({
          userId: userId,
          title: "Profile updated",
          message: `Your ${formatList(changed)} ${changed.length === 1 ? "was" : "were"} updated`,
          time: new Date().toISOString(),
          icon: "person",
          unread: true,
        });

        await newNotification.save();

        // Send socket notification
        const socketManager = SocketManager.getInstance();
        socketManager.sendNotification(userId.toString(), newNotification);
      }
      return res.json({
        status: true,
        message: "",
        data: {
          user: {
            username: user.username,
            email: user.email,
            avatar: user.avatar || "/avatars/default-avatar.png",
            timezone: user.timezone || "",
            theme: user.theme || "",
            emailNotifications: user.notificationPrefs?.email !== false,
            etransfer: etransferPayload(user),
            unread_messages: false,
            unread_notifications: true,
            has_new_notifications: true,
          },
        },
      });
    },
  );

  // Avatar upload endpoint
  app.post(
    "/api/user/avatar",
    authenticateToken,
    upload.single("avatar"),
    async function (req: express.Request, res: express.Response) {
      const user = await loadCaller(req);

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
    },
  );

  // Get user's linked authentication providers
  app.get("/api/user/auth-providers", authenticateToken, async function (req: express.Request, res: express.Response) {
    try {
      const user = (req as AuthenticatedRequest).user!;
      const fullUser = await User.findById(user._id).exec();

      if (!fullUser) {
        return res.json({
          success: false,
          status: false,
          message: "User not found",
        });
      }

      const activeProviders = fullUser.getActiveProviders();

      return res.json({
        success: true,
        status: true,
        providers: activeProviders,
        canUnlinkLocal: activeProviders.length > 1 || !fullUser.hasAuthProvider("local"),
      });
    } catch (error) {
      console.error("Get auth providers error:", error);
      return res.json({
        success: false,
        status: false,
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
      if (!fullUser) throw new AppError(404, "User not found");
      if (fullUser.hasAuthProvider("google")) {
        return res.json({
          success: false,
          status: false,
          message: "Google account is already linked",
        });
      }

      return res.json({
        success: true,
        status: true,
        message: "Redirect to Google OAuth for account linking",
        redirectUrl: `/api/auth/google?state=link&userId=${user._id}`,
      });
    } catch (error) {
      console.error("Link Google account error:", error);
      return res.json({
        success: false,
        status: false,
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
      if (!fullUser) throw new AppError(404, "User not found");
      if (fullUser.hasAuthProvider("github")) {
        return res.json({
          success: false,
          status: false,
          message: "GitHub account is already linked",
        });
      }

      return res.json({
        success: true,
        status: true,
        message: "Redirect to GitHub OAuth for account linking",
        redirectUrl: `/api/auth/github?state=link&userId=${user._id}`,
      });
    } catch (error) {
      console.error("Link GitHub account error:", error);
      return res.json({
        success: false,
        status: false,
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
      if (!fullUser) throw new AppError(404, "User not found");
      if (fullUser.hasAuthProvider("discord")) {
        return res.json({
          success: false,
          status: false,
          message: "Discord account is already linked",
        });
      }

      return res.json({
        success: true,
        status: true,
        message: "Redirect to Discord OAuth for account linking",
        redirectUrl: `/api/auth/discord?state=link&userId=${user._id}`,
      });
    } catch (error) {
      console.error("Link Discord account error:", error);
      return res.json({
        success: false,
        status: false,
        message: "Failed to initiate Discord account linking",
      });
    }
  });

  // Unlink authentication provider
  app.post(
    "/api/user/unlink-provider",
    authenticateToken,
    validate(unlinkProviderSchema),
    async function (req: express.Request, res: express.Response) {
      try {
        const user = (req as AuthenticatedRequest).user!;
        const { provider } = req.body;

        if (!provider) {
          return res.json({
            success: false,
            status: false,
            message: "Provider is required",
          });
        }

        const fullUser = await User.findById(user._id).exec();
        if (!fullUser) throw new AppError(404, "User not found");

        if (!fullUser.hasAuthProvider(provider)) {
          return res.json({
            success: false,
            status: false,
            message: `${provider} account is not linked`,
          });
        }

        // Prevent unlinking if it's the only authentication method
        const activeProviders = fullUser.getActiveProviders();
        if (activeProviders.length <= 1) {
          return res.json({
            success: false,
            status: false,
            message: "Cannot unlink the only authentication method. Please add another method first.",
          });
        }

        await fullUser.removeAuthProvider(provider);

        return res.json({
          success: true,
          status: true,
          message: `${provider} account unlinked successfully`,
          providers: fullUser.getActiveProviders(),
        });
      } catch (error) {
        console.error("Unlink provider error:", error);
        return res.json({
          success: false,
          status: false,
          message: "Failed to unlink authentication provider",
        });
      }
    },
  );

  // Add password to Google-only account
  app.post(
    "/api/user/add-password",
    authenticateToken,
    validate(addPasswordSchema),
    async function (req: express.Request, res: express.Response) {
      try {
        const user = (req as AuthenticatedRequest).user!;
        const { password } = req.body;

        if (!password) {
          return res.json({
            success: false,
            status: false,
            message: "Password is required",
          });
        }

        const fullUser = await User.findById(user._id).exec();
        if (!fullUser) throw new AppError(404, "User not found");

        if (fullUser.password) {
          return res.json({
            success: false,
            status: false,
            message: "Account already has a password",
          });
        }

        fullUser.password = fullUser.generateHash(password);
        await fullUser.addAuthProvider("local", undefined, fullUser.email);

        return res.json({
          success: true,
          status: true,
          message: "Password added successfully. You can now sign in with email and password.",
          providers: fullUser.getActiveProviders(),
        });
      } catch (error) {
        console.error("Add password error:", error);
        return res.json({
          success: false,
          status: false,
          message: "Failed to add password",
        });
      }
    },
  );

  // Get user's pinned apps
  app.get("/api/user/pinned-apps", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = callerId(req);
    const user = await User.findById(userId).exec();
    if (!user) throw new AppError(404, "User not found");
    return res.json({
      status: true,
      data: { pinnedApps: user.pinnedApps || [] },
    });
  });

  // Update user's pinned apps
  app.put(
    "/api/user/pinned-apps",
    authenticateToken,
    validate(pinnedAppsSchema),
    async function (req: express.Request, res: express.Response) {
      const userId = callerId(req);
      const { pinnedApps } = req.body;
      const user = await User.findById(userId).exec();
      if (!user) throw new AppError(404, "User not found");
      user.pinnedApps = pinnedApps || [];
      await user.save();
      return res.json({
        status: true,
        data: { pinnedApps: user.pinnedApps },
      });
    },
  );

  // Get user's inventory
  app.get("/api/user/inventory", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = callerId(req);
    const user = await User.findById(userId).exec();
    if (!user) throw new AppError(404, "User not found");
    return res.json({
      status: true,
      data: { inventory: user.inventory || [] },
    });
  });

  // Use inventory item
  app.post(
    "/api/user/inventory/:inventoryItemId/use",
    authenticateToken,
    validateParams(inventoryItemIdParamSchema),
    async function (req: express.Request, res: express.Response) {
      const userId = callerId(req);
      const { inventoryItemId } = req.params;
      // Claim the item first with one conditional update: of two simultaneous redeems only one matches
      // `used: false`, so the effect below can't be applied twice.
      const claimed = await User.findOneAndUpdate(
        { _id: userId, inventory: { $elemMatch: { _id: inventoryItemId, used: false } } },
        { $set: { "inventory.$.used": true, "inventory.$.usedAt": new Date() } },
        { new: false, projection: { inventory: { $elemMatch: { _id: inventoryItemId } } } },
      ).exec();

      if (!claimed) {
        const owner = await User.findOne(
          { _id: userId },
          { inventory: { $elemMatch: { _id: inventoryItemId } } },
        ).exec();
        if (!owner) throw new AppError(404, "User not found");
        if (!owner.inventory?.length) throw new AppError(404, "Item not found in inventory");
        throw new AppError(400, "Item already used");
      }

      const itemDef = ITEMS[claimed.inventory[0].itemKey as keyof typeof ITEMS];
      // Not every item has an effect to apply (apply is optional on the item definition).
      if (itemDef?.apply) {
        try {
          await itemDef.apply(String(userId));
        } catch (e) {
          // Hand the item back rather than consume it for nothing.
          await User.updateOne(
            { _id: userId, "inventory._id": inventoryItemId },
            { $set: { "inventory.$.used": false }, $unset: { "inventory.$.usedAt": "" } },
          ).exec();
          throw e;
        }
      }

      return res.json({
        status: true,
        message: "Item used successfully",
      });
    },
  );

  // Wear a cosmetic from the inventory. One item per slot; wearing another replaces it.
  app.post(
    "/api/user/inventory/:inventoryItemId/equip",
    authenticateToken,
    validateParams(inventoryItemIdParamSchema),
    async function (req: express.Request, res: express.Response) {
      const userId = callerId(req);
      const { inventoryItemId } = req.params;
      const owner = await User.findOne({ _id: userId }, { inventory: { $elemMatch: { _id: inventoryItemId } } }).exec();
      if (!owner) throw new AppError(404, "User not found");
      const item = owner.inventory?.[0];
      if (!item) throw new AppError(404, "Item not found in inventory");
      const slot = ITEMS[item.itemKey]?.cosmetic?.slot;
      if (!slot) throw new AppError(400, "This item cannot be worn");

      await User.updateOne({ _id: userId }, { $set: { [`cosmetics.${slot}`]: item.itemKey } }).exec();
      return res.json({ status: true, message: `Now wearing ${item.name}` });
    },
  );

  // Take a worn cosmetic off. The item stays in the inventory.
  app.post(
    "/api/user/inventory/:inventoryItemId/unequip",
    authenticateToken,
    validateParams(inventoryItemIdParamSchema),
    async function (req: express.Request, res: express.Response) {
      const userId = callerId(req);
      const { inventoryItemId } = req.params;
      const owner = await User.findOne({ _id: userId }, { inventory: { $elemMatch: { _id: inventoryItemId } } }).exec();
      if (!owner) throw new AppError(404, "User not found");
      const item = owner.inventory?.[0];
      if (!item) throw new AppError(404, "Item not found in inventory");
      const slot = ITEMS[item.itemKey]?.cosmetic?.slot;
      if (!slot) throw new AppError(400, "This item cannot be worn");

      // Only if this is what is worn: another copy or item in the slot is left alone.
      await User.updateOne(
        { _id: userId, [`cosmetics.${slot}`]: item.itemKey },
        { $unset: { [`cosmetics.${slot}`]: "" } },
      ).exec();
      return res.json({ status: true, message: `Took off ${item.name}` });
    },
  );

  // Trash inventory item
  app.delete(
    "/api/user/inventory/:inventoryItemId",
    authenticateToken,
    validateParams(inventoryItemIdParamSchema),
    async function (req: express.Request, res: express.Response) {
      const userId = callerId(req);
      const { inventoryItemId } = req.params;
      const user = await User.findById(userId).exec();
      if (!user) throw new AppError(404, "User not found");

      const item = user.inventory.id(inventoryItemId);
      if (!item) {
        return res.status(404).json({
          status: false,
          message: "Item not found in inventory",
        });
      }

      user.inventory.pull({ _id: inventoryItemId });
      await user.save();
      await unequipIfNotOwned(userId, item.itemKey);

      return res.json({
        status: true,
        message: "Item trashed",
      });
    },
  );
};
