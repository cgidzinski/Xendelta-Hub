import express = require("express");
import { authenticateToken } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/admin";
import { Feedback } from "../../models/feedback";
import { User } from "../../models/user";
import { AppError } from "../../utils/http";
import { recordAudit } from "../../utils/adminAudit";
import { notify } from "../../utils/notificationUtils";
import {
  adminFeedbackIdParamSchema,
  adminFeedbackQuerySchema,
  adminFeedbackRewardSchema,
  adminFeedbackUpdateSchema,
  validate,
  validateParams,
  validateQuery,
} from "../../utils/validation";
import type { AdminFeedback } from "@shared/feedback";

const admin = [authenticateToken, requireAdmin];

const serialize = (row: any): AdminFeedback => ({
  _id: String(row._id),
  createdAt: row.createdAt.toISOString(),
  message: row.message,
  status: row.status,
  from: { _id: String(row.user_id), username: row.username },
  ...(row.rewardedGems ? { rewardedGems: row.rewardedGems, rewardedAt: row.rewardedAt?.toISOString() } : {}),
});

// The feedback inbox (Admin → Feedback): what people sent, newest first, and a status to keep track of it.
export function registerAdminFeedbackRoutes(app: express.Application) {
  app.get("/api/admin/feedback", ...admin, validateQuery(adminFeedbackQuerySchema), async (req, res) => {
    const { status, page = 1, pageSize = 25 } = adminFeedbackQuerySchema.parse(req.query);
    const filter = status ? { status } : {};
    const [total, rows, newCount] = await Promise.all([
      Feedback.countDocuments(filter),
      Feedback.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      Feedback.countDocuments({ status: "new" }),
    ]);
    res.json({
      status: true,
      message: "",
      data: { items: rows.map(serialize), total, page, pageSize, newCount },
    });
  });

  app.put(
    "/api/admin/feedback/:id",
    ...admin,
    validateParams(adminFeedbackIdParamSchema),
    validate(adminFeedbackUpdateSchema),
    async (req, res) => {
      const row = await Feedback.findById(req.params.id);
      if (!row) throw new AppError(404, "Feedback not found");
      const before = row.status;
      row.status = req.body.status;
      await row.save();
      await recordAudit(req, {
        action: "feedback_update",
        target: { type: "feedback", id: String(row._id), label: `Feedback from ${row.username}` },
        detail: `Marked feedback from ${row.username} as ${row.status} (was ${before})`,
        meta: { before, after: row.status },
      });
      res.json({ status: true, message: "Updated", data: { feedback: serialize(row.toObject()) } });
    },
  );

  // Thank someone for a bug report with gems. Once per feedback: the claim below is atomic, so two admins (or a
  // double click) can't pay twice. The person gets the admin's message as a notification, and the feedback is done.
  app.post(
    "/api/admin/feedback/:id/reward",
    ...admin,
    validateParams(adminFeedbackIdParamSchema),
    validate(adminFeedbackRewardSchema),
    async (req, res) => {
      const { gems, message } = adminFeedbackRewardSchema.parse(req.body);
      const id = req.params.id as string;

      const claimed = await Feedback.findOneAndUpdate(
        { _id: id, rewardedGems: { $exists: false } },
        { $set: { rewardedGems: gems, rewardedAt: new Date(), status: "done" } },
        { new: true },
      ).exec();
      if (!claimed) {
        if (!(await Feedback.exists({ _id: id }))) throw new AppError(404, "Feedback not found");
        throw new AppError(409, "This feedback has already been rewarded");
      }

      const credited = await User.findOneAndUpdate(
        { _id: claimed.user_id },
        { $inc: { gems } },
        { new: true, projection: "gems" },
      ).exec();
      if (!credited) {
        // The sender is gone: release the claim rather than leave it marked as paid.
        await Feedback.updateOne({ _id: id }, { $unset: { rewardedGems: "", rewardedAt: "" } });
        throw new AppError(404, "The person who sent this feedback no longer exists");
      }

      await recordAudit(req, {
        action: "feedback_reward",
        target: { type: "feedback", id: String(claimed._id), label: `Feedback from ${claimed.username}` },
        detail: `Rewarded ${gems.toLocaleString("en-US")} gems for feedback from ${claimed.username}`,
        meta: { gems, balance: credited.gems, message },
      });
      await notify(String(claimed.user_id), {
        title: `You earned ${gems.toLocaleString("en-US")} gems`,
        message,
        link: "/internal/shop",
        icon: "announcement",
      });

      res.json({
        status: true,
        message: `Rewarded ${gems.toLocaleString("en-US")} gems`,
        data: { feedback: serialize(claimed.toObject()) },
      });
    },
  );
}
