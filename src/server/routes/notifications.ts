import express = require("express");
const Notification = require("../models/notification");
const { User } = require("../models/user");
import { authenticateToken } from "../middleware/auth";
import { requireAdmin } from "../middleware/admin";
import { SocketManager } from "../infrastructure/SocketManager";
import { validate, createNotificationSchema } from "../utils/validation";
import { TIMEOUTS } from "../constants";
import { AuthenticatedRequest } from "../types";

module.exports = function (app: express.Application) {
  app.get("/api/user/notifications", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = (req as AuthenticatedRequest).user!._id;
    await new Promise((resolve) => setTimeout(resolve, TIMEOUTS.NOTIFICATION_DELAY));

    await User.findByIdAndUpdate(userId, { notificationsLastCheckedAt: new Date() });

    const notifications = await Notification.find({ userId })
      .sort({ time: -1 })
      .limit(10)
      .exec();

    return res.json({
      status: true,
      message: "",
      data: {
        notifications: notifications,
      },
    });
  });

  app.put(
    "/api/user/notifications/mark-read",
    authenticateToken,
    async function (req: express.Request, res: express.Response) {
      const userId = (req as AuthenticatedRequest).user!._id;

      await Notification.updateMany({ userId, unread: true }, { unread: false });

      const socketManager = SocketManager.getInstance();
      socketManager.notifyNotificationUpdate(userId.toString(), "all", { unread: false });

      const notifications = await Notification.find({ userId })
        .sort({ time: -1 })
        .limit(10)
        .exec();

      return res.json({
        status: true,
        message: "All notifications marked as read",
        data: {
          notifications: notifications,
        },
      });
    }
  );

  app.put(
    "/api/user/notifications/:notificationId/mark-read",
    authenticateToken,
    async function (req: express.Request, res: express.Response) {
      const { notificationId } = req.params;
      const userId = (req as AuthenticatedRequest).user!._id;

      const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, userId },
        { unread: false },
        { new: true }
      );

      if (notification) {
        const socketManager = SocketManager.getInstance();
        socketManager.notifyNotificationUpdate(userId.toString(), notificationId, { unread: false });

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

  // Delete (dismiss) a single notification
  app.delete(
    "/api/user/notifications/:notificationId",
    authenticateToken,
    async function (req: express.Request, res: express.Response) {
      const { notificationId } = req.params;
      const userId = (req as AuthenticatedRequest).user!._id;

      const notification = await Notification.findOneAndDelete({ _id: notificationId, userId });

      if (notification) {
        return res.json({
          status: true,
          message: "Notification dismissed",
          data: { notificationId },
        });
      } else {
        return res.status(404).json({
          status: false,
          message: "Notification not found",
        });
      }
    }
  );

  // Delete (clear) all notifications for the current user
  app.delete(
    "/api/user/notifications",
    authenticateToken,
    async function (req: express.Request, res: express.Response) {
      const userId = (req as AuthenticatedRequest).user!._id;

      await Notification.deleteMany({ userId });

      // Update user profile unread_notifications flag via socket
      const socketManager = SocketManager.getInstance();
      socketManager.notifyNotificationUpdate(userId.toString(), "all", { unread: false });

      return res.json({
        status: true,
        message: "All notifications cleared",
        data: {},
      });
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
      const time = new Date().toISOString();

      for (const targetUser of allUsers) {
        try {
          const newNotification = new Notification({
            userId: targetUser._id,
            title,
            message,
            time,
            icon: icon || "announcement",
            unread: true,
          });

          await newNotification.save();
          socketManager.sendNotification(targetUser._id.toString(), newNotification);
          successCount++;
        } catch (err) {
          errorCount++;
        }
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