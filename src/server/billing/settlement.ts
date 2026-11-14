import { Types } from "mongoose";
import {
  BILLING_MARGIN,
  COMMUNITY_FREE_TIER_GEMS,
  FREE_TIER_WARNING_SHARE,
  PERSON_FREE_TIER_GEMS,
  billingMonth,
  ceilGems,
  formatWholeGems,
  statementOf,
  type Statement,
} from "@shared/billing";
import { BillingStatement, type BillingStatementDocument } from "../models/billingStatement";
import { BillingNotice } from "../models/billingNotice";
import { UsageRecord } from "../models/usageRecord";
import { Community } from "../models/community";
import { notify } from "../utils/notificationUtils";
import { AppError } from "../utils/http";
import { HOUSE, balanceOf, transfer, type GemAccount } from "./ledger";
import { billingEnforced, usageFor } from "./usage";
import { announceFund } from "./fund";

// Month-end settlement (docs/billing.md): each closed month becomes one statement per billing account that used
// something, paid from the person's gems or the community's fund. And `canSpend`, the one check a cost center makes
// before starting something that costs money.

export type BillableAccount = Exclude<GemAccount, { type: "house" }>;

export const freeTierFor = (account: BillableAccount) =>
  account.type === "user" ? PERSON_FREE_TIER_GEMS : COMMUNITY_FREE_TIER_GEMS;

const accountQuery = (account: BillableAccount) => ({
  "account.type": account.type,
  "account.id": new Types.ObjectId(account.id),
});

/** This month so far for an account, as a statement (nothing is charged by reading it). */
export async function currentStatement(account: BillableAccount, month = billingMonth()): Promise<Statement> {
  return statementOf(await usageFor(account, month), freeTierFor(account));
}

/** Whole gems owed from earlier months that couldn't be paid. */
export async function unpaidTotal(account: BillableAccount): Promise<number> {
  const rows = await BillingStatement.find({ ...accountQuery(account), status: "unpaid" }, "unpaid")
    .lean()
    .exec();
  return rows.reduce((sum, r) => sum + (r.unpaid ?? 0), 0);
}

/**
 * May this account start something that costs money (an upload, a call, a scan)? Always yes in shadow mode. Otherwise
 * yes while this month's usage is inside the free tier, or while the balance still covers what this month has cost
 * beyond it (rounded up) plus anything left unpaid from earlier months.
 */
export async function canSpend(account: BillableAccount): Promise<boolean> {
  if (!billingEnforced()) return true;
  const [statement, unpaid, balance] = await Promise.all([
    currentStatement(account),
    unpaidTotal(account),
    balanceOf(account),
  ]);
  if (unpaid === 0 && statement.usageGems < statement.freeTierGems) return true;
  return balance - statement.amountDue - unpaid > 0;
}

/** Throws a 402 explaining why, when `canSpend` says no. */
export async function assertCanSpend(account: BillableAccount): Promise<void> {
  if (await canSpend(account)) return;
  throw new AppError(
    402,
    account.type === "community"
      ? "This community has used its free allowance for the month and its fund is empty. Donate gems to keep going."
      : "You've used your free allowance for the month. Add gems to keep going.",
    { billing: true },
  );
}

/** Every billing account (people and communities) that used something in a month. */
async function accountsWithUsage(month: string): Promise<BillableAccount[]> {
  const rows = await UsageRecord.aggregate<{ _id: { type: string; id: Types.ObjectId } }>([
    { $match: { month, "account.type": { $in: ["user", "community"] } } },
    { $group: { _id: { type: "$account.type", id: "$account.id" } } },
  ]).exec();
  return rows.map((r) => ({ type: r._id.type as "user" | "community", id: String(r._id.id) }));
}

/** Who to tell about an account's bill: the person, or every member of the community. */
async function recipients(account: BillableAccount): Promise<string[]> {
  if (account.type === "user") return [account.id];
  const community = await Community.findById(account.id, "members").lean().exec();
  return (community?.members ?? []).map((m) => m.user_id);
}

const billingLink = (account: BillableAccount) =>
  account.type === "user" ? "/internal/billing" : `/internal/communities/${account.id}/settings/billing`;

