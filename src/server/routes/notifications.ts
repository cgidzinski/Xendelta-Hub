import express = require("express");
const { User } = require("../models/user");
import { authenticateToken } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import { SocketManager } from "../infrastructure/SocketManager";
import { validate, createNotificationSchema } from "../utils/validation";
import { TIMEOUTS } from "../constants";

module.exports = function (app: express.Application) {
  app.get("/api/user/notifications", authenticateToken, async function (req: express.Request, res: express.Response) {
    const user = await User.findOne({ _id: req.user!._id }).exec();
    await new Promise((resolve) => setTimeout(resolve, TIMEOUTS.NOTIFICATION_DELAY));

    return res.json({
      status: true,
      message: "",
      data: {
        notifications: (user.notifications || []).slice(0, 10),
      },
    });
  });

  app.put(
    "/api/user/notifications/mark-read",
    authenticateToken,
    async function (req: express.Request, res: express.Response) {
      const user = await User.findOne({ _id: req.user!._id }).exec();

      // Mark all notifications as read
      user.notifications.forEach((notification: any) => {
        notification.unread = false;
      });

      await user.save();

      // Send socket notification about update
      const socketManager = SocketManager.getInstance();
      socketManager.notifyNotificationUpdate(user._id.toString(), "all", { unread: false });

      return res.json({
        status: true,
        message: "All notifications marked as read",
        data: {
          notifications: (user.notifications || []).slice(0, 10),
        },
      });
    }
  );

  app.put(
    "/api/user/notifications/:notificationId/mark-read",
    authenticateToken,
    async function (req: express.Request, res: express.Response) {
      const { notificationId } = req.params;
      const user = await User.findOne({ _id: req.user!._id }).exec();

      // Find and mark the specific notification as read
      const notification = user.notifications.find((n: any) => n._id.toString() === notificationId);
      if (notification) {
        notification.unread = false;
        await user.save();

        // Send socket notification about update
        const socketManager = SocketManager.getInstance();
        socketManager.notifyNotificationUpdate(user._id.toString(), notificationId, { unread: false });

        return res.json({
          status: true,
          message: "Notification marked as read",
          data: {
            notification: notification,
          },
        });
      } else {
        return res.status(404).json({
          status: false,
          message: "Notification not found",
        });
      }
    }
  );

  // Admin: Send notification to all users
  app.post(
    "/api/admin/notifications/all",
    authenticateToken,
    requireAdmin,
    validate(createNotificationSchema),
    async function (req: express.Request, res: express.Response) {
      const { title, message, icon } = req.body;

      if (!title || !message) {
        return res.status(400).json({
          status: false,
          message: "Title and message are required",
        });
      }

      const allUsers = await User.find({}).exec();
      let successCount = 0;
      let errorCount = 0;
      const socketManager = SocketManager.getInstance();

      for (const targetUser of allUsers) {
        const newNotification = {
          title: title,
          message: message,
          time: new Date().toISOString(),
          icon: icon || "announcement",
          unread: true,
        };

        targetUser.notifications.unshift(newNotification);
        
        await targetUser.save();

        // Get the saved notification with _id
        const savedNotification = targetUser.notifications[0];

        // Send socket notification
        socketManager.sendNotification(targetUser._id.toString(), savedNotification);

        successCount++;
      }

      return res.json({
        status: true,
        message: `Notification sent to ${successCount} users${errorCount > 0 ? `, ${errorCount} errors` : ""}`,
        data: {
          successCount,
          errorCount,
        },
      });
    }
  );
};
