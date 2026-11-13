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
  adminFeedbackResolveSchema,
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
    // The default view is what still needs a decision; Resolved, Dismissed and Archived have their own filters.
    const filter = status ? { status } : { status: { $in: ["new", "seen"] } };
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

  // Resolve a report with one action. The person hears about it only if the admin chose to: a message, gems (which
  // always come with a message), or both. With neither, it is closed quietly. Gems are paid once per feedback: the
  // claim is atomic, so two admins (or a double click) can't pay twice. A paid report is archived, anything else is done.
  app.post(
    "/api/admin/feedback/:id/resolve",
    ...admin,
    validateParams(adminFeedbackIdParamSchema),
    validate(adminFeedbackResolveSchema),
    async (req, res) => {
      const { outcome, gems, message } = adminFeedbackResolveSchema.parse(req.body);
      const id = req.params.id as string;
      const status = outcome === "dismissed" ? "dismissed" : gems > 0 ? "archived" : "done";

      const claimed = await Feedback.findOneAndUpdate(
        { _id: id, rewardedGems: { $exists: false } },
        { $set: { status, ...(gems > 0 ? { rewardedGems: gems, rewardedAt: new Date() } : {}) } },
        { new: true },
      ).exec();
      if (!claimed) {
        if (!(await Feedback.exists({ _id: id }))) throw new AppError(404, "Feedback not found");
        throw new AppError(409, "This feedback has already been rewarded");
      }

      let balance: number | undefined;
      if (gems > 0) {
        const credited = await User.findOneAndUpdate(
          { _id: claimed.user_id },
          { $inc: { gems } },
          { new: true, projection: "gems" },
        ).exec();
        if (!credited) {
          // The sender is gone: release the claim rather than leave it marked as paid.
          await Feedback.updateOne(
            { _id: id },
            { $unset: { rewardedGems: "", rewardedAt: "" }, $set: { status: "seen" } },
          );
          throw new AppError(404, "The person who sent this feedback no longer exists");
        }
        balance = credited.gems;
      }

      const gemsText = gems.toLocaleString("en-US");
      await recordAudit(req, {
        action: gems > 0 ? "feedback_reward" : "feedback_resolve",
        target: { type: "feedback", id: String(claimed._id), label: `Feedback from ${claimed.username}` },
        detail:
          gems > 0
            ? `Rewarded ${gemsText} gems for feedback from ${claimed.username}`
            : message
              ? `Replied to feedback from ${claimed.username}`
              : outcome === "dismissed"
                ? `Dismissed feedback from ${claimed.username}`
                : `Resolved feedback from ${claimed.username} without telling them`,
        meta: { outcome, gems, balance, message },
      });
      if (gems > 0 || message) {
        await notify(String(claimed.user_id), {
          title: gems > 0 ? `You earned ${gemsText} gems` : "About your feedback",
          message,
          link: gems > 0 ? "/internal/shop" : "/internal",
          icon: "announcement",
        });
      }

      res.json({
        status: true,
        message:
          gems > 0
            ? `Rewarded ${gemsText} gems`
            : message
              ? "Reply sent"
              : outcome === "dismissed"
                ? "Dismissed"
                : "Resolved",
        data: { feedback: serialize(claimed.toObject()) },
      });
    },
  );

  // Only archived feedback can be deleted, so a stray click on a live report can't lose it.
  app.delete("/api/admin/feedback/:id", ...admin, validateParams(adminFeedbackIdParamSchema), async (req, res) => {
    const row = await Feedback.findById(req.params.id);
    if (!row) throw new AppError(404, "Feedback not found");
    if (row.status !== "archived") throw new AppError(409, "Archive this feedback before deleting it");
    await row.deleteOne();
    await recordAudit(req, {
      action: "feedback_delete",
      target: { type: "feedback", id: String(row._id), label: `Feedback from ${row.username}` },
      detail: `Deleted archived feedback from ${row.username}`,
    });
    res.json({ status: true, message: "Deleted", data: {} });
  });
}