/** Pay a written statement (when enforced), then record how it ended. Safe to run again on the same statement. */
async function settleStatement(statement: BillingStatementDocument): Promise<void> {
  const account = { type: statement.account!.type, id: String(statement.account!.id) } as BillableAccount;
  const due = statement.amountDue;
  let update: Record<string, unknown>;

  if (due === 0) {
    update = { status: "free", paid: 0, unpaid: 0 };
  } else if (!billingEnforced()) {
    update = { status: "shadow", paid: 0, unpaid: 0 };
  } else {
    try {
      const tx = await transfer({
        from: account,
        to: HOUSE,
        amount: due,
        kind: "bill",
        idempotencyKey: `bill:${account.type}:${account.id}:${statement.month}`,
        meta: { month: statement.month, statementId: String(statement._id) },
      });
      update = { status: "paid", paid: due, unpaid: 0, transactionId: tx._id };
    } catch (e) {
      // The balance didn't cover it: nothing is taken, and the whole amount stays owed. What happens to an unpaid bill
      // beyond blocking new spending is decided per cost center.
      if (!(e instanceof AppError) || e.status !== 402) throw e;
      update = { status: "unpaid", paid: 0, unpaid: due };
    }
  }
  await BillingStatement.updateOne({ _id: statement._id, status: "pending" }, { $set: update }).exec();

  if (update.status === "paid" && account.type === "community") {
    const community = await Community.findById(account.id).exec();
    if (community) announceFund(community, await balanceOf(account));
  }

  if (due > 0 && !statement.notifiedAt) {
    const claimed = await BillingStatement.updateOne(
      { _id: statement._id, notifiedAt: { $exists: false } },
      { $set: { notifiedAt: new Date() } },
    ).exec();
    if (claimed.modifiedCount === 1) {
      const what = account.type === "community" ? "Your community's bill" : "Your bill";
      const how =
        update.status === "paid"
          ? `${formatWholeGems(due)}, paid.`
          : update.status === "unpaid"
            ? `${formatWholeGems(due)}, not paid yet: add gems to keep using what costs money.`
            : `${formatWholeGems(due)}. Nothing is being charged yet.`;
      for (const userId of await recipients(account)) {
        await notify(userId, {
          title: `${what} for ${statement.month}`,
          message: how,
          link: billingLink(account),
          icon: "announcement",
        });
      }
    }
  }
}

/** Close one month for one account: write its statement (once) and settle it. */
async function settleAccountMonth(account: BillableAccount, month: string): Promise<void> {
  let statement = await BillingStatement.findOne({ ...accountQuery(account), month }).exec();
  if (!statement) {
    const s = statementOf(await usageFor(account, month), freeTierFor(account));
    try {
      statement = await BillingStatement.create({
        account: { type: account.type, id: new Types.ObjectId(account.id) },
        month,
        lines: s.lines,
        margin: BILLING_MARGIN,
        usageGems: s.usageGems,
        freeTierGems: s.freeTierGems,
        freeTierUsed: s.freeTierUsed,
        amountDue: s.amountDue,
      });
    } catch (e) {
      if ((e as { code?: number })?.code !== 11000) throw e;
      statement = await BillingStatement.findOne({ ...accountQuery(account), month }).exec();
    }
  }
  if (statement && statement.status === "pending") await settleStatement(statement);
}

/** Close a month: a statement for every account that used something in it. Idempotent. */
export async function settleMonth(month: string): Promise<{ accounts: number }> {
  const accounts = await accountsWithUsage(month);
  for (const account of accounts) {
    try {
      await settleAccountMonth(account, month);
    } catch (e) {
      console.error(`Billing: could not settle ${account.type} ${account.id} for ${month}:`, e);
    }
  }
  return { accounts: accounts.length };
}

/**
 * Settle every closed month that still has accounts without a finished statement, so a server that was down on the
 * 1st catches up. Runs hourly; cheap when there is nothing to do.
 */
export async function settleClosedMonths(now: Date = new Date()): Promise<string[]> {
  const current = billingMonth(now);
  const months = (await UsageRecord.distinct("month", { month: { $lt: current } }).exec()).sort();
  const settled: string[] = [];
  for (const month of months) {
    const [accounts, done] = await Promise.all([
      accountsWithUsage(month),
      BillingStatement.countDocuments({ month, status: { $ne: "pending" } }).exec(),
    ]);
    if (done >= accounts.length) continue;
    await settleMonth(month);
    settled.push(month);
  }
  return settled;
}

/** Tell accounts that have used most of this month's free tier, once per account and month. */
export async function warnNearFreeTier(now: Date = new Date()): Promise<number> {
  const month = billingMonth(now);
  let warned = 0;
  for (const account of await accountsWithUsage(month)) {
    const statement = await currentStatement(account, month);
    if (statement.freeTierGems <= 0 || statement.usageGems < statement.freeTierGems * FREE_TIER_WARNING_SHARE) continue;
    try {
      await BillingNotice.create({
        account: { type: account.type, id: new Types.ObjectId(account.id) },
        month,
        kind: "free_tier_warning",
      });
    } catch (e) {
      if ((e as { code?: number })?.code === 11000) continue;
      throw e;
    }
    const left = ceilGems(statement.freeTierLeft);
    for (const userId of await recipients(account)) {
      await notify(userId, {
        title:
          account.type === "community"
            ? "Your community's free allowance is nearly used"
            : "Your free allowance is nearly used",
        message: `${formatWholeGems(left)} left this month.`,
        link: billingLink(account),
        icon: "announcement",
      });
    }
    warned++;
  }
  return warned;
}

/** The hourly billing job: close finished months, then warn anyone near their free tier. */
export async function runBillingJobs(): Promise<void> {
  await settleClosedMonths();
  await warnNearFreeTier();
}
