import express = require("express");
import { User } from "../../models/user";
import { XenDriveFile } from "../../models/xendriveFile";
import { XenDriveUploadSession } from "../../models/xendriveUploadSession";
import { authenticateToken } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/admin";
import { adminStorageQuerySchema, validateQuery } from "../../utils/validation";
import { usageForAll } from "../../utils/xendriveUtils";
import { NEAR_QUOTA, storageByApp } from "../../utils/adminStats";
import { FREE_STORAGE_BYTES } from "@shared/monetization";
import type { AdminStorageReport } from "@shared/admin";

const admin = [authenticateToken, requireAdmin];
const ABANDONED_AFTER_MS = 60 * 60 * 1000;

export function registerAdminStorageRoutes(app: express.Application) {
  // What people have stored and where it is, plus the largest drives.
  app.get("/api/admin/storage", ...admin, validateQuery(adminStorageQuerySchema), async (req, res) => {
    const by = adminStorageQuerySchema.parse(req.query).by ?? "size";
    const [users, usage, byApp, appRows, abandoned, orphaned] = await Promise.all([
      User.find({}, "username avatar xendrive").lean(),
      usageForAll(),
      storageByApp(),
      XenDriveFile.aggregate<{ _id: unknown; bytes: number }>([
        { $match: { "source.app": { $exists: true } } },
        { $group: { _id: "$owner_id", bytes: { $sum: { $ifNull: ["$size", 0] } } } },
      ]),
      XenDriveUploadSession.countDocuments({ created_at: { $lt: new Date(Date.now() - ABANDONED_AFTER_MS) } }),
      XenDriveFile.aggregate<{ n: number }>([
        { $lookup: { from: "users", localField: "owner_id", foreignField: "_id", as: "owner" } },
        { $match: { owner: { $size: 0 } } },
        { $count: "n" },
      ]),
    ]);

    const appBytes = new Map(appRows.map((r) => [String(r._id), r.bytes]));
    let used = 0;
    let extraGranted = 0;
    let nearQuota = 0;
    const people = (users as any[]).map((u) => {
      const stored = usage.get(String(u._id)) ?? { fileCount: 0, spaceUsed: 0 };
      const allowed = FREE_STORAGE_BYTES + (u.xendrive?.spaceAllowed ?? 0);
      used += stored.spaceUsed;
      extraGranted += u.xendrive?.spaceAllowed ?? 0;
      if (stored.spaceUsed / allowed >= NEAR_QUOTA) nearQuota++;
      return {
        _id: String(u._id),
        username: u.username ?? "",
        avatar: u.avatar || "/avatars/default-avatar.png",
        used: stored.spaceUsed,
        allowed,
        files: stored.fileCount,
        appBytes: appBytes.get(String(u._id)) ?? 0,
      };
    });
    people.sort((a, b) => (by === "percent" ? b.used / b.allowed - a.used / a.allowed : b.used - a.used));

    const report: AdminStorageReport = {
      used,
      extraGranted,
      nearQuota,
      byApp,
      top: people.slice(0, 10),
      housekeeping: { abandonedUploads: abandoned, orphanedFiles: orphaned[0]?.n ?? 0 },
    };
    res.json({ status: true, message: "", data: { report } });
  });
}
