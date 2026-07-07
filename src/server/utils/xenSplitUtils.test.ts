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

  it("reroutes a 3-member unflagged group while leaving a flagged pair direct", () => {
    // Unflagged: A pays 90 split 3 ways -> B owes A 30, C owes A 30.
    //            B pays 30 split 3 ways among A/B/C -> A owes B 10, C owes B 10 (net contribution).
    // Combined unflagged net: A +50, B -30+20=... computed via calculateMinimumTransfers directly below.
    // Flagged: C pays Bob... reuse a direct A<->C flagged expense.
    const doc = makeDoc([
      { paid_by: "A", amount: 90, currency: "CAD", splits: equalSplit(90, ["A", "B", "C"]) },
      { paid_by: "B", amount: 30, currency: "CAD", splits: equalSplit(30, ["A", "B", "C"]) },
      { paid_by: "C", amount: 12, currency: "CAD", do_not_simplify: true, splits: [{ user_id: "A", amount_owed: 12 }] },
    ]);

    const transfers = sortTransfers(calculateSimplifiedTransfers(doc));
    // Unflagged-only balances: A = 90-30 -10 = 50; B = -30+30-10 = -10; C = -30-10 = -40.
    // calculateMinimumTransfers -> C owes A 40, B owes A 10 (greedy largest-first).
    // Flagged direct debt: A owes C 12.
    // Merge A<->C: A owes C 12 vs C owes A 40 -> net C owes A 28.
    expect(transfers).toEqual([
      { from: "B", to: "A", amount: 10, currency: "CAD" },
      { from: "C", to: "A", amount: 28, currency: "CAD" },
    ]);
  });
});
