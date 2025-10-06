import express = require("express");
const { User } = require("../models/user");
import { authenticateToken } from "../middleware/auth";

module.exports = function (app: express.Application) {
  app.get("/api/user/notifications", authenticateToken, async function (req: express.Request, res: express.Response) {
    const user = await User.findOne({ _id: req.user!._id }).exec();
    await new Promise((resolve) => setTimeout(resolve, 300));

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
};
