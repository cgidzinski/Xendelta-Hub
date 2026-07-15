interface Transfer {
  from: string;
  to: string;
  amount: number;
  currency: string;
}

interface BalanceMap {
  [userId: string]: { [currency: string]: number };
}

interface Expense {
  paid_by: string;
  amount: number;
  currency: string;
  on_hold?: boolean;
  do_not_simplify?: boolean;
  splits: { user_id: string; amount_owed?: number; percentage?: number }[];
}

interface Settlement {
  from: string;
  to: string;
  amount: number;
  currency: string;
  settled_at?: Date;
}

interface Exchange {
  party_a: string;
  currency_a: string;
  amount_a: number;
  party_b: string;
  currency_b: string;
  amount_b: number;
  rate: number;
}

interface XenSplitDocument {
  members: string[];
  expenses: Expense[];
  settlements: Settlement[];
  exchanges?: Exchange[];
}

function shareOwed(amount: number, splitCount: number, split: { amount_owed?: number; percentage?: number }): number {
  if (split.amount_owed !== undefined) return split.amount_owed;
  if (split.percentage !== undefined) return (amount * split.percentage) / 100;
  if (splitCount > 0) return amount / splitCount;
  return 0;
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

export function calculateBalances(doc: XenSplitDocument): BalanceMap {
  const balances: BalanceMap = {};

  // Collect currencies present in expenses and settlements so we can
  // initialize a zero entry for each member for those currencies.
  // This ensures settlements are applied even if no expense currently
  // references that currency (fixes issue where deleting an expense
  // removed the currency key and hid settlement effects).
  const currencies = new Set<string>();
  if (Array.isArray(doc.expenses)) {
    for (const exp of doc.expenses) {
      if (exp && exp.currency && !exp.on_hold) currencies.add(exp.currency);
    }
  }
  if (Array.isArray(doc.settlements)) {
    for (const s of doc.settlements) {
      if (s && s.currency) currencies.add(s.currency);
    }
  }
  if (Array.isArray(doc.exchanges)) {
    for (const ex of doc.exchanges) {
      if (ex && ex.currency_a) currencies.add(ex.currency_a);
      if (ex && ex.currency_b) currencies.add(ex.currency_b);
    }
  }

  // Initialize all members with zero balance entries for collected currencies
  for (const member of doc.members) {
    balances[member] = {};
    for (const c of currencies) {
      balances[member][c] = 0;
    }
  }

  // Process each expense
  for (const expense of doc.expenses) {
    if (expense.on_hold) continue;
    const { paid_by, amount, currency, splits } = expense;

    // Initialize currency for payer if needed
    if (!balances[paid_by]) {
      balances[paid_by] = {};
    }
    if (!balances[paid_by][currency]) {
      balances[paid_by][currency] = 0;
    }

    // Payer is owed the full amount
    balances[paid_by][currency] = (balances[paid_by][currency] || 0) + amount;

    // Each participant owes their share
    for (const split of splits) {
      const { user_id, amount_owed, percentage } = split;
      let owed = 0;

      if (amount_owed !== undefined) {
        owed = amount_owed;
      } else if (percentage !== undefined) {
        owed = (amount * percentage) / 100;
      } else if (splits.length > 0) {
        // Equal split - divide by number of participants
        owed = amount / splits.length;
      }

      if (!balances[user_id]) {
        balances[user_id] = {};
      }
      if (!balances[user_id][currency]) {
        balances[user_id][currency] = 0;
      }
      balances[user_id][currency] -= owed;
    }
  }

  // Subtract settled amounts
  for (const settlement of doc.settlements) {
    const { from, to, amount, currency } = settlement;
    // Use explicit undefined check; a zero balance is a valid starting point
    if (balances[from]) {
      if (balances[from][currency] !== undefined) {
        balances[from][currency] += amount;
      } else {
        balances[from][currency] = amount;
      }
    }
    if (balances[to]) {
      if (balances[to][currency] !== undefined) {
        balances[to][currency] -= amount;
      } else {
        balances[to][currency] = -amount;
      }
    }
  }

  // Apply exchange legs: party_a owes party_b in currency_a, party_b owes party_a in currency_b
  for (const ex of doc.exchanges ?? []) {
    if (balances[ex.party_a]) {
      balances[ex.party_a][ex.currency_a] = (balances[ex.party_a][ex.currency_a] ?? 0) - ex.amount_a;
      balances[ex.party_a][ex.currency_b] = (balances[ex.party_a][ex.currency_b] ?? 0) + ex.amount_b;
    }
    if (balances[ex.party_b]) {
      balances[ex.party_b][ex.currency_a] = (balances[ex.party_b][ex.currency_a] ?? 0) + ex.amount_a;
      balances[ex.party_b][ex.currency_b] = (balances[ex.party_b][ex.currency_b] ?? 0) - ex.amount_b;
    }
  }

  return balances;
}

export function calculateMinimumTransfers(balances: BalanceMap): Transfer[] {
  const transfers: Transfer[] = [];
  const currencies = new Set<string>();

  // Collect all currencies
  for (const userBalances of Object.values(balances)) {
    for (const currency of Object.keys(userBalances)) {
      currencies.add(currency);
    }
  }

  for (const currency of currencies) {
    const creditors: { id: string; amount: number }[] = [];
    const debtors: { id: string; amount: number }[] = [];

    for (const [userId, userBalances] of Object.entries(balances)) {
      const balance = userBalances[currency] || 0;
      if (balance > 0.01) {
        creditors.push({ id: userId, amount: balance });
      } else if (balance < -0.01) {
        debtors.push({ id: userId, amount: Math.abs(balance) });
      }
    }

    // Sort by amount descending
    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b) => b.amount - a.amount);

    let i = 0, j = 0;
    while (i < creditors.length && j < debtors.length) {
      const pay = Math.min(creditors[i].amount, debtors[j].amount);
      if (pay > 0.01) {
        transfers.push({
          from: debtors[j].id,
          to: creditors[i].id,
          amount: Number(pay.toFixed(2)),
          currency,
        });
      }
      creditors[i].amount -= pay;
      debtors[j].amount -= pay;
      if (creditors[i].amount < 0.01) i++;
      if (debtors[j].amount < 0.01) j++;
    }
  }

  return transfers;
}

