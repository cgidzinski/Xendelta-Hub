// Expense-split resolution for the create/update expense routes.
//
// The balance engine (calculateBalances / calculateMinimumTransfers) moved to
// src/shared/xensplit/balances.ts so the client can run the identical math for
// the Settlements page's rewind preview. Re-exported here so existing server
// imports keep working.
import type { XenSplitDocument } from "@shared/xensplit/balances";
export { calculateBalances, calculateMinimumTransfers } from "@shared/xensplit/balances";
export type { Transfer, BalanceMap, Expense, Settlement, Exchange, XenSplitDocument } from "@shared/xensplit/balances";

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
  // Stored splits may hold null for the optional fields; null and undefined both mean "absent" here.
  splits: { user_id: string; amount_owed?: number | null; percentage?: number | null }[],
  allMemberIds: string[],
): { user_id: string; amount_owed: number; percentage?: number | null }[] {
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

/**
 * A group document in the shape the balance engine takes. The schema allows `null` for optional
 * split fields where the engine's (client-shared) types say `undefined`; stored data only ever
 * has the field or nothing, so the two read identically. One documented cast, here, instead of
 * one per route.
 */
export function asBalanceInput(group: object, members: string[]): XenSplitDocument {
  return { ...group, members } as unknown as XenSplitDocument;
}
