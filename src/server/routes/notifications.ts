import express = require("express");
import { Notification } from "../models/notification";
import { User } from "../models/user";
import { authenticateToken } from "../middleware/auth";
import { SocketManager } from "../infrastructure/SocketManager";
import { notificationIdParamSchema, validateParams } from "../utils/validation";
import { AuthenticatedRequest } from "../types";

module.exports = function (app: express.Application) {
  app.get("/api/user/notifications", authenticateToken, async function (req: express.Request, res: express.Response) {
    const userId = (req as AuthenticatedRequest).user!._id;
    await User.findByIdAndUpdate(userId, { notificationsLastCheckedAt: new Date() });

    const notifications = await Notification.find({ userId }).sort({ time: -1 }).limit(10).exec();

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

      const notifications = await Notification.find({ userId }).sort({ time: -1 }).limit(10).exec();

      return res.json({
        status: true,
        message: "All notifications marked as read",
        data: {
          notifications: notifications,
        },
      });
    },
  );

  app.put(
    "/api/user/notifications/:notificationId/mark-read",
    authenticateToken,
    validateParams(notificationIdParamSchema),
    async function (req: express.Request, res: express.Response) {
      const { notificationId } = req.params;
      const userId = (req as AuthenticatedRequest).user!._id;

      const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, userId },
        { unread: false },
        { new: true },
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
    },
  );

  // Delete (dismiss) a single notification
  app.delete(
    "/api/user/notifications/:notificationId",
    authenticateToken,
    validateParams(notificationIdParamSchema),
    async function (req: express.Request, res: express.Response) {
      const { notificationId } = req.params;
      const userId = (req as AuthenticatedRequest).user!._id;

      const notification = await Notification.findOneAndDelete({ _id: notificationId, userId });

      if (notification) {
        const socketManager = SocketManager.getInstance();
        socketManager.notifyNotificationUpdate(userId.toString(), notificationId, { deleted: true });

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
    },
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
    },
  );
};
