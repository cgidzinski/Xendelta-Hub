import express = require("express");
import mongoose from "mongoose";
import { ScheduledTask } from "../../models/scheduledTask";
import { PushSubscription } from "../../models/pushSubscription";
import { Conversation } from "../../models/conversation";
import { Message } from "../../models/message";
import { authenticateToken } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/admin";
import {
  adminDeleteChatsSchema,
  adminTaskIdParamSchema,
  adminTaskToggleSchema,
  validate,
  validateParams,
} from "../../utils/validation";
import { isPushConfigured } from "../../utils/pushUtils";
import { largestDocuments } from "../../utils/dbStats";
import { taskLabel } from "../../utils/adminStats";
import { recordAudit } from "../../utils/adminAudit";
import { realtime } from "../../realtime";
import { AppError } from "../../utils/http";
import type { AdminSystemReport } from "@shared/admin";

const admin = [authenticateToken, requireAdmin];
const iso = (d: unknown) => (d ? new Date(d as Date).toISOString() : null);

export function registerAdminSystemRoutes(app: express.Application) {
  // Health, applied migrations, scheduled tasks (with their last error) and the largest documents.
  app.get("/api/admin/system", ...admin, async (_req, res) => {
    const db = mongoose.connection.db;
    const [stats, migrations, tasks, documents, devices] = await Promise.all([
      db ? db.stats().catch(() => null) : null,
      mongoose.connection.collection("migrations").find({}).sort({ createdAt: 1 }).toArray(),
      ScheduledTask.find({}).sort({ enabled: -1, run_at: 1 }).limit(100).lean(),
      largestDocuments(),
      PushSubscription.countDocuments({}),
    ]);

    const report: AdminSystemReport = {
      health: {
        env: process.env.NODE_ENV || "development",
        uptimeSeconds: Math.round(process.uptime()),
        node: process.version,
        database: {
          connected: mongoose.connection.readyState === 1,
          name: db?.databaseName ?? "",
          sizeBytes: (stats?.dataSize ?? 0) + (stats?.indexSize ?? 0),
          collections: stats?.collections ?? 0,
        },
        push: { configured: isPushConfigured(), devices },
      },
      migrations: migrations.map((m: any) => ({
        name: m.name,
        state: m.state,
        appliedAt: iso(m.updatedAt ?? m.createdAt),
      })),
      tasks: tasks.map((t: any) => ({
        _id: String(t._id),
        type: t.task_type,
        label: taskLabel(t),
        frequency: t.frequency ?? null,
        enabled: !!t.enabled,
        nextRun: iso(t.run_at),
        lastRun: iso(t.last_run_at),
        lastError: t.last_error || null,
      })),
      documents,
    };
    res.json({ status: true, message: "", data: { report } });
  });

  // Turn a scheduled task on or off.
  app.put(
    "/api/admin/tasks/:taskId",
    ...admin,
    validateParams(adminTaskIdParamSchema),
    validate(adminTaskToggleSchema),
    async (req, res) => {
      const { enabled } = adminTaskToggleSchema.parse(req.body);
      const task = await ScheduledTask.findById(req.params.taskId).exec();
      if (!task) throw new AppError(404, "Task not found");
      task.enabled = enabled;
      await task.save();
      await recordAudit(req, {
        action: "task_toggle",
        target: { type: "task", id: String(task._id), label: taskLabel(task) },
        detail: `${enabled ? "Turned on" : "Turned off"} ${taskLabel(task)}`,
      });
      res.json({ status: true, message: "Task updated", data: {} });
    },
  );

  // Delete every conversation and message for everyone. The word DELETE must be sent, so a stray request can't do it.
  app.delete("/api/admin/chats", ...admin, validate(adminDeleteChatsSchema), async (req, res) => {
    const conversations = await Conversation.find({}, "members.user_id").lean().exec();
    const messages = (await Message.deleteMany({}).exec()).deletedCount;
    await Conversation.deleteMany({}).exec();
    for (const c of conversations) {
      realtime.toUsers(
        c.members.map((m) => m.user_id),
        "chat:conversation",
        { conversationId: String(c._id), removed: true },
      );
    }
    await recordAudit(req, {
      action: "chats_delete_all",
      target: { type: "chats", label: "All chats" },
      detail: `Deleted ${conversations.length} conversations and ${messages} messages`,
      meta: { conversations: conversations.length, messages },
    });
    res.json({
      status: true,
      message: `Deleted ${messages} messages and ${conversations.length} conversations`,
      data: { messagesDeleted: messages, conversationsDeleted: conversations.length },
    });
  });
}
