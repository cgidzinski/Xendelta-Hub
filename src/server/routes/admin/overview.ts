import express = require("express");
import { User } from "../../models/user";
import { GemPurchase } from "../../models/gemPurchase";
import { ScheduledTask } from "../../models/scheduledTask";
import { AdminAudit } from "../../models/adminAudit";
import { authenticateToken } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/admin";
import { usageForAll } from "../../utils/xendriveUtils";
import { serializeAudit } from "../../utils/adminAudit";
import { DAY_MS, objectIdFrom, storageByApp, taskLabel } from "../../utils/adminStats";
import type { AdminOverview, AttentionItem } from "@shared/admin";

const admin = [authenticateToken, requireAdmin];
const PENDING_TOO_LONG_MS = 60 * 60 * 1000;

const dayKey = (d: Date) => d.toISOString().slice(0, 10);

export function registerAdminOverviewRoutes(app: express.Application) {
  // Everything the Overview page shows, in one request.
  app.get("/api/admin/overview", ...admin, async (_req, res) => {
    const now = new Date();
    const since30 = new Date(now.getTime() - 30 * DAY_MS);
    const since7 = new Date(now.getTime() - 7 * DAY_MS);

    const [total, new7, new30, signups, usage, byApp, bought, pending, oldestPending, tasks, failing, recent] =
      await Promise.all([
        User.estimatedDocumentCount(),
        User.countDocuments({ _id: { $gte: objectIdFrom(since7) } }),
        User.countDocuments({ _id: { $gte: objectIdFrom(since30) } }),
        User.aggregate<{ _id: string; count: number }>([
          { $match: { _id: { $gte: objectIdFrom(since30) } } },
          { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: { $toDate: "$_id" } } }, count: { $sum: 1 } } },
        ]),
        usageForAll(),
        storageByApp(),
        GemPurchase.aggregate<{ gems: number; cents: number; count: number }>([
          { $match: { status: "completed", completedAt: { $gte: since30 } } },
          { $group: { _id: null, gems: { $sum: "$gems" }, cents: { $sum: "$amountCents" }, count: { $sum: 1 } } },
        ]),
        GemPurchase.countDocuments({ status: "pending" }),
        GemPurchase.findOne({ status: "pending" }).sort({ createdAt: 1 }).populate("user", "username").lean(),
        ScheduledTask.countDocuments({ enabled: true }),
        ScheduledTask.find({ enabled: true, last_error: { $nin: [null, ""] } }).lean(),
        AdminAudit.find({}).sort({ createdAt: -1 }).limit(5).lean(),
      ]);

    const byDay = new Map(signups.map((s) => [s._id, s.count]));
    const signupsByDay = Array.from({ length: 30 }, (_, i) => {
      const day = dayKey(new Date(now.getTime() - (29 - i) * DAY_MS));
      return { day, count: byDay.get(day) ?? 0 };
    });

    let used = 0;
    for (const u of usage.values()) used += u.spaceUsed;
    const attention: AttentionItem[] = [];
    if (failing.length > 0) {
      attention.push({
        key: "tasks",
        severity: "error",
        title: `${failing.length} scheduled ${failing.length === 1 ? "task is" : "tasks are"} failing`,
        detail: `${taskLabel(failing[0])}: ${failing[0].last_error}`,
        href: "/admin/system",
        action: "Open",
      });
    }
    const stuck =
      oldestPending && now.getTime() - new Date((oldestPending as any).createdAt).getTime() > PENDING_TOO_LONG_MS;
    if (oldestPending && stuck) {
      const hours = Math.max(
        1,
        Math.round((now.getTime() - new Date((oldestPending as any).createdAt).getTime()) / 3_600_000),
      );
      attention.push({
        key: "purchase",
        severity: "warning",
        title: `A purchase has been pending for ${hours} ${hours === 1 ? "hour" : "hours"}`,
        detail: `${oldestPending.gems.toLocaleString("en-US")} gems, $${(oldestPending.amountCents / 100).toFixed(2)}, from ${(oldestPending as any).user?.username ?? "someone"}`,
        href: "/admin/money",
        action: "Review",
      });
    }
    const overview: AdminOverview = {
      people: { total, new7, new30, signupsByDay },
      storage: { used, byApp },
      money: {
        gems30: bought[0]?.gems ?? 0,
        cents30: bought[0]?.cents ?? 0,
        purchases30: bought[0]?.count ?? 0,
        pending,
      },
      tasks: { enabled: tasks, failing: failing.length },
      attention,
      recent: recent.map(serializeAudit),
    };
    res.json({ status: true, message: "", data: { overview } });
  });
}
