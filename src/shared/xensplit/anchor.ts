// Anchored routing. Solves the churn that made settling up feel like a treadmill:
// calculateMinimumTransfers sees only net balances, so paying the amount it showed
// re-cut every edge in the group, and the payer could come back owing the same
// person MORE, alongside a counterparty they had never transacted with.
//
// The fix is to remember the list that was last emitted and route against it. The
// anchor is a *hint*, never served state — an empty or stale anchor still yields a
// correct, deterministic list, just one pinned to an older plan. That is what makes
// recording the plan cheap: a route that forgets to record is a missed improvement,
// never a wrong answer.
//
// Imported by both sides like balances.ts, so it stays resolution-agnostic: ESM
// syntax only, no Node or DOM APIs, no mongoose.

import { calculateMinimumTransfers, type BalanceMap, type Transfer } from "./balances";

// Matches the threshold calculateMinimumTransfers treats as "already settled".
const EPSILON = 0.01;

const round = (amount: number) => Number(amount.toFixed(2));

const pairKey = (from: string, to: string) => `${from}\u0000${to}`;
/** Direction-insensitive, so a reversed edge still counts as an existing relationship. */
const linkKey = (a: string, b: string) => (a < b ? pairKey(a, b) : pairKey(b, a));

/**
 * Anchor edges in a stable order: largest first, then by ids. Two edges of equal
 * amount must resolve the same way every time, or the pending list would shuffle
 * on a reload purely because Mongo handed the array back differently.
 */
function orderedAnchor(anchor: Transfer[], currency: string): Transfer[] {
  return anchor
    .filter((edge) => edge && edge.currency === currency && edge.amount > EPSILON && edge.from !== edge.to)
    .sort((a, b) => b.amount - a.amount || a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

/**
 * The pending transfer list, anchored to a previously recorded plan.
 *
 * Pass 1 honours the recorded edges, each capped at the amount it was recorded
 * with — the cap is the whole fix, since it means an edge can only ever shrink.
 * Pass 2 spreads whatever is left over pairs that already appear in the anchor
 * (in either direction), so drift is absorbed without inventing a relationship.
 * Pass 3 falls back to plain greedy for flow that nothing else can carry — only
 * reachable when a new expense genuinely connects two people for the first time.
 *
 * An empty anchor makes this identical to calculateMinimumTransfers.
 */
export function calculateAnchoredTransfers(balances: BalanceMap, anchor: Transfer[] = []): Transfer[] {
  const transfers: Transfer[] = [];

  const currencies = new Set<string>();
  for (const userBalances of Object.values(balances)) {
    for (const currency of Object.keys(userBalances)) currencies.add(currency);
  }

  for (const currency of currencies) {
    // Remaining debt/credit per member, drawn down as each pass places flow.
    const debt: { [id: string]: number } = {};
    const credit: { [id: string]: number } = {};
    for (const [userId, userBalances] of Object.entries(balances)) {
      const balance = userBalances[currency] || 0;
      if (balance > EPSILON) credit[userId] = balance;
      else if (balance < -EPSILON) debt[userId] = -balance;
    }

    // Sum per ordered pair, so a pair reached by more than one pass lands on one row.
    const placed = new Map<string, { from: string; to: string; amount: number }>();
    const place = (from: string, to: string, amount: number) => {
      if (amount <= EPSILON) return;
      debt[from] -= amount;
      credit[to] -= amount;
      const key = pairKey(from, to);
      const existing = placed.get(key);
      if (existing) existing.amount += amount;
      else placed.set(key, { from, to, amount });
    };

    // Pass 1 — honour what was recorded, capped at the recorded amount. An edge
    // naming someone who no longer carries a balance on that side, or whose
    // direction has since reversed, simply yields nothing and is dropped.
    const edges = orderedAnchor(anchor, currency);
    for (const edge of edges) {
      place(edge.from, edge.to, Math.min(debt[edge.from] ?? 0, credit[edge.to] ?? 0, edge.amount));
    }

    // Pass 2 — residual flow, but only across pairs the anchor already links.
    const linked = new Set(edges.map((edge) => linkKey(edge.from, edge.to)));
    if (linked.size > 0) {
      const byAmount = (a: string, b: string, pool: { [id: string]: number }) => pool[b] - pool[a];
      const debtors = Object.keys(debt).filter((id) => debt[id] > EPSILON).sort((a, b) => byAmount(a, b, debt) || a.localeCompare(b));
      for (const from of debtors) {
        const creditors = Object.keys(credit)
          .filter((to) => credit[to] > EPSILON && linked.has(linkKey(from, to)))
          .sort((a, b) => byAmount(a, b, credit) || a.localeCompare(b));
        for (const to of creditors) {
          if (debt[from] <= EPSILON) break;
          place(from, to, Math.min(debt[from], credit[to]));
        }
      }
    }

    // Pass 3 — whatever no existing relationship can carry. Hand the leftovers to
    // the plain solver rather than repeating its matching logic here.
    // Built in the iteration order of `balances`, because that is what breaks ties
    // between equal amounts inside the solver — reordering here would make an empty
    // anchor produce a different list than calling the solver directly.
    const leftover: BalanceMap = {};
    for (const userId of Object.keys(balances)) {
      if ((debt[userId] ?? 0) > EPSILON) leftover[userId] = { [currency]: -debt[userId] };
      else if ((credit[userId] ?? 0) > EPSILON) leftover[userId] = { [currency]: credit[userId] };
    }
    for (const transfer of calculateMinimumTransfers(leftover)) {
      place(transfer.from, transfer.to, transfer.amount);
    }

    for (const { from, to, amount } of placed.values()) {
      if (amount > EPSILON) transfers.push({ from, to, amount: round(amount), currency });
    }
  }

  return transfers;
}
