import express = require("express");
import { GemPurchase } from "../../models/gemPurchase";
import { authenticateToken } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/admin";
import { adminPurchasesQuerySchema, validateQuery } from "../../utils/validation";
import { SHOP_ITEMS } from "../../constants/shopItems";
import { ITEMS } from "../../constants/items";
import { DAY_MS } from "../../utils/adminStats";
import { formatMoney } from "@shared/money";
import type { AdminMoneyReport, AdminPurchase } from "@shared/admin";

const admin = [authenticateToken, requireAdmin];

const money = (cents: number, currency = "USD") => formatMoney(cents / 100, currency, { symbol: "narrow" });

export function registerAdminMoneyRoutes(app: express.Application) {
  // Gem purchases (read-only) and what the shop sells. Money and refunds are handled at the payment provider.
  app.get("/api/admin/purchases", ...admin, validateQuery(adminPurchasesQuerySchema), async (req, res) => {
    const { status, page = 1, pageSize = 25 } = adminPurchasesQuerySchema.parse(req.query);
    const since30 = new Date(Date.now() - 30 * DAY_MS);
    const filter = status ? { status } : {};

    const [total, rows, bought, pending, oldestPending, failed30] = await Promise.all([
      GemPurchase.countDocuments(filter),
      GemPurchase.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .populate("user", "username")
        .lean(),
      GemPurchase.aggregate<{ gems: number; cents: number; count: number }>([
        { $match: { status: "completed", completedAt: { $gte: since30 } } },
        { $group: { _id: null, gems: { $sum: "$gems" }, cents: { $sum: "$amountCents" }, count: { $sum: 1 } } },
      ]),
      GemPurchase.countDocuments({ status: "pending" }),
      GemPurchase.findOne({ status: "pending" }).sort({ createdAt: 1 }).lean(),
      GemPurchase.countDocuments({ status: "failed", createdAt: { $gte: since30 } }),
    ]);

    const purchases: AdminPurchase[] = (rows as any[]).map((p) => ({
      _id: String(p._id),
      createdAt: new Date(p.createdAt).toISOString(),
      user: p.user ? { _id: String(p.user._id), username: p.user.username ?? "" } : null,
      itemId: p.itemId,
      gems: p.gems,
      amountCents: p.amountCents,
      currency: p.currency,
      provider: p.provider,
      status: p.status,
    }));

    const report: AdminMoneyReport = {
      summary: {
        cents30: bought[0]?.cents ?? 0,
        gems30: bought[0]?.gems ?? 0,
        purchases30: bought[0]?.count ?? 0,
        pending,
        failed30,
        oldestPendingMinutes: oldestPending
          ? Math.round((Date.now() - new Date((oldestPending as any).createdAt).getTime()) / 60_000)
          : null,
      },
      purchases: { items: purchases, total, page, pageSize },
      catalogue: SHOP_ITEMS.map((s) => ({
        id: s.id,
        name: ITEMS[s.itemKey]?.name ?? s.itemKey,
        kind: s.category,
        price:
          s.priceCents !== undefined
            ? money(s.priceCents, s.currency)
            : `${(s.price ?? 0).toLocaleString("en-US")} gems`,
      })),
    };
    res.json({ status: true, message: "", data: { report } });
  });
}
