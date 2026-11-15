import express = require("express");
import { authenticateToken } from "../../middleware/auth";
import { requireAdmin } from "../../middleware/admin";
import { callerId } from "../../utils/http";
import { recordAudit } from "../../utils/adminAudit";
import {
  adminBillingQuerySchema,
  adminProviderCostParamSchema,
  adminProviderCostSchema,
  validate,
  validateParams,
  validateQuery,
} from "../../utils/validation";
import { UsageRecord } from "../../models/usageRecord";
import { BillingStatement } from "../../models/billingStatement";
import { ProviderCost } from "../../models/providerCost";
import { billingEnforced } from "../../billing/usage";
import {
  BILLING_MARGIN,
  COST_CENTERS,
  billingMonth,
  costOf,
  everythingFree,
  providerCostOf,
  type CostCenter,
} from "@shared/billing";
import { BASE_GEMS_PER_DOLLAR } from "@shared/monetization";
import type { AdminBillingProviderRow, AdminBillingReport } from "@shared/admin";

// The billing report (#360): for a month, what each cost center measured and billed, what it cost us, and what the
// providers actually charged, so the rates and margin can be checked against reality (most useful in shadow mode).

const admin = [authenticateToken, requireAdmin];

const PROVIDER_LABELS: Record<CostCenter["provider"], string> = {
  cloud_storage: "Google Cloud Storage",
  cloudflare_realtime: "Cloudflare Realtime",
  cloudflare_ai: "Cloudflare Workers AI",
  resend: "Resend",
};

const centers = COST_CENTERS as readonly CostCenter[];
const gemsFromCents = (cents: number) => (cents / 100) * BASE_GEMS_PER_DOLLAR;

async function billingReport(month: string): Promise<AdminBillingReport> {
  const [usage, statements, costs, usageMonths, statementMonths] = await Promise.all([
    UsageRecord.aggregate<{ _id: { center: string; type: string }; units: number }>([
      { $match: { month } },
      { $group: { _id: { center: "$center", type: "$account.type" }, units: { $sum: "$units" } } },
    ]).exec(),
    BillingStatement.aggregate<{
      _id: string;
      freeTierUsed: number;
      due: number;
      paid: number;
      unpaid: number;
      count: number;
    }>([
      { $match: { month } },
      {
        $group: {
          _id: "$account.type",
          freeTierUsed: { $sum: "$freeTierUsed" },
          due: { $sum: "$amountDue" },
          paid: { $sum: "$paid" },
          unpaid: { $sum: "$unpaid" },
          count: { $sum: 1 },
        },
      },
    ]).exec(),
    ProviderCost.find({ month }).lean().exec(),
    UsageRecord.distinct("month").exec(),
    ProviderCost.distinct("month").exec(),
  ]);

  const unitsBy = (center: string, type: string) =>
    usage.find((u) => u._id.center === center && u._id.type === type)?.units ?? 0;

  const centerRows = centers.map((c) => {
    const people = unitsBy(c.id, "user");
    const communities = unitsBy(c.id, "community");
    const house = unitsBy(c.id, "house");
    const units = people + communities + house;
    return {
      center: c.id,
      label: c.label,
      payer: c.payer,
      status: c.status,
      provider: c.provider,
      units,
      quantity: units / c.unitsPerDisplayUnit,
      displayUnit: c.displayUnit,
      billedPeople: costOf(c, people),
      billedCommunities: costOf(c, communities),
      costGems: providerCostOf(c, units),
    };
  });

  const providers: AdminBillingProviderRow[] = (Object.keys(PROVIDER_LABELS) as CostCenter["provider"][]).map((p) => {
    const rows = centerRows.filter((r) => r.provider === p);
    const billed = rows.reduce((sum, r) => sum + r.billedPeople + r.billedCommunities, 0);
    const actualCents = costs.find((c) => c.provider === p)?.amountCents ?? null;
    const actualGems = actualCents === null ? null : gemsFromCents(actualCents);
    return {
      provider: p,
      label: PROVIDER_LABELS[p],
      estimatedGems: rows.reduce((sum, r) => sum + r.costGems, 0),
      actualCents,
      actualGems,
      margin: actualGems ? billed / actualGems : null,
    };
  });

  const byType = (type: string) => statements.find((s) => s._id === type);
  const sum = (key: "due" | "paid" | "unpaid" | "count") => statements.reduce((total, s) => total + (s[key] ?? 0), 0);
  const current = billingMonth();
  const months = [...new Set([current, month, ...usageMonths, ...statementMonths])].sort().reverse();

  return {
    month,
    months,
    enforced: billingEnforced(),
    everythingFree: everythingFree(),
    billingMargin: BILLING_MARGIN,
    gemsPerDollar: BASE_GEMS_PER_DOLLAR,
    centers: centerRows,
    providers,
    totals: {
      freeTierPeople: byType("user")?.freeTierUsed ?? 0,
      freeTierCommunities: byType("community")?.freeTierUsed ?? 0,
      due: sum("due"),
      collected: sum("paid"),
      unpaid: sum("unpaid"),
      statements: sum("count"),
    },
  };
}

export function registerAdminBillingRoutes(app: express.Application) {
  app.get("/api/admin/billing", ...admin, validateQuery(adminBillingQuerySchema), async (req, res) => {
    const { month = billingMonth() } = adminBillingQuerySchema.parse(req.query);
    res.json({ status: true, message: "", data: { report: await billingReport(month) } });
  });

  // What a provider actually billed for a month, from its invoice. null clears it.
  app.put(
    "/api/admin/billing/costs/:month/:provider",
    ...admin,
    validateParams(adminProviderCostParamSchema),
    validate(adminProviderCostSchema),
    async (req, res) => {
      const { month, provider } = adminProviderCostParamSchema.parse(req.params);
      const { amountCents } = adminProviderCostSchema.parse(req.body);
      if (amountCents === null) {
        await ProviderCost.deleteOne({ month, provider }).exec();
      } else {
        await ProviderCost.updateOne(
          { month, provider },
          { $set: { amountCents, updatedBy: callerId(req) } },
          { upsert: true },
        ).exec();
      }
      await recordAudit(req, {
        action: "provider_cost_set",
        target: { type: "billing", id: `${month}:${provider}`, label: `${PROVIDER_LABELS[provider]} ${month}` },
        detail:
          amountCents === null
            ? `Cleared the ${PROVIDER_LABELS[provider]} cost for ${month}`
            : `${PROVIDER_LABELS[provider]} cost for ${month}: $${(amountCents / 100).toFixed(2)}`,
        meta: { month, provider, amountCents },
      });
      res.json({ status: true, message: "Saved", data: { report: await billingReport(month) } });
    },
  );
}
