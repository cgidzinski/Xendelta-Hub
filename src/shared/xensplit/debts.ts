// Real person-to-person debts: who owes whom, derived straight from the expenses
// people actually shared. This is what the pending list is built from.
//
// The alternative — routing net balances through calculateMinimumTransfers — mesh
// everyone's position together, which means one member's payment can re-cut
// another member's payments. Paying someone off-plan is enough to shatter a row
// belonging to somebody who had nothing to do with it: if A is owed $100 by you
// and B hands A $90 unprompted, A is owed almost nothing, and your $100 has to be
// re-routed to whoever is left. Here that cannot happen. Your row comes from your
// own expense with A, and B's payment lands where it belongs — A now owes B back.
//
// The cost is honest and accepted: more payments than the theoretical minimum. The
// simplified routing still exists, as something to look at on the Explain page,
// not something to settle from.
//
// Imported by both sides like balances.ts, so it stays resolution-agnostic: ESM
// syntax only, no Node or DOM APIs, no mongoose.

import type { Expense, XenSplitDocument } from "./balances";

// Matches the threshold the balance engine treats as "already settled".
const EPSILON = 0.01;

export interface DirectDebt {
  from: string;
  to: string;
  amount: number;
  currency: string;
}

/** Share of an expense owed by one participant. Mirrors the math in balances.ts. */
export function shareFor(expense: Expense, split: Expense["splits"][number]): number {
  if (split.amount_owed !== undefined) return split.amount_owed;
  if (split.percentage !== undefined) return (expense.amount * split.percentage) / 100;
  if (expense.splits.length > 0) return expense.amount / expense.splits.length;
  return 0;
}

/**
 * Everyone the document touches, not just `doc.members`.
 *
 * calculateBalances keeps a position for anyone who paid an expense or holds a
 * split whether or not they are still a member, and a member can be removed while
 * holding a balance. Enumerating pairs from `members` alone would drop those debts
 * from the pending list while the balances above it still showed them.
 */
export function participantsOf(doc: XenSplitDocument): string[] {
  const seen = new Set<string>(doc.members ?? []);
  for (const expense of doc.expenses ?? []) {
    seen.add(expense.paid_by);
    for (const split of expense.splits ?? []) seen.add(split.user_id);
  }
  for (const settlement of doc.settlements ?? []) {
    seen.add(settlement.from);
    seen.add(settlement.to);
  }
  for (const exchange of doc.exchanges ?? []) {
    seen.add(exchange.party_a);
    seen.add(exchange.party_b);
  }
  return [...seen];
}

/** Currencies the document mentions, so callers don't have to know them up front. */
function currenciesOf(doc: XenSplitDocument): string[] {
  const seen = new Set<string>();
  for (const expense of doc.expenses ?? []) if (!expense.on_hold) seen.add(expense.currency);
  for (const settlement of doc.settlements ?? []) seen.add(settlement.currency);
  for (const exchange of doc.exchanges ?? []) {
    seen.add(exchange.currency_a);
    seen.add(exchange.currency_b);
  }
  return [...seen];
}

/**
 * Pairwise debts for one currency, or for every currency the document mentions.
 *
 * Each participant owes the payer their share of an expense. A settlement pays
 * down what `from` owed `to` and nothing else — deliberately uncapped, so paying
 * someone more than you owed them leaves them owing you the difference. That is
 * what keeps the books balanced without rewriting a third party's obligation, and
 * it is what confines an off-plan payment to the two people who made it.
 */
export function computeDirectDebts(doc: XenSplitDocument, currency?: string): DirectDebt[] {
  const currencies = currency !== undefined ? [currency] : currenciesOf(doc);
  const participants = participantsOf(doc);
  const debts: DirectDebt[] = [];

  for (const c of currencies) {
    // owe[a][b] = how much a owes b directly.
    const owe: { [a: string]: { [b: string]: number } } = {};
    const add = (a: string, b: string, amount: number) => {
      if (a === b) return;
      if (!owe[a]) owe[a] = {};
      owe[a][b] = (owe[a][b] ?? 0) + amount;
    };

    for (const expense of doc.expenses ?? []) {
      if (expense.on_hold || expense.currency !== c) continue;
      for (const split of expense.splits ?? []) add(split.user_id, expense.paid_by, shareFor(expense, split));
    }

    for (const settlement of doc.settlements ?? []) {
      if (settlement.currency !== c) continue;
      add(settlement.from, settlement.to, -settlement.amount);
    }

    // party_a owes party_b in currency_a; party_b owes party_a in currency_b.
    for (const exchange of doc.exchanges ?? []) {
      if (exchange.currency_a === c) add(exchange.party_a, exchange.party_b, exchange.amount_a);
      if (exchange.currency_b === c) add(exchange.party_b, exchange.party_a, exchange.amount_b);
    }

    // Net each unordered pair into a single directed debt.
    for (let i = 0; i < participants.length; i++) {
      for (let j = i + 1; j < participants.length; j++) {
        const a = participants[i];
        const b = participants[j];
        const net = (owe[a]?.[b] ?? 0) - (owe[b]?.[a] ?? 0);
        if (net > EPSILON) debts.push({ from: a, to: b, amount: Number(net.toFixed(2)), currency: c });
        else if (net < -EPSILON) debts.push({ from: b, to: a, amount: Number((-net).toFixed(2)), currency: c });
      }
    }
  }

  return debts;
}
