// Derived figures for piggy banks, and their wire shape.
//
// A bank's balance is the sum of its ledger, and that sum is computed HERE rather than on
// the client for one reason: the books-list endpoint ships banks without their
// contributions (see serializePiggyBanks), so a client that summed for itself would report
// every bank as empty on that screen. The client is handed `saved` and derives only the
// percentage from it.

import { roundMoney } from "./xenBudgetUtils";

/** What one person has put into a goal, net of anything they took back out. */
export interface PiggyBankPersonSaved {
  user_id: string;
  amount: number;
}

export interface PiggyBankSummary {
  saved: number;
  contribution_count: number;
  last_contribution_at?: string;
  by_person: PiggyBankPersonSaved[];
}

/**
 * The running total and who it came from.
 *
 * Contribution amounts are signed, so a withdrawal subtracts here exactly as it does on
 * the card. `by_person` is biggest first and mirrors BudgetPersonSpend, so the two can be
 * rendered by the same kind of row.
 */
export function summarizePiggyBank(goal: any): PiggyBankSummary {
  const contributions: any[] = goal?.contributions || [];
  let saved = 0;
  let last: Date | undefined;
  const byPerson = new Map<string, number>();

  for (const c of contributions) {
    const amount = Number(c.amount) || 0;
    saved += amount;
    byPerson.set(c.user_id, (byPerson.get(c.user_id) || 0) + amount);
    const date = c.date instanceof Date ? c.date : new Date(c.date);
    if (!isNaN(date.getTime()) && (!last || date > last)) last = date;
  }

  return {
    saved: roundMoney(saved),
    contribution_count: contributions.length,
    ...(last ? { last_contribution_at: last.toISOString() } : {}),
    by_person: [...byPerson.entries()]
      .map(([user_id, amount]) => ({ user_id, amount: roundMoney(amount) }))
      .sort((a, b) => b.amount - a.amount),
  };
}

function serializeContribution(c: any): any {
  const obj = typeof c.toObject === "function" ? c.toObject() : c;
  return {
    ...obj,
    _id: obj._id?.toString(),
    amount: roundMoney(Number(obj.amount) || 0),
    date: obj.date instanceof Date ? obj.date.toISOString() : obj.date,
    item_id: obj.item_id ? obj.item_id.toString() : undefined,
    created_at: obj.created_at instanceof Date ? obj.created_at.toISOString() : obj.created_at,
  };
}

/**
 * One goal on the wire. `includeContributions` is false for the books list, where a year
 * of ledgers across every book would be a lot of payload for a screen that only draws a
 * count - the totals from summarizePiggyBank are always present either way.
 */
export function serializePiggyBank(goal: any, includeContributions: boolean): any {
  const obj = typeof goal.toObject === "function" ? goal.toObject() : goal;
  const summary = summarizePiggyBank(obj);
  const { contributions, ...rest } = obj;
  return {
    ...rest,
    _id: obj._id?.toString(),
    target_amount: roundMoney(Number(obj.target_amount) || 0),
    status: obj.status || "active",
    completed_at: obj.completed_at instanceof Date ? obj.completed_at.toISOString() : obj.completed_at,
    ...summary,
    ...(includeContributions
      ? { contributions: (contributions || []).map(serializeContribution) }
      : {}),
  };
}

export function serializePiggyBanks(goals: any[] | undefined, includeContributions: boolean): any[] {
  return (goals || []).map((g) => serializePiggyBank(g, includeContributions));
}
