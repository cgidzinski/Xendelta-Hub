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
