import type { XenSplit, XenSplitExpense, DirectDebt, BreakdownLine } from "../hooks/xensplit/types";

// Share of an expense owed by a single participant. Mirrors the server math in
// src/server/utils/xenSplitUtils.ts (equal = amount / splits.length, otherwise
// the explicit amount_owed / percentage on the split).
function shareFor(expense: XenSplitExpense, split: XenSplitExpense["splits"][number]): number {
  if (split.amount_owed !== undefined) return split.amount_owed;
  if (split.percentage !== undefined) return (expense.amount * split.percentage) / 100;
  if (expense.splits.length > 0) return expense.amount / expense.splits.length;
  return 0;
}

// Distinct currencies present across (non-held) expenses, settlements, and exchanges,
// with the group's default currency sorted first.
export function currenciesInGroup(group: XenSplit): string[] {
  const defaultCurrency = group.default_currency || "CAD";
  const seen = new Set<string>();
  group.expenses.filter((e) => !e.on_hold).forEach((e) => seen.add(e.currency));
  group.settlements.forEach((s) => seen.add(s.currency));
  (group.exchanges ?? []).forEach((ex) => { seen.add(ex.currency_a); seen.add(ex.currency_b); });
  if (seen.size === 0) seen.add(defaultCurrency);
  return [...seen].sort((a, b) => (a === defaultCurrency ? -1 : b === defaultCurrency ? 1 : a.localeCompare(b)));
}

// Raw pairwise debts for one currency, before the greedy simplification that
// produces the suggested transfers. For every expense, each participant owes the
// payer their share; settlements reduce what the payer-of-record owed. Each
// unordered pair is then netted into a single directed debt.
export function computeDirectDebts(group: XenSplit, currency: string): DirectDebt[] {
  // owe[a][b] = how much a owes b directly.
  const owe: { [a: string]: { [b: string]: number } } = {};
  const add = (a: string, b: string, amount: number) => {
    if (a === b) return;
    if (!owe[a]) owe[a] = {};
    owe[a][b] = (owe[a][b] ?? 0) + amount;
  };

  for (const expense of group.expenses) {
    if (expense.on_hold || expense.currency !== currency) continue;
    for (const split of expense.splits) {
      add(split.user_id, expense.paid_by, shareFor(expense, split));
    }
  }

  // A settlement from->to pays down what `from` owed `to`.
  for (const s of group.settlements) {
    if (s.currency !== currency) continue;
    add(s.from, s.to, -s.amount);
  }

  // Exchanges: party_a owes party_b in currency_a, party_b owes party_a in currency_b.
  for (const ex of group.exchanges ?? []) {
    if (ex.currency_a === currency) add(ex.party_a, ex.party_b, ex.amount_a);
    if (ex.currency_b === currency) add(ex.party_b, ex.party_a, ex.amount_b);
  }

  // Net each unordered pair into a single positive directed debt.
  const debts: DirectDebt[] = [];
  const ids = group.members.map((m) => m.user_id);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i];
      const b = ids[j];
      const net = (owe[a]?.[b] ?? 0) - (owe[b]?.[a] ?? 0);
      if (net > 0.01) debts.push({ from: a, to: b, amount: Number(net.toFixed(2)), currency });
      else if (net < -0.01) debts.push({ from: b, to: a, amount: Number((-net).toFixed(2)), currency });
    }
  }
  return debts;
}

// Signed line items explaining a member's net balance in one currency. The sum
// of the line amounts equals the member's net balance (positive = owed to them).
// Labels are written in the third person so they read correctly for any member.
export function computeBalanceBreakdown(group: XenSplit, userId: string, currency: string): BreakdownLine[] {
  const lines: BreakdownLine[] = [];
  const nameOf = (id: string) => group.members.find((m) => m.user_id === id)?.username ?? "someone";

  for (const expense of group.expenses) {
    if (expense.on_hold || expense.currency !== currency) continue;

    // What this user owes on this expense (their share, if a participant).
    const mySplit = expense.splits.find((s) => s.user_id === userId);
    const myShare = mySplit ? shareFor(expense, mySplit) : 0;

    if (expense.paid_by === userId) {
      // Paid the full amount; net credit = amount fronted for everyone else.
      const credit = expense.amount - myShare;
      if (credit > 0.01) {
        lines.push({
          kind: "paid",
          label: `Paid for "${expense.title}"`,
          hint: "Covered the others' shares",
          amount: Number(credit.toFixed(2)),
          date: expense.date,
        });
      }
    } else if (myShare > 0.01) {
      lines.push({
        kind: "share",
        label: `Share of "${expense.title}"`,
        hint: `${nameOf(expense.paid_by)} paid — this share is owed to them`,
        amount: -Number(myShare.toFixed(2)),
        date: expense.date,
      });
    }
  }

  for (const s of group.settlements) {
    if (s.currency !== currency) continue;
    if (s.from === userId) {
      // Paid someone back -> reduces what they owe -> balance increases.
      lines.push({
        kind: "settlement",
        label: `Paid ${nameOf(s.to)} back`,
        hint: "A settlement that cancelled out a debt",
        amount: Number(s.amount.toFixed(2)),
        date: s.settled_at,
      });
    } else if (s.to === userId) {
      // Received a settlement -> reduces what they're owed -> balance decreases.
      lines.push({
        kind: "settlement",
        label: `${nameOf(s.from)} paid them back`,
        hint: "A settlement that cancelled out a debt",
        amount: -Number(s.amount.toFixed(2)),
        date: s.settled_at,
      });
    }
  }

  // Exchanges: party_a owes party_b in currency_a; party_b owes party_a in currency_b.
  for (const ex of group.exchanges ?? []) {
    const otherParty = ex.party_a === userId ? ex.party_b : ex.party_b === userId ? ex.party_a : null;
    if (!otherParty) continue;

    if (ex.currency_a === currency) {
      if (ex.party_a === userId) {
        // This user owes party_b in currency_a -> negative balance effect
        lines.push({
          kind: "exchange",
          label: `Exchange with ${nameOf(ex.party_b)}`,
          hint: `Owes ${nameOf(ex.party_b)} ${ex.amount_a} ${ex.currency_a}`,
          amount: -Number(ex.amount_a.toFixed(2)),
          date: ex.date,
        });
      } else if (ex.party_b === userId) {
        // party_b is owed currency_a from party_a -> positive balance effect
        lines.push({
          kind: "exchange",
          label: `Exchange with ${nameOf(ex.party_a)}`,
          hint: `${nameOf(ex.party_a)} owes them ${ex.amount_a} ${ex.currency_a}`,
          amount: Number(ex.amount_a.toFixed(2)),
          date: ex.date,
        });
      }
    }

    if (ex.currency_b === currency) {
      if (ex.party_b === userId) {
        // party_b owes party_a in currency_b -> negative balance effect
        lines.push({
          kind: "exchange",
          label: `Exchange with ${nameOf(ex.party_a)}`,
          hint: `Owes ${nameOf(ex.party_a)} ${ex.amount_b} ${ex.currency_b}`,
          amount: -Number(ex.amount_b.toFixed(2)),
          date: ex.date,
        });
      } else if (ex.party_a === userId) {
        // party_a is owed currency_b from party_b -> positive balance effect
        lines.push({
          kind: "exchange",
          label: `Exchange with ${nameOf(ex.party_b)}`,
          hint: `${nameOf(ex.party_b)} owes them ${ex.amount_b} ${ex.currency_b}`,
          amount: Number(ex.amount_b.toFixed(2)),
          date: ex.date,
        });
      }
    }
  }

  // Most recent first.
  return lines.sort((a, b) => new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime());
}
