import express = require("express");
import { Types } from "mongoose";
import { usageFor, usageForAll } from "../../utils/xendriveUtils";
import {
  adminDeleteUserSchema,
  adminGemAdjustSchema,
  adminGrantItemSchema,
  adminUpdateUserSchema,
  adminUserIdParamSchema,
  adminUserItemParamSchema,
  adminUserListQuerySchema,
  validate,
  validateParams,
  validateQuery,
} from "../../utils/validation";
import { User } from "../../models/user";
import { GemPurchase } from "../../models/gemPurchase";
import { XenDriveFile } from "../../models/xendriveFile";
import { XenLink } from "../../models/xenlink";
import { Notification } from "../../models/notification";
import { authenticateToken } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/admin";
import { AppError, callerId } from "../../utils/http";
import { ITEMS } from "../../constants/items";
import { unequipIfNotOwned } from "../../utils/cosmetics";
import { SocketManager } from "../../infrastructure/SocketManager";
import { recordAudit } from "../../utils/adminAudit";
import { FREE_STORAGE_BYTES } from "@shared/monetization";
import type { AdminUserDetail, AdminUserRow, UserFilter, UserSort } from "@shared/admin";

const admin = [authenticateToken, requireAdmin];
const NEAR_QUOTA = 0.9;
const DAY = 86_400_000;

