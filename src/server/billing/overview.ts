import { Types } from "mongoose";
import {
  COST_CENTERS,
  billedRate,
  billingMonth,
  ceilGems,
  communitiesBilled,
  everythingFree,
  monthProgress,
  type BillingCenterInfo,
  type BillingOverview,
  type CostCenter,
  type CostCenterId,
  type PastStatement,
  type StatementLine,
} from "@shared/billing";
import { BillingStatement } from "../models/billingStatement";
import { balanceOf } from "./ledger";
import { billingEnforced } from "./usage";
import { currentStatement, unpaidTotal, type BillableAccount } from "./settlement";

// What the Billing view shows for one account (a person's own bill, or a community's): this month so far by cost center,
// the free tier, the balance and how long it lasts, and past statements. Read-only.

const PAST_STATEMENTS = 12;

const centerInfo = (): BillingCenterInfo[] =>
  (COST_CENTERS as readonly CostCenter[])
    .filter((c) => c.payer === "account")
    .map((c) => ({
      id: c.id as CostCenterId,
      label: c.label,
      description: c.description,
      displayUnit: c.displayUnit,
      rate: billedRate(c),
      free: billedRate(c) === 0,
    }));

export async function billingOverview(account: BillableAccount, now: Date = new Date()): Promise<BillingOverview> {
  const month = billingMonth(now);
  const [current, balance, unpaid, past] = await Promise.all([
    currentStatement(account, month),
    balanceOf(account),
    unpaidTotal(account),
    BillingStatement.find({ "account.type": account.type, "account.id": new Types.ObjectId(account.id) })
      .sort({ month: -1 })
      .limit(PAST_STATEMENTS)
      .lean()
      .exec(),
  ]);

  // Early in the month there is too little to go on: project from at least a day's worth.
  const progress = Math.max(monthProgress(month, now), 1 / 31);
  const projectedGems = current.usageGems / progress;
  const projectedDue = ceilGems(Math.max(0, projectedGems - current.freeTierGems));

  const statements: PastStatement[] = past.map((s) => ({
    month: s.month,
    lines: (s.lines ?? []) as StatementLine[],
    usageGems: s.usageGems,
    freeTierUsed: s.freeTierUsed,
    amountDue: s.amountDue,
    paid: s.paid ?? 0,
    unpaid: s.unpaid ?? 0,
    status: (s.status ?? "pending") as PastStatement["status"],
  }));

  return {
    account: { type: account.type, id: account.id },
    month,
    enforced: billingEnforced(),
    everythingFree: everythingFree(),
    centers: centerInfo(),
    current,
    projectedGems,
    projectedDue,
    balance,
    unpaid,
    monthsCovered: projectedDue === 0 ? null : Math.max(0, balance - unpaid) / projectedDue,
    statements,
    ...(account.type === "community" ? { donationsOpen: communitiesBilled() } : {}),
  };
}
