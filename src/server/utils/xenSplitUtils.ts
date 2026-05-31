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
      if (exp && exp.currency) currencies.add(exp.currency);
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