const joinedAt = (id: unknown) => (id as Types.ObjectId).getTimestamp().toISOString();
const allowedBytes = (user: any) => FREE_STORAGE_BYTES + (user.xendrive?.spaceAllowed || 0);
const gb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(2)} GB`;

async function loadUser(userId: string) {
  const user = await User.findById(userId).exec();
  if (!user) throw new AppError(404, "User not found");
  return user;
}

export function registerAdminUserRoutes(app: express.Application) {
  // The people list: searched, filtered, sorted and paged on the server. At this scale the whole directory fits in
  // memory, so filters that need storage or purchases are exact rather than approximate.
  app.get("/api/admin/users", ...admin, validateQuery(adminUserListQuerySchema), async (req, res) => {
    const { q, filter = "all", sort = "newest", page = 1, pageSize = 25 } = adminUserListQuerySchema.parse(req.query);

    const [users, usage] = await Promise.all([
      User.find({}, "username email roles avatar xendrive gems").lean().exec(),
      usageForAll(),
    ]);

    const buyers =
      filter === "buyers"
        ? new Set((await GemPurchase.distinct("user", { status: "completed" })).map(String))
        : new Set<string>();
    const weekAgo = Date.now() - 7 * DAY;
    const needle = (q ?? "").trim().toLowerCase();

    let rows: AdminUserRow[] = users.map((u: any) => {
      const used = usage.get(String(u._id)) ?? { fileCount: 0, spaceUsed: 0 };
      return {
        _id: String(u._id),
        username: u.username ?? "",
        email: u.email ?? "",
        roles: (u.roles ?? []).map((r: string) => r.toLowerCase()),
        avatar: u.avatar || "/avatars/default-avatar.png",
        joinedAt: joinedAt(u._id),
        gems: u.gems ?? 0,
        storage: { used: used.spaceUsed, allowed: allowedBytes(u), files: used.fileCount },
      };
    });

    const matches: Record<UserFilter, (r: AdminUserRow) => boolean> = {
      all: () => true,
      admins: (r) => r.roles.includes("admin"),
      near_quota: (r) => r.storage.used / r.storage.allowed >= NEAR_QUOTA,
      buyers: (r) => buyers.has(r._id),
      new: (r) => new Date(r.joinedAt).getTime() >= weekAgo,
    };
    rows = rows.filter(matches[filter]);
    if (needle) {
      rows = rows.filter(
        (r) =>
          r.username.toLowerCase().includes(needle) ||
          r.email.toLowerCase().includes(needle) ||
          r.roles.some((role) => role.includes(needle)),
      );
    }

    const sorters: Record<UserSort, (a: AdminUserRow, b: AdminUserRow) => number> = {
      newest: (a, b) => b.joinedAt.localeCompare(a.joinedAt),
      name: (a, b) => a.username.localeCompare(b.username),
      storage: (a, b) => b.storage.used / b.storage.allowed - a.storage.used / a.storage.allowed,
    };
    rows.sort(sorters[sort]);

    const start = (page - 1) * pageSize;
    res.json({
      status: true,
      message: "",
      data: { items: rows.slice(start, start + pageSize), total: rows.length, page, pageSize },
    });
  });

  // One person, for their page.
  app.get("/api/admin/users/:userId", ...admin, validateParams(adminUserIdParamSchema), async (req, res) => {
    const user = await loadUser(req.params.userId as string);
    const id = String(user._id);
    const [usage, purchases, appBytes] = await Promise.all([
      usageFor(id),
      GemPurchase.aggregate<{ count: number; gems: number }>([
        { $match: { user: user._id, status: "completed" } },
        { $group: { _id: null, count: { $sum: 1 }, gems: { $sum: "$gems" } } },
      ]),
      XenDriveFile.aggregate<{ size: number }>([
        { $match: { owner_id: user._id, "source.app": { $exists: true } } },
        { $group: { _id: null, size: { $sum: { $ifNull: ["$size", 0] } } } },
      ]),
    ]);
    const detail: AdminUserDetail = {
      _id: id,
      username: user.username ?? "",
      email: user.email ?? "",
      roles: (user.roles ?? []).map((r) => r.toLowerCase()),
      avatar: user.avatar || "/avatars/default-avatar.png",
      joinedAt: joinedAt(user._id),
      gems: user.gems ?? 0,
      storage: { used: usage.spaceUsed, allowed: allowedBytes(user), files: usage.fileCount },
      inventory: (user.inventory ?? []).map((i) => ({
        itemKey: i.itemKey,
        name: i.name ?? i.itemKey,
        used: !!i.used,
        purchasedAt: (i.purchasedAt ?? new Date(0)).toISOString(),
      })),
      extraSpace: user.xendrive?.spaceAllowed ?? 0,
      appBytes: appBytes[0]?.size ?? 0,
      providers: (user.authProviders ?? []).filter((p) => p.isActive).map((p) => p.provider),
      purchases: { count: purchases[0]?.count ?? 0, gems: purchases[0]?.gems ?? 0 },
      badge: user.cosmetics?.badge ?? undefined,
    };
    res.json({ status: true, message: "", data: { user: detail } });
  });

  // Roles and extra storage. Each change is written to the audit log with before and after.
  app.put(
    "/api/admin/users/:userId",
    ...admin,
    validateParams(adminUserIdParamSchema),
    validate(adminUpdateUserSchema),
    async (req, res) => {
      const { roles, xendriveQuota } = adminUpdateUserSchema.parse(req.body);
      const user = await loadUser(req.params.userId as string);
      const target = { type: "user" as const, id: String(user._id), label: user.username ?? "" };

      if (roles !== undefined) {
        const before = (user.roles ?? []).map((r) => r.toLowerCase());
        const after = roles.map((r) => r.toLowerCase());
        // The last admin can't remove their own admin role by accident.
        if (String(user._id) === callerId(req) && before.includes("admin") && !after.includes("admin")) {
          throw new AppError(400, "You can't remove your own admin role");
        }
        user.set("roles", after);
        if (before.join(",") !== after.join(",")) {
          await user.save();
          await recordAudit(req, {
            action: "role_change",
            target,
            detail: `Roles: ${before.join(", ") || "none"} to ${after.join(", ") || "none"}`,
            meta: { before, after },
          });
        }
      }

      if (xendriveQuota !== undefined) {
        const before = user.xendrive?.spaceAllowed ?? 0;
        user.xendrive = { spaceAllowed: xendriveQuota };
        await user.save();
        if (before !== xendriveQuota) {
          await recordAudit(req, {
            action: "storage_change",
            target,
            detail: `Extra space ${gb(before)} to ${gb(xendriveQuota)} (allowance ${gb(FREE_STORAGE_BYTES + xendriveQuota)})`,
            meta: { before, after: xendriveQuota },
          });
        }
      }
      await user.save();
      res.json({ status: true, message: "User updated successfully", data: {} });
    },
  );

  app.post(
    "/api/admin/users/:userId/avatar/reset",
    ...admin,
    validateParams(adminUserIdParamSchema),
    async (req, res) => {
      const user = await loadUser(req.params.userId as string);
      user.avatar = "/avatars/default-avatar.png";
      await user.save();
      await recordAudit(req, {
        action: "avatar_reset",
        target: { type: "user", id: String(user._id), label: user.username ?? "" },
        detail: "Reset the avatar",
      });
      res.json({ status: true, message: "Avatar reset successfully", data: {} });
    },
  );

  // Deleting a person needs their username typed; the server checks it, not just the dialog.
  app.delete(
    "/api/admin/users/:userId",
    ...admin,
    validateParams(adminUserIdParamSchema),
    validate(adminDeleteUserSchema),
    async (req, res) => {
      if (req.params.userId === callerId(req)) throw new AppError(400, "You can't delete yourself");
      const user = await loadUser(req.params.userId as string);
      if (adminDeleteUserSchema.parse(req.body).confirm !== user.username) {
        throw new AppError(400, "Type the person's username to confirm");
      }
      const files = (await usageFor(String(user._id))).fileCount;
      await User.deleteOne({ _id: user._id }).exec();
      await XenLink.deleteMany({ owner_id: String(user._id) }).exec();
      await recordAudit(req, {
        action: "user_delete",
        target: { type: "user", id: String(user._id), label: user.username ?? "" },
        detail: `Deleted the person and ${files} ${files === 1 ? "file" : "files"}`,
      });
      res.json({ status: true, message: "User deleted successfully", data: {} });
    },
  );

  // A correction or refund. The reason is required and goes in the audit log; a balance can't go below zero.
  app.post(
    "/api/admin/users/:userId/gems",
    ...admin,
    validateParams(adminUserIdParamSchema),
    validate(adminGemAdjustSchema),
    async (req, res) => {
      const { amount, reason } = adminGemAdjustSchema.parse(req.body);
      const user = await loadUser(req.params.userId as string);
      const updated = await User.findOneAndUpdate(
        { _id: user._id, ...(amount < 0 ? { gems: { $gte: -amount } } : {}) },
        { $inc: { gems: amount } },
        { new: true, projection: "gems" },
      ).exec();
      if (!updated) throw new AppError(400, "That would take the balance below zero");
      await recordAudit(req, {
        action: "gem_adjust",
        target: { type: "user", id: String(user._id), label: user.username ?? "" },
        detail: `${amount > 0 ? "+" : ""}${amount.toLocaleString("en-US")} gems. Reason: ${reason}`,
        meta: { amount, reason, balance: updated.gems },
      });
      res.json({ status: true, message: "Balance adjusted", data: { gems: updated.gems } });
    },
  );

  app.post(
    "/api/admin/users/:userId/give-item",
    ...admin,
    validateParams(adminUserIdParamSchema),
    validate(adminGrantItemSchema),
    async (req, res) => {
      const item = ITEMS[adminGrantItemSchema.parse(req.body).itemKey];
      // A gift only lands in the inventory; the person redeems it themselves. Applying the effect here as
      // well used to leave the item redeemable, so a gifted voucher paid out twice.
      if (!item || item.legacy) throw new AppError(404, "Item not found");
      const user = await loadUser(req.params.userId as string);

      user.inventory.push({
        itemKey: item.key,
        name: item.name,
        description: item.description,
        image: item.image,
        redeemable: item.redeemable,
        purchasedAt: new Date(),
        used: false,
      });
      await user.save();

      const notification = await new Notification({
        userId: user._id,
        title: "You got a gift!",
        message: `You received a ${item.name}`,
        icon: "announcement",
        unread: true,
        time: new Date(),
      }).save();
      try {
        SocketManager.getInstance().sendNotification(String(user._id), notification);
      } catch (err) {
        console.error("Failed to emit socket notification:", err);
      }

      await recordAudit(req, {
        action: "item_give",
        target: { type: "user", id: String(user._id), label: user.username ?? "" },
        detail: `Gave ${item.name}`,
        meta: { itemKey: item.key },
      });
      res.json({ status: true, message: `Gave ${item.name} to ${user.username}`, data: {} });
    },
  );

  app.delete(
    "/api/admin/users/:userId/inventory/:itemKey",
    ...admin,
    validateParams(adminUserItemParamSchema),
    async (req, res) => {
      const itemKey = req.params.itemKey as string;
      const user = await loadUser(req.params.userId as string);
      const index = user.inventory.findIndex((i) => i.itemKey === itemKey);
      if (index === -1) throw new AppError(404, "Item not found in user inventory");
      user.inventory.splice(index, 1);
      await user.save();
      await unequipIfNotOwned(user._id, itemKey);
      await recordAudit(req, {
        action: "item_remove",
        target: { type: "user", id: String(user._id), label: user.username ?? "" },
        detail: `Removed ${ITEMS[itemKey]?.name ?? itemKey}`,
        meta: { itemKey },
      });
      res.json({ status: true, message: `Removed ${itemKey} from ${user.username}`, data: {} });
    },
  );
}
