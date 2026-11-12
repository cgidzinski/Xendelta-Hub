import express = require("express");
import { User } from "../../models/user";
import { PushSubscription } from "../../models/pushSubscription";
import { AdminAudit } from "../../models/adminAudit";
import { authenticateToken } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/admin";
import { adminNotifySchema, adminReachQuerySchema, validate, validateQuery } from "../../utils/validation";
import { notify } from "../../utils/notificationUtils";
import { recordAudit, serializeAudit } from "../../utils/adminAudit";
import { AppError } from "../../utils/http";
import type { NotifyAudience } from "@shared/admin";

const admin = [authenticateToken, requireAdmin];
const CHUNK = 10;
const CHANNEL_NAMES: Record<string, string> = { inapp: "in-app", socket: "live", push: "push", email: "email" };

/** The people an audience means, as ids. */
async function audienceIds(audience: NotifyAudience): Promise<string[]> {
  if (audience.type === "everyone") return (await User.find({}, "_id").lean()).map((u) => String(u._id));
  if (audience.type === "role") {
    return (await User.find({ roles: audience.role.toLowerCase() }, "_id").lean()).map((u) => String(u._id));
  }
  return (await User.find({ _id: { $in: audience.userIds } }, "_id").lean()).map((u) => String(u._id));
}

export function registerAdminMessagingRoutes(app: express.Application) {
  // How many people an audience reaches, and how many of them have a device that can get push.
  app.get("/api/admin/notify/reach", ...admin, validateQuery(adminReachQuerySchema), async (req, res) => {
    const { type, role } = adminReachQuerySchema.parse(req.query);
    const ids = await audienceIds(type === "role" ? { type, role: role ?? "" } : { type });
    const devices = await PushSubscription.distinct("userId", { userId: { $in: ids } });
    res.json({ status: true, message: "", data: { people: ids.length, pushDevices: devices.length } });
  });

  // Send a notification to an audience on the chosen channels. Used for broadcasts, a note to one person, and
  // "send a test to me".
  app.post("/api/admin/notify", ...admin, validate(adminNotifySchema), async (req, res) => {
    const input = adminNotifySchema.parse(req.body);
    const ids = await audienceIds(input.audience);
    if (ids.length === 0) throw new AppError(400, "That audience has no one in it");

    let inapp = 0;
    let push = 0;
    let email = 0;
    let errors = 0;
    for (let i = 0; i < ids.length; i += CHUNK) {
      await Promise.all(
        ids.slice(i, i + CHUNK).map(async (id) => {
          try {
            const result = await notify(id, {
              title: input.title,
              message: input.message,
              link: input.link || undefined,
              icon: input.icon || "announcement",
              channels: input.channels,
            });
            if (result.inapp) inapp++;
            if (result.email) email++;
            push += result.push.sent;
          } catch {
            errors++;
          }
        }),
      );
    }

    const only =
      input.audience.type === "users" && ids.length === 1 ? await User.findById(ids[0], "username").lean() : null;
    const target = only
      ? { type: "user" as const, id: String(only._id), label: only.username ?? "" }
      : input.audience.type === "everyone"
        ? { type: "everyone" as const, label: "Everyone" }
        : input.audience.type === "role"
          ? { type: "group" as const, label: `Everyone with the ${input.audience.role} role` }
          : { type: "group" as const, label: `${ids.length} people` };
    await recordAudit(req, {
      action: "notify_send",
      target,
      detail: `"${input.title}" via ${input.channels.map((c) => CHANNEL_NAMES[c] ?? c).join(", ")} to ${ids.length} ${ids.length === 1 ? "person" : "people"}`,
      meta: { title: input.title, channels: input.channels, people: ids.length },
    });

    res.json({
      status: true,
      message: `Sent to ${inapp} ${inapp === 1 ? "person" : "people"}${errors ? `, ${errors} failed` : ""}`,
      data: { people: ids.length, inapp, push, email, errors },
    });
  });

  // Recent broadcasts, from the audit log.
  app.get("/api/admin/broadcasts", ...admin, async (_req, res) => {
    const rows = await AdminAudit.find({ action: "notify_send" }).sort({ createdAt: -1 }).limit(10).lean();
    res.json({ status: true, message: "", data: { items: rows.map(serializeAudit) } });
  });
}
