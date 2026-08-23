import express = require("express");
const PushSubscription = require("../models/pushSubscription");
import { authenticateToken } from "../middleware/auth";
import { validate, pushSubscribeSchema, pushUnsubscribeSchema } from "../utils/validation";
import { getVapidPublicKey } from "../utils/pushUtils";
import { AuthenticatedRequest } from "../types";

module.exports = function (app: express.Application) {
  // Served at runtime rather than baked in at build time, so the VAPID key lives only in
  // the server's .env and rotating it doesn't require a rebuild.
  app.get("/api/push/public-key", function (req: express.Request, res: express.Response) {
    const publicKey = getVapidPublicKey();

    if (!publicKey) {
      return res.status(503).json({
        status: false,
        message: "Push notifications are not configured on this server",
      });
    }

    return res.json({
      status: true,
      message: "",
      data: { publicKey },
    });
  });

  app.post(
    "/api/push/subscribe",
    authenticateToken,
    validate(pushSubscribeSchema),
    async function (req: express.Request, res: express.Response) {
      const userId = (req as AuthenticatedRequest).user!._id;
      const { endpoint, keys } = req.body;

      // Upsert by endpoint: the same device re-subscribing (or a subscription that moved to
      // another account on a shared device) updates the existing row rather than duplicating.
      const subscription = await PushSubscription.findOneAndUpdate(
        { endpoint },
        {
          userId,
          endpoint,
          keys: { p256dh: keys.p256dh, auth: keys.auth },
          userAgent: req.headers["user-agent"] || "",
          lastSeenAt: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );

      return res.json({
        status: true,
        message: "Push subscription saved",
        data: { subscriptionId: subscription._id },
      });
    }
  );

  app.delete(
    "/api/push/subscribe",
    authenticateToken,
    validate(pushUnsubscribeSchema),
    async function (req: express.Request, res: express.Response) {
      const userId = (req as AuthenticatedRequest).user!._id;
      const { endpoint } = req.body;

      await PushSubscription.deleteOne({ endpoint, userId });

      return res.json({
        status: true,
        message: "Push subscription removed",
        data: {},
      });
    }
  );
};
