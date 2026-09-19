import type { XenSplit, DirectDebt, BreakdownLine } from "../hooks/xensplit/types";
import type { XenSplitDocument } from "../../shared/xensplit/balances";
import { computeDirectDebts as computeSharedDirectDebts, shareFor } from "../../shared/xensplit/debts";

/** The group in the shape the shared engines take — members as bare ids. */
export function toCalcDoc(group: XenSplit): XenSplitDocument {
  return {
    members: group.members.map((m) => m.user_id),
    expenses: group.expenses,
    settlements: group.settlements,
    exchanges: group.exchanges ?? [],
  } as XenSplitDocument;
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

// Raw pairwise debts for one currency — the same engine the server serves the
// pending list from, so the Explain page and the Settlements page cannot disagree.
export function computeDirectDebts(group: XenSplit, currency: string): DirectDebt[] {
  return computeSharedDirectDebts(toCalcDoc(group), currency);
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
