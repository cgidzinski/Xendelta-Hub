import { describe, it, expect } from "vitest";
import { calculateBalances, calculateMinimumTransfers, calculateSimplifiedTransfers } from "./xenSplitUtils";

interface TestExpense {
  paid_by: string;
  amount: number;
  currency: string;
  on_hold?: boolean;
  do_not_simplify?: boolean;
  splits: { user_id: string; amount_owed?: number; percentage?: number }[];
}

interface TestSettlement {
  from: string;
  to: string;
  amount: number;
  currency: string;
}

interface TestDoc {
  members: string[];
  expenses: TestExpense[];
  settlements: TestSettlement[];
}

function equalSplit(amount: number, participants: string[]) {
  return participants.map((user_id) => ({ user_id, amount_owed: amount / participants.length }));
}

function makeDoc(expenses: TestExpense[], settlements: TestSettlement[] = [], members?: string[]): TestDoc {
  const inferredMembers = new Set<string>();
  for (const e of expenses) {
    inferredMembers.add(e.paid_by);
    for (const s of e.splits) inferredMembers.add(s.user_id);
  }
  return { members: members ?? [...inferredMembers], expenses, settlements };
}

// Sort transfers for order-independent comparison.
function sortTransfers<T extends { from: string; to: string; currency: string }>(transfers: T[]): T[] {
  return [...transfers].sort((a, b) =>
    a.currency !== b.currency ? a.currency.localeCompare(b.currency)
      : a.from !== b.from ? a.from.localeCompare(b.from)
        : a.to.localeCompare(b.to)
  );
}

