import express = require("express");
import { escapeRegex } from "@shared/regex";
import { AdminAudit } from "../../models/adminAudit";
import { authenticateToken } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/admin";
import { adminAuditQuerySchema, validateQuery } from "../../utils/validation";
import { serializeAudit } from "../../utils/adminAudit";
import { DAY_MS } from "../../utils/adminStats";

const admin = [authenticateToken, requireAdmin];

export function registerAdminAuditRoutes(app: express.Application) {
  // The audit log. Read-only: there is deliberately no route that edits or deletes an entry.
  app.get("/api/admin/audit", ...admin, validateQuery(adminAuditQuerySchema), async (req, res) => {
    const { category, q, targetId, days, page = 1, pageSize = 25 } = adminAuditQuerySchema.parse(req.query);
    const filter: Record<string, unknown> = {};
    if (category) filter.category = category;
    if (targetId) filter["target.id"] = targetId;
    if (days) filter.createdAt = { $gte: new Date(Date.now() - days * DAY_MS) };
    if (q?.trim()) {
      const re = { $regex: escapeRegex(q.trim()), $options: "i" };
      filter.$or = [{ detail: re }, { "target.label": re }, { admin_name: re }];
    }
    const [total, rows] = await Promise.all([
      AdminAudit.countDocuments(filter),
      AdminAudit.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
    ]);
    res.json({ status: true, message: "", data: { items: rows.map(serializeAudit), total, page, pageSize } });
  });
}
