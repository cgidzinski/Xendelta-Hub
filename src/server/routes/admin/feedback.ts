import express = require("express");
import { authenticateToken } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/admin";
import { Feedback } from "../../models/feedback";
import { AppError } from "../../utils/http";
import { recordAudit } from "../../utils/adminAudit";
import {
  adminFeedbackIdParamSchema,
  adminFeedbackQuerySchema,
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
}
