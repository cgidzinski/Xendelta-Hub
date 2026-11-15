import express = require("express");
import { User } from "../../models/user";
import { FileRecord } from "../../models/fileRecord";
import { XenDriveUploadSession } from "../../models/xendriveUploadSession";
import { authenticateToken } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/admin";
import { adminStorageQuerySchema, validateQuery } from "../../utils/validation";
import { usageForAll } from "../../utils/xendriveUtils";
import { storageByApp } from "../../utils/adminStats";
import type { AdminStorageReport } from "@shared/admin";

const admin = [authenticateToken, requireAdmin];
const ABANDONED_AFTER_MS = 60 * 60 * 1000;

export function registerAdminStorageRoutes(app: express.Application) {
  // What people have stored and where it is, plus the largest drives.
  app.get("/api/admin/storage", ...admin, validateQuery(adminStorageQuerySchema), async (_req, res) => {
    const [users, usage, byApp, appRows, abandoned, orphaned] = await Promise.all([
      User.find({}, "username avatar").lean(),
      usageForAll(),
      storageByApp(),
      FileRecord.aggregate<{ _id: unknown; bytes: number }>([
        { $match: { bucket: "private", "space.app": { $ne: "xendrive" } } },
        { $group: { _id: "$uploadedBy", bytes: { $sum: { $ifNull: ["$size", 0] } } } },
      ]),
      XenDriveUploadSession.countDocuments({ created_at: { $lt: new Date(Date.now() - ABANDONED_AFTER_MS) } }),
      FileRecord.aggregate<{ n: number }>([
        { $match: { bucket: "private" } },
        { $lookup: { from: "users", localField: "uploadedBy", foreignField: "_id", as: "owner" } },
        { $match: { owner: { $size: 0 } } },
        { $count: "n" },
      ]),
    ]);

    const appBytes = new Map(appRows.map((r) => [String(r._id), r.bytes]));
    let used = 0;
    const people = (users as any[]).map((u) => {
      const stored = usage.get(String(u._id)) ?? { fileCount: 0, spaceUsed: 0 };
      used += stored.spaceUsed;
      return {
        _id: String(u._id),
        username: u.username ?? "",
        avatar: u.avatar || "/avatars/default-avatar.png",
        used: stored.spaceUsed,
        files: stored.fileCount,
        appBytes: appBytes.get(String(u._id)) ?? 0,
      };
    });
    people.sort((a, b) => b.used - a.used);

    const report: AdminStorageReport = {
      used,
      byApp,
      top: people.slice(0, 10),
      housekeeping: { abandonedUploads: abandoned, orphanedFiles: orphaned[0]?.n ?? 0 },
    };
    res.json({ status: true, message: "", data: { report } });
  });
}
