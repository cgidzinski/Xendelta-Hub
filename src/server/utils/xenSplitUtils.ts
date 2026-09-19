// Expense-split resolution for the create/update expense routes.
//
// The balance engine (calculateBalances / calculateMinimumTransfers) moved to
// src/shared/xensplit/balances.ts so the client can run the identical math for
// the Settlements page's rewind preview. Re-exported here so existing server
// imports keep working.
import { calculateBalances, type Transfer } from "../../shared/xensplit/balances";
import { calculateAnchoredTransfers } from "../../shared/xensplit/anchor";

export {
  calculateBalances,
  calculateMinimumTransfers,
} from "../../shared/xensplit/balances";
export { calculateAnchoredTransfers } from "../../shared/xensplit/anchor";
export type {
  Transfer,
  BalanceMap,
  Expense,
  Settlement,
  Exchange,
  XenSplitDocument,
} from "../../shared/xensplit/balances";

/**
 * The pending transfer list for a group, anchored to the plan it last recorded.
 *
 * Takes the group document (populated members or raw ObjectIds both work) and
 * returns the same shape the balances route serves.
 */
export function currentPlan(group: any): Transfer[] {
  const doc = {
    members: (group.members ?? []).map((m: any) => (m?._id ? m._id.toString() : String(m))),
    expenses: group.expenses ?? [],
    settlements: group.settlements ?? [],
    exchanges: group.exchanges ?? [],
  };
  return calculateAnchoredTransfers(calculateBalances(doc), group.settlement_plan ?? []);
}

/**
 * Re-records the group's settlement plan. Call immediately before `group.save()`
 * in any route that moves a balance, so the next recalculation is anchored to the
 * list members were actually looking at.
 *
 * Order matters: call it AFTER applying the mutation. The plan it stores is the
 * post-mutation routing, anchored to the pre-mutation one — that chaining is what
 * keeps a row from growing or a new counterparty from appearing.
 *
 * Missing a call site degrades gracefully; it only means the next recalculation
 * anchors to an older plan.
 */
export function recordPlan(group: any): void {
  group.settlement_plan = currentPlan(group);
}

/**
 * Seeds the plan from the group's current state if it has none yet.
 *
 * Call BEFORE applying a mutation. Without it the first settlement in every group
 * that predates anchoring still churns, because the list the member was looking at
 * when they hit "settle" was never written down.
 */
export function seedPlan(group: any): void {
  if (!group.settlement_plan || group.settlement_plan.length === 0) {
    group.settlement_plan = currentPlan(group);
  }
}

// Resolves the splits to store for an expense given its split_type. Mirrors the
// pre-existing inline logic from the create/update expense route handlers:
// - equal: divides evenly among the given participants (or all group members if none given).
// - percent: converts each percentage to an amount_owed, then nudges the last split's
//   percentage/amount_owed so percentages sum to exactly 100 (rounding correction).
// - exact: nudges the last split's amount_owed so amounts sum to exactly `amount`
//   (rounding correction).
export function resolveSplits(
  splitType: "equal" | "exact" | "percent",
  amount: number,
  splits: { user_id: string; amount_owed?: number; percentage?: number }[],
  allMemberIds: string[],
): { user_id: string; amount_owed: number; percentage?: number }[] {
  if (splitType === "equal") {
    const participants = splits.length > 0 ? splits.map((s) => s.user_id) : allMemberIds;
    const perPerson = amount / participants.length;
    return participants.map((user_id) => ({ user_id, amount_owed: perPerson }));
  }

  if (splitType === "percent") {
    const resolved = splits.map((s) => ({
      user_id: s.user_id,
      amount_owed: (amount * s.percentage!) / 100,
      percentage: s.percentage,
    }));
    const percentSum = resolved.reduce((acc, s) => acc + (s.percentage || 0), 0);
    const percentDiff = 100 - percentSum;
    if (Math.abs(percentDiff) > 0.001 && resolved.length > 0) {
      const last = resolved[resolved.length - 1];
      last.percentage = (last.percentage || 0) + percentDiff;
      last.amount_owed = (amount * last.percentage) / 100;
    }
    return resolved;
  }

  // exact
  const resolved = splits.map((s) => ({ ...s, amount_owed: s.amount_owed ?? 0 }));
  const exactSum = resolved.reduce((acc, s) => acc + (s.amount_owed || 0), 0);
  const exactDiff = amount - exactSum;
  if (Math.abs(exactDiff) > 0.001 && resolved.length > 0) {
    resolved[resolved.length - 1].amount_owed += exactDiff;
  }
  return resolved;
}