describe("calculateSimplifiedTransfers", () => {
  it("matches calculateMinimumTransfers(calculateBalances(doc)) when nothing is flagged", () => {
    const doc = makeDoc([
      { paid_by: "A", amount: 90, currency: "CAD", splits: equalSplit(90, ["A", "B", "C"]) },
      { paid_by: "B", amount: 30, currency: "CAD", splits: equalSplit(30, ["A", "B", "C"]) },
      { paid_by: "C", amount: 60, currency: "CAD", splits: equalSplit(60, ["A", "B", "C"]) },
    ]);

    const expected = calculateMinimumTransfers(calculateBalances(doc));
    const actual = calculateSimplifiedTransfers(doc);

    expect(sortTransfers(actual)).toEqual(sortTransfers(expected));
  });

  it("shows a simple flagged pair as a direct, unrouted debt", () => {
    const doc = makeDoc([
      { paid_by: "Alice", amount: 5, currency: "CAD", do_not_simplify: true, splits: [{ user_id: "Bob", amount_owed: 5 }] },
    ]);

    const transfers = calculateSimplifiedTransfers(doc);
    expect(transfers).toEqual([{ from: "Bob", to: "Alice", amount: 5, currency: "CAD" }]);
  });

  it("keeps a flagged multi-participant expense as separate direct debts to the payer", () => {
    const doc = makeDoc([
      { paid_by: "A", amount: 30, currency: "CAD", do_not_simplify: true, splits: equalSplit(30, ["A", "B", "C"]) },
    ]);

    const transfers = sortTransfers(calculateSimplifiedTransfers(doc));
    expect(transfers).toEqual([
      { from: "B", to: "A", amount: 10, currency: "CAD" },
      { from: "C", to: "A", amount: 10, currency: "CAD" },
    ]);
  });

  it("lets a settlement fully zero out a flagged debt", () => {
    const doc = makeDoc(
      [{ paid_by: "Alice", amount: 5, currency: "CAD", do_not_simplify: true, splits: [{ user_id: "Bob", amount_owed: 5 }] }],
      [{ from: "Bob", to: "Alice", amount: 5, currency: "CAD" }],
    );

    expect(calculateSimplifiedTransfers(doc)).toEqual([]);
  });

  it("nets mixed flagged + unflagged debt between the same pair into one combined transfer", () => {
    // Unflagged: Bob pays $20 dinner split evenly with Alice -> Alice owes Bob $10.
    // Flagged: Alice pays $5 coffee just for Bob -> Bob owes Alice $5.
    // Net: Alice owes Bob $5.
    const doc = makeDoc([
      { paid_by: "Bob", amount: 20, currency: "CAD", splits: equalSplit(20, ["Alice", "Bob"]) },
      { paid_by: "Alice", amount: 5, currency: "CAD", do_not_simplify: true, splits: [{ user_id: "Bob", amount_owed: 5 }] },
    ]);

    expect(calculateSimplifiedTransfers(doc)).toEqual([{ from: "Alice", to: "Bob", amount: 5, currency: "CAD" }]);
  });

  it("ignores do_not_simplify on a held expense", () => {
    const doc = makeDoc([
      { paid_by: "Alice", amount: 5, currency: "CAD", do_not_simplify: true, on_hold: true, splits: [{ user_id: "Bob", amount_owed: 5 }] },
    ]);

    expect(calculateSimplifiedTransfers(doc)).toEqual([]);
    expect(calculateBalances(doc)).toEqual({ Alice: {}, Bob: {} });
  });

  it("keeps currencies independent", () => {
    const doc = makeDoc([
      { paid_by: "Alice", amount: 5, currency: "CAD", do_not_simplify: true, splits: [{ user_id: "Bob", amount_owed: 5 }] },
      { paid_by: "Bob", amount: 10, currency: "USD", splits: equalSplit(10, ["Alice", "Bob"]) },
    ]);

    const transfers = sortTransfers(calculateSimplifiedTransfers(doc));
    expect(transfers).toEqual([
      { from: "Bob", to: "Alice", amount: 5, currency: "CAD" },
      { from: "Alice", to: "Bob", amount: 5, currency: "USD" },
    ]);
  });

  it("does not change calculateBalances regardless of the flag", () => {
    const flaggedDoc = makeDoc([
      { paid_by: "Alice", amount: 30, currency: "CAD", do_not_simplify: true, splits: equalSplit(30, ["Alice", "Bob", "Charlie"]) },
    ]);
    const unflaggedDoc = makeDoc([
      { paid_by: "Alice", amount: 30, currency: "CAD", splits: equalSplit(30, ["Alice", "Bob", "Charlie"]) },
    ]);

    expect(calculateBalances(flaggedDoc)).toEqual(calculateBalances(unflaggedDoc));
  });

  it("reroutes a 3-member unflagged pool separately from a flagged pair (never merges with 3+ aggregate holders)", () => {
    // Unflagged: A pays 90 split 3 ways, B pays 30 split 3 ways -> aggregate net: A=50, B=-10, C=-40.
    // Flagged: C pays 12 for A only -> protected: A owes C 12.
    // Since the aggregate pool has 3 nonzero holders (A, B, C), the aggregate
    // transfers must NOT be netted against the protected A<->C debt — doing so
    // could let B's unrelated debt change what the flagged expense shows.
    const doc = makeDoc([
      { paid_by: "A", amount: 90, currency: "CAD", splits: equalSplit(90, ["A", "B", "C"]) },
      { paid_by: "B", amount: 30, currency: "CAD", splits: equalSplit(30, ["A", "B", "C"]) },
      { paid_by: "C", amount: 12, currency: "CAD", do_not_simplify: true, splits: [{ user_id: "A", amount_owed: 12 }] },
    ]);

    const transfers = sortTransfers(calculateSimplifiedTransfers(doc));
    expect(transfers).toEqual([
      { from: "A", to: "C", amount: 12, currency: "CAD" }, // protected: exactly the flagged expense, untouched
      { from: "B", to: "A", amount: 10, currency: "CAD" }, // aggregate
      { from: "C", to: "A", amount: 40, currency: "CAD" }, // aggregate
    ]);
  });

  it("regression: an unrelated third party's debt must never flip or resize a flagged pair's debt", () => {
    // Flagged: A pays $10 for B only -> Direct/protected fact: B owes A $10.
    // Two unrelated unflagged expenses force the aggregate algorithm to route
    // a $15 payment from A to B directly (A owes C 20, C owes B 15 in the
    // aggregate pool -> with only A/B/C, A ends up paying B directly).
    // A buggy implementation that merges the aggregate reroute into the
    // protected pair would show "A owes B $5" here -- flipping the direction
    // of a debt the user explicitly flagged to stay untouched.
    const doc = makeDoc([
      { paid_by: "A", amount: 10, currency: "CAD", do_not_simplify: true, splits: [{ user_id: "B", amount_owed: 10 }] },
      { paid_by: "C", amount: 20, currency: "CAD", splits: [{ user_id: "A", amount_owed: 20 }] },
      { paid_by: "B", amount: 15, currency: "CAD", splits: [{ user_id: "C", amount_owed: 15 }] },
    ]);

    const transfers = sortTransfers(calculateSimplifiedTransfers(doc));
    // Protected: B owes A $10, untouched. Aggregate (A=-20,B=15,C=5,
    // 3 nonzero holders so kept separate): A pays B $15, A pays C $5.
    expect(transfers).toEqual([
      { from: "A", to: "B", amount: 15, currency: "CAD" },
      { from: "A", to: "C", amount: 5, currency: "CAD" },
      { from: "B", to: "A", amount: 10, currency: "CAD" },
    ]);
  });
});
