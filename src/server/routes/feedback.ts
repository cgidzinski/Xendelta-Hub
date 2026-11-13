import express = require("express");
import { rateLimit } from "express-rate-limit";
import { authenticateToken } from "../middleware/auth";
import { Feedback } from "../models/feedback";
import { AppError, callerId, loadCaller } from "../utils/http";
import { notifyAdmins } from "../utils/notificationUtils";
import { sendFeedbackSchema, validate } from "../utils/validation";
import { FEEDBACK_PER_HOUR } from "@shared/feedback";

// Feedback from the "Send feedback" page. It lands in Admin → Feedback and every admin is notified.
// The limit is per person (this runs after sign-in), so one stuck button or a bot can't fill the inbox.
const perPersonPerHour = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: FEEDBACK_PER_HOUR,
  keyGenerator: (req) => callerId(req),
  standardHeaders: true,
  legacyHeaders: false,
  validate: { keyGeneratorIpFallback: false },
  handler: (_req, _res, next) =>
    next(new AppError(429, "You've sent a lot of feedback in the last hour. Please try again later.")),
});

const snippet = (text: string) => (text.length > 120 ? `${text.slice(0, 117)}…` : text);

module.exports = function (app: express.Application) {
  app.post("/api/feedback", authenticateToken, perPersonPerHour, validate(sendFeedbackSchema), async (req, res) => {
    const user = await loadCaller(req);
    const { message } = req.body;
    await Feedback.create({ user_id: String(user._id), username: user.username, message });
    await notifyAdmins({
      title: `Feedback from ${user.username}`,
      message: snippet(message),
      link: "/admin/feedback",
      icon: "announcement",
    });
    res.status(201).json({ status: true, message: "Thanks, your feedback was sent", data: {} });
  });
};
