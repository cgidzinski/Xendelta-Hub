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

interface XenSplitDocument {
  members: string[];
  expenses: Expense[];
  settlements: Settlement[];
}

function shareOwed(amount: number, splitCount: number, split: { amount_owed?: number; percentage?: number }): number {
  if (split.amount_owed !== undefined) return split.amount_owed;
  if (split.percentage !== undefined) return (amount * split.percentage) / 100;
  if (splitCount > 0) return amount / splitCount;
  return 0;
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
// flag. Expenses not flagged are netted per-member (with settlements
// applied) and rerouted via the greedy minimum-transfer algorithm, same as
// today. Flagged expenses instead contribute a direct, unrouted pairwise
// debt between their original payer and participants. The two sets are then
// merged per (currency, pair), netting opposite directions together.
//
// When no expense is flagged this reduces to exactly
// `calculateMinimumTransfers(calculateBalances(doc))` — today's behavior.
export function calculateSimplifiedTransfers(doc: XenSplitDocument): Transfer[] {
  const fullBalances = calculateBalances(doc);

  // Net per-member contribution of flagged expenses only (no settlements).
  const flaggedRaw: BalanceMap = {};
  const addFlaggedRaw = (userId: string, currency: string, delta: number) => {
    if (!flaggedRaw[userId]) flaggedRaw[userId] = {};
    flaggedRaw[userId][currency] = (flaggedRaw[userId][currency] || 0) + delta;
  };

  // Direct, unrouted pairwise debts from flagged expenses: owe[a][b][currency].
  const owe: { [a: string]: { [b: string]: { [currency: string]: number } } } = {};
  const addOwe = (a: string, b: string, currency: string, amount: number) => {
    if (a === b || amount === 0) return;
    if (!owe[a]) owe[a] = {};
    if (!owe[a][b]) owe[a][b] = {};
    owe[a][b][currency] = (owe[a][b][currency] || 0) + amount;
  };

  for (const expense of doc.expenses) {
    if (expense.on_hold || !expense.do_not_simplify) continue;
    const { paid_by, amount, currency, splits } = expense;

    addFlaggedRaw(paid_by, currency, amount);
    for (const split of splits) {
      const owed = shareOwed(amount, splits.length, split);
      addFlaggedRaw(split.user_id, currency, -owed);
      addOwe(split.user_id, paid_by, currency, owed);
    }
  }

  // simplifiableNet = fullBalances - flaggedRaw (settlements remain embedded
  // via fullBalances, since flaggedRaw never included them).
  const simplifiableNet: BalanceMap = {};
  for (const [userId, currencyBalances] of Object.entries(fullBalances)) {
    simplifiableNet[userId] = {};
    for (const [currency, balance] of Object.entries(currencyBalances)) {
      simplifiableNet[userId][currency] = balance - (flaggedRaw[userId]?.[currency] || 0);
    }
  }

  const simplifiedTransfers = calculateMinimumTransfers(simplifiableNet);

  // Merge simplified transfers into the same pairwise map as the flagged
  // direct debts, so opposite-direction amounts between a pair net out.
  for (const t of simplifiedTransfers) {
    addOwe(t.from, t.to, t.currency, t.amount);
  }

  // Net each unordered pair per currency into a single directed transfer.
  const members = new Set<string>(doc.members);
  for (const a of Object.keys(owe)) members.add(a);
  for (const a of Object.keys(owe)) for (const b of Object.keys(owe[a])) members.add(b);
  const memberIds = [...members];

  const currencies = new Set<string>();
  for (const a of Object.keys(owe)) {
    for (const b of Object.keys(owe[a])) {
      for (const c of Object.keys(owe[a][b])) currencies.add(c);
    }
  }

  const result: Transfer[] = [];
  for (const currency of currencies) {
    for (let i = 0; i < memberIds.length; i++) {
      for (let j = i + 1; j < memberIds.length; j++) {
        const a = memberIds[i];
        const b = memberIds[j];
        const net = (owe[a]?.[b]?.[currency] || 0) - (owe[b]?.[a]?.[currency] || 0);
        if (net > 0.01) result.push({ from: a, to: b, amount: Number(net.toFixed(2)), currency });
        else if (net < -0.01) result.push({ from: b, to: a, amount: Number((-net).toFixed(2)), currency });
      }
    }
  }

  return result;
}