// Suggested settlement transfers, honoring each expense's `do_not_simplify`
// flag.
//
// Flagged expenses contribute a "protected" direct, unrouted pairwise debt
// between their original payer and participants. This is only ever combined
// with an aggregate-pool transfer between the same two people when that
// combination is provably safe — see the "safe to net" comment below.
// Otherwise it's kept as its own line, because merging it with an unrelated
// reroute could let two other people's debts (or an old settlement for a
// completely unrelated expense that happens to involve the same two people)
// change the sign or magnitude of a debt the user explicitly asked to keep
// visible as-is. Settlements are never routed directly into the protected
// ledger for the same reason — they aren't tagged to a specific expense, so
// there's no reliable way to tell "this paid off the flagged debt" from
// "this paid off something unrelated." The "safe to net" rule still lets a
// settlement zero out a protected debt in the unambiguous case (only these
// two people hold any aggregate balance at all).
//
// Unflagged expenses, all settlements, and all exchanges are netted per-member
// and rerouted via the existing greedy minimum-transfer algorithm, unchanged
// from today. Exchanges can't be flagged `do_not_simplify` (they aren't tied
// to a specific expense), so they always join this aggregate pool — never
// the protected ledger — same treatment as settlements.
//
// When no expense is flagged, the protected set is empty and this reduces
// to exactly `calculateMinimumTransfers(calculateBalances(doc))` — today's
// behavior.
export function calculateSimplifiedTransfers(doc: XenSplitDocument): Transfer[] {
  // Direct, unrouted pairwise debts from flagged expenses: protectedOwe[a][b][currency].
  const protectedOwe: { [a: string]: { [b: string]: { [currency: string]: number } } } = {};
  const addProtected = (a: string, b: string, currency: string, amount: number) => {
    if (a === b || amount === 0) return;
    if (!protectedOwe[a]) protectedOwe[a] = {};
    if (!protectedOwe[a][b]) protectedOwe[a][b] = {};
    protectedOwe[a][b][currency] = (protectedOwe[a][b][currency] || 0) + amount;
  };

  // Net per-member contribution of unflagged (non-held) expenses only.
  const unflaggedNet: BalanceMap = {};
  const addUnflagged = (userId: string, currency: string, delta: number) => {
    if (!unflaggedNet[userId]) unflaggedNet[userId] = {};
    unflaggedNet[userId][currency] = (unflaggedNet[userId][currency] || 0) + delta;
  };

  for (const expense of doc.expenses) {
    if (expense.on_hold) continue;
    const { paid_by, amount, currency, splits, do_not_simplify } = expense;

    if (do_not_simplify) {
      for (const split of splits) {
        const owed = shareOwed(amount, splits.length, split);
        addProtected(split.user_id, paid_by, currency, owed);
      }
    } else {
      addUnflagged(paid_by, currency, amount);
      for (const split of splits) {
        const owed = shareOwed(amount, splits.length, split);
        addUnflagged(split.user_id, currency, -owed);
      }
    }
  }

  // Settlements and exchanges always feed the aggregate pool — never routed
  // directly into the protected ledger. Neither is tagged to a specific
  // expense, so there's no reliable way to tell "this paid off the flagged
  // debt" from "this paid off something unrelated that happened to involve
  // the same two people" (a real settlement or exchange from before the
  // expense was even flagged would otherwise get misattributed and silently
  // corrupt the protected number). The "safe to net" rule below still lets
  // a settlement or exchange zero out a protected debt in the unambiguous
  // case — when only these two people hold any aggregate balance at all —
  // without risking that misattribution.
  const aggregateSettlement: BalanceMap = {};
  const addAggregateSettlement = (userId: string, currency: string, delta: number) => {
    if (!aggregateSettlement[userId]) aggregateSettlement[userId] = {};
    aggregateSettlement[userId][currency] = (aggregateSettlement[userId][currency] || 0) + delta;
  };

  for (const s of doc.settlements) {
    addAggregateSettlement(s.from, s.currency, s.amount);
    addAggregateSettlement(s.to, s.currency, -s.amount);
  }

  // Exchange legs, applied the same way calculateBalances applies them:
  // party_a owes party_b in currency_a, party_b owes party_a in currency_b.
  for (const ex of doc.exchanges ?? []) {
    addAggregateSettlement(ex.party_a, ex.currency_a, -ex.amount_a);
    addAggregateSettlement(ex.party_a, ex.currency_b, ex.amount_b);
    addAggregateSettlement(ex.party_b, ex.currency_a, ex.amount_a);
    addAggregateSettlement(ex.party_b, ex.currency_b, -ex.amount_b);
  }

  // Aggregate pool: unflagged expenses + all settlements + all exchanges.
  const aggregateBalance: BalanceMap = {};
  const aggregateUsers = new Set<string>([...doc.members, ...Object.keys(unflaggedNet), ...Object.keys(aggregateSettlement)]);
  for (const userId of aggregateUsers) {
    aggregateBalance[userId] = {};
    const userCurrencies = new Set<string>([
      ...Object.keys(unflaggedNet[userId] || {}),
      ...Object.keys(aggregateSettlement[userId] || {}),
    ]);
    for (const currency of userCurrencies) {
      aggregateBalance[userId][currency] = (unflaggedNet[userId]?.[currency] || 0) + (aggregateSettlement[userId]?.[currency] || 0);
    }
  }
  const aggregateTransfers = calculateMinimumTransfers(aggregateBalance);

  // A currency is "safe to net" when at most 2 people hold a nonzero
  // aggregate balance in it — in that case the aggregate transfer for that
  // currency is unambiguously a direct fact about just those two people (no
  // third party's debt could possibly have been routed through it), so it's
  // safe to fold into the protected ledger and net against a protected debt
  // between them. With 3+ holders, a transfer between two of them might
  // just be where the greedy algorithm happened to route someone else's
  // debt, so it's kept as its own line instead.
  const nonzeroHolderCount: { [currency: string]: number } = {};
  for (const currencyBalances of Object.values(aggregateBalance)) {
    for (const [currency, balance] of Object.entries(currencyBalances)) {
      if (Math.abs(balance) > 0.01) nonzeroHolderCount[currency] = (nonzeroHolderCount[currency] || 0) + 1;
    }
  }
  const safeToNetCurrencies = new Set(
    Object.entries(nonzeroHolderCount).filter(([, count]) => count <= 2).map(([currency]) => currency)
  );

  const unmergedAggregateTransfers: Transfer[] = [];
  for (const t of aggregateTransfers) {
    if (safeToNetCurrencies.has(t.currency)) addProtected(t.from, t.to, t.currency, t.amount);
    else unmergedAggregateTransfers.push(t);
  }

  // Net the (now possibly aggregate-merged) protected pairwise map into directed transfers.
  const protectedMembers = new Set<string>();
  for (const a of Object.keys(protectedOwe)) {
    protectedMembers.add(a);
    for (const b of Object.keys(protectedOwe[a])) protectedMembers.add(b);
  }
  const protectedMemberIds = [...protectedMembers];
  const protectedCurrencies = new Set<string>();
  for (const a of Object.keys(protectedOwe)) {
    for (const b of Object.keys(protectedOwe[a])) {
      for (const c of Object.keys(protectedOwe[a][b])) protectedCurrencies.add(c);
    }
  }

  const protectedTransfers: Transfer[] = [];
  for (const currency of protectedCurrencies) {
    for (let i = 0; i < protectedMemberIds.length; i++) {
      for (let j = i + 1; j < protectedMemberIds.length; j++) {
        const a = protectedMemberIds[i];
        const b = protectedMemberIds[j];
        const net = (protectedOwe[a]?.[b]?.[currency] || 0) - (protectedOwe[b]?.[a]?.[currency] || 0);
        if (net > 0.01) protectedTransfers.push({ from: a, to: b, amount: Number(net.toFixed(2)), currency });
        else if (net < -0.01) protectedTransfers.push({ from: b, to: a, amount: Number((-net).toFixed(2)), currency });
      }
    }
  }

  // Concatenate — no further merging. protectedTransfers is already netted to
  // one entry per pair, and calculateMinimumTransfers never produces two
  // entries for the same pair, so the only way a protected and an unsafe
  // aggregate entry could ever share a (from, to) is coincidence — and even
  // summing same-direction amounts in that case would still change the
  // protected debt's visible magnitude, so they're kept as separate lines.
  return [...protectedTransfers, ...unmergedAggregateTransfers];
}
