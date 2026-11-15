import { Types } from "mongoose";
import { billingMonth, isCostCenterId, type CostCenterId, type UsageLine } from "@shared/billing";
import { UsageRecord } from "../models/usageRecord";
import type { GemAccount } from "./ledger";

// The usage meter: what each billing account (a person, a community, or the house for costs nobody is billed for) used
// of each cost center this month. A cost center calls `recordUsage` where it observes the usage on the server;
// nothing is ever taken from what a client reports. docs/billing.md has how to wire a new one.

/**
 * Shadow mode while off (the default): usage is measured and bills are shown, but nothing is charged and nothing is
 * blocked. Turned on with BILLING_ENFORCED=true once the rates have been checked against the real provider bills.
 */
export const billingEnforced = () => process.env.BILLING_ENFORCED === "true";

const storedAccount = (account: GemAccount) =>
  account.type === "house"
    ? { "account.type": "house", "account.id": null }
    : { "account.type": account.type, "account.id": new Types.ObjectId(account.id) };

/**
 * Add usage to an account's month. `units` are whole units of the center (bytes, byte-days, scans). Never throws: a
 * tally that can't be kept must not break the request that caused it.
 */
export async function recordUsage(
  account: GemAccount,
  center: CostCenterId,
  units: number,
  at: Date = new Date(),
): Promise<void> {
  try {
    if (!isCostCenterId(center)) throw new Error(`Unknown cost center "${center}"`);
    if (!Number.isFinite(units) || units <= 0) return;
    await UsageRecord.updateOne(
      { ...storedAccount(account), month: billingMonth(at), center },
      { $inc: { units: Math.round(units) } },
      { upsert: true },
    ).exec();
  } catch (e) {
    console.error(`Billing: could not record ${center} usage:`, e);
  }
}

/** An account's usage for a month (default: this month), one line per center it used. */
export async function usageFor(account: GemAccount, month: string = billingMonth()): Promise<UsageLine[]> {
  const rows = await UsageRecord.find({ ...storedAccount(account), month }, "center units")
    .lean()
    .exec();
  return rows.map((r) => ({ center: r.center, units: r.units ?? 0 }));
}
