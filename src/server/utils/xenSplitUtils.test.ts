import { describe, it, expect } from "vitest";
import { calculateBalances, calculateMinimumTransfers, calculateSimplifiedTransfers, resolveSplits } from "./xenSplitUtils";

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

  // Known limitation (intentionally left as-is): this function nets unflagged
  // expenses and settlements through the aggregate pool, but doc.exchanges is
  // never consulted here at all -- exchanges affect calculateBalances but are
  // silently absent from the settle-up transfer list this function produces.
  // A group with exchanges gets correct balances but an incomplete/wrong
  // settle-up suggestion. Flagged as a gap, not covered by a test here.

  it("resolves percentage splits correctly for a flagged expense", () => {
    const doc = makeDoc([
      {
        paid_by: "Alice",
        amount: 100,
        currency: "CAD",
        do_not_simplify: true,
        splits: [
          { user_id: "Bob", percentage: 70 },
          { user_id: "Charlie", percentage: 30 },
        ],
      },
    ]);

    const transfers = sortTransfers(calculateSimplifiedTransfers(doc));
    expect(transfers).toEqual([
      { from: "Bob", to: "Alice", amount: 70, currency: "CAD" },
      { from: "Charlie", to: "Alice", amount: 30, currency: "CAD" },
    ]);
  });

  it("does not create a self-debt when the payer is also a participant in a flagged expense", () => {
    const doc = makeDoc([
      {
        paid_by: "Alice",
        amount: 100,
        currency: "CAD",
        do_not_simplify: true,
        splits: [
          { user_id: "Alice", amount_owed: 40 },
          { user_id: "Bob", amount_owed: 60 },
        ],
      },
    ]);

    expect(calculateSimplifiedTransfers(doc)).toEqual([{ from: "Bob", to: "Alice", amount: 60, currency: "CAD" }]);
  });

  it("nets multiple flagged expenses between the same pair in the same currency into one transfer", () => {
    const doc = makeDoc([
      { paid_by: "Alice", amount: 5, currency: "CAD", do_not_simplify: true, splits: [{ user_id: "Bob", amount_owed: 5 }] },
      { paid_by: "Bob", amount: 8, currency: "CAD", do_not_simplify: true, splits: [{ user_id: "Alice", amount_owed: 8 }] },
    ]);

    expect(calculateSimplifiedTransfers(doc)).toEqual([{ from: "Alice", to: "Bob", amount: 3, currency: "CAD" }]);
  });

  it("keeps flagged expenses in two different currencies for the same pair independent", () => {
    const doc = makeDoc([
      { paid_by: "Alice", amount: 5, currency: "CAD", do_not_simplify: true, splits: [{ user_id: "Bob", amount_owed: 5 }] },
      { paid_by: "Bob", amount: 8, currency: "USD", do_not_simplify: true, splits: [{ user_id: "Alice", amount_owed: 8 }] },
    ]);

    const transfers = sortTransfers(calculateSimplifiedTransfers(doc));
    expect(transfers).toEqual([
      { from: "Bob", to: "Alice", amount: 5, currency: "CAD" },
      { from: "Alice", to: "Bob", amount: 8, currency: "USD" },
    ]);
  });
});

describe("resolveSplits", () => {
  describe("equal", () => {
    it("divides evenly among an explicit participant subset", () => {
      const result = resolveSplits("equal", 100, [{ user_id: "A" }, { user_id: "B" }], ["A", "B", "C"]);
      expect(result).toEqual([
        { user_id: "A", amount_owed: 50 },
        { user_id: "B", amount_owed: 50 },
      ]);
    });

    it("falls back to all group members when no splits are given", () => {
      const result = resolveSplits("equal", 90, [], ["A", "B", "C"]);
      expect(result).toEqual([
        { user_id: "A", amount_owed: 30 },
        { user_id: "B", amount_owed: 30 },
        { user_id: "C", amount_owed: 30 },
      ]);
    });

    it("does not auto-correct an unequal remainder (unlike percent/exact)", () => {
      // $10 split 3 ways: no rounding correction is applied to equal splits,
      // so each share is the raw division result.
      const result = resolveSplits("equal", 10, [{ user_id: "A" }, { user_id: "B" }, { user_id: "C" }], ["A", "B", "C"]);
      for (const split of result) {
        expect(split.amount_owed).toBeCloseTo(10 / 3, 10);
      }
      const total = result.reduce((acc, s) => acc + s.amount_owed, 0);
      expect(total).toBeCloseTo(10, 8);
    });
  });

  describe("percent", () => {
    it("leaves percentages untouched when they already sum to 100", () => {
      const result = resolveSplits(
        "percent",
        100,
        [{ user_id: "A", percentage: 60 }, { user_id: "B", percentage: 40 }],
        ["A", "B"],
      );
      expect(result).toEqual([
        { user_id: "A", amount_owed: 60, percentage: 60 },
        { user_id: "B", amount_owed: 40, percentage: 40 },
      ]);
    });

    it("nudges the last split's percentage up when the sum is short of 100", () => {
      const result = resolveSplits(
        "percent",
        300,
        [
          { user_id: "A", percentage: 33.33 },
          { user_id: "B", percentage: 33.33 },
          { user_id: "C", percentage: 33.33 },
        ],
        ["A", "B", "C"],
      );
      expect(result[0]).toEqual({ user_id: "A", amount_owed: 99.99, percentage: 33.33 });
      expect(result[1]).toEqual({ user_id: "B", amount_owed: 99.99, percentage: 33.33 });
      expect(result[2].percentage).toBeCloseTo(33.34, 8);
      expect(result[2].amount_owed).toBeCloseTo(100.02, 8);
      const total = result.reduce((acc, s) => acc + s.amount_owed, 0);
      expect(total).toBeCloseTo(300, 6);
    });

    it("nudges the last split's percentage down when the sum exceeds 100", () => {
      const result = resolveSplits(
        "percent",
        100,
        [{ user_id: "A", percentage: 50 }, { user_id: "B", percentage: 50.5 }],
        ["A", "B"],
      );
      expect(result[0]).toEqual({ user_id: "A", amount_owed: 50, percentage: 50 });
      expect(result[1].percentage).toBeCloseTo(50, 8);
      expect(result[1].amount_owed).toBeCloseTo(50, 8);
    });

    it("handles a single 100% split with no adjustment", () => {
      const result = resolveSplits("percent", 50, [{ user_id: "A", percentage: 100 }], ["A"]);
      expect(result).toEqual([{ user_id: "A", amount_owed: 50, percentage: 100 }]);
    });

    it("handles a 0% participant correctly", () => {
      const result = resolveSplits(
        "percent",
        100,
        [{ user_id: "A", percentage: 100 }, { user_id: "B", percentage: 0 }],
        ["A", "B"],
      );
      expect(result).toEqual([
        { user_id: "A", amount_owed: 100, percentage: 100 },
        { user_id: "B", amount_owed: 0, percentage: 0 },
      ]);
    });

    it("returns an empty array for empty splits without crashing", () => {
      expect(resolveSplits("percent", 100, [], ["A", "B"])).toEqual([]);
    });
  });

  describe("exact", () => {
    it("leaves amounts untouched when they already sum to the total", () => {
      const result = resolveSplits(
        "exact",
        90,
        [{ user_id: "A", amount_owed: 30 }, { user_id: "B", amount_owed: 60 }],
        ["A", "B"],
      );
      expect(result).toEqual([
        { user_id: "A", amount_owed: 30 },
        { user_id: "B", amount_owed: 60 },
      ]);
    });

    it("adds the shortfall to the last split when amounts sum short of the total", () => {
      const result = resolveSplits(
        "exact",
        100,
        [
          { user_id: "A", amount_owed: 33.33 },
          { user_id: "B", amount_owed: 33.33 },
          { user_id: "C", amount_owed: 33.33 },
        ],
        ["A", "B", "C"],
      );
      expect(result[0].amount_owed).toBe(33.33);
      expect(result[1].amount_owed).toBe(33.33);
      expect(result[2].amount_owed).toBeCloseTo(33.34, 8);
      const total = result.reduce((acc, s) => acc + s.amount_owed, 0);
      expect(total).toBeCloseTo(100, 6);
    });

    it("handles a single split with no adjustment", () => {
      const result = resolveSplits("exact", 75, [{ user_id: "A", amount_owed: 75 }], ["A"]);
      expect(result).toEqual([{ user_id: "A", amount_owed: 75 }]);
    });

    it("returns an empty array for empty splits without crashing", () => {
      expect(resolveSplits("exact", 100, [], ["A", "B"])).toEqual([]);
    });
  });
});

describe("calculateBalances (isolated)", () => {
  function sumBalances(balances: ReturnType<typeof calculateBalances>, currency: string): number {
    return Object.values(balances).reduce((acc, byCurrency) => acc + (byCurrency[currency] || 0), 0);
  }

  it("nets an equal-split expense across 2 members to zero", () => {
    const doc = makeDoc([{ paid_by: "A", amount: 100, currency: "CAD", splits: equalSplit(100, ["A", "B"]) }]);
    const balances = calculateBalances(doc);
    expect(balances.A.CAD).toBe(50);
    expect(balances.B.CAD).toBe(-50);
    expect(sumBalances(balances, "CAD")).toBeCloseTo(0, 8);
  });

  it("nets an equal-split expense across 3 members to zero", () => {
    const doc = makeDoc([{ paid_by: "A", amount: 90, currency: "CAD", splits: equalSplit(90, ["A", "B", "C"]) }]);
    const balances = calculateBalances(doc);
    expect(balances.A.CAD).toBe(60);
    expect(balances.B.CAD).toBe(-30);
    expect(balances.C.CAD).toBe(-30);
    expect(sumBalances(balances, "CAD")).toBeCloseTo(0, 8);
  });

  it("nets an equal-split expense across 4 members to zero", () => {
    const doc = makeDoc([{ paid_by: "A", amount: 100, currency: "CAD", splits: equalSplit(100, ["A", "B", "C", "D"]) }]);
    const balances = calculateBalances(doc);
    expect(balances.A.CAD).toBe(75);
    expect(balances.B.CAD).toBe(-25);
    expect(balances.C.CAD).toBe(-25);
    expect(balances.D.CAD).toBe(-25);
    expect(sumBalances(balances, "CAD")).toBeCloseTo(0, 8);
  });

  it("computes a percentage-split expense using the percentage field directly", () => {
    const doc = makeDoc([
      {
        paid_by: "A",
        amount: 200,
        currency: "CAD",
        splits: [{ user_id: "A", percentage: 50 }, { user_id: "B", percentage: 50 }],
      },
    ]);
    const balances = calculateBalances(doc);
    expect(balances.A.CAD).toBe(100);
    expect(balances.B.CAD).toBe(-100);
  });

  it("computes an exact-split expense using amount_owed directly", () => {
    const doc = makeDoc([
      {
        paid_by: "A",
        amount: 150,
        currency: "CAD",
        splits: [{ user_id: "A", amount_owed: 50 }, { user_id: "B", amount_owed: 100 }],
      },
    ]);
    const balances = calculateBalances(doc);
    expect(balances.A.CAD).toBe(100);
    expect(balances.B.CAD).toBe(-100);
  });

  it("reconciles multiple expenses and a settlement to the expected net per member", () => {
    const doc = makeDoc(
      [
        { paid_by: "A", amount: 90, currency: "CAD", splits: equalSplit(90, ["A", "B", "C"]) },
        { paid_by: "B", amount: 30, currency: "CAD", splits: equalSplit(30, ["A", "B", "C"]) },
      ],
      [{ from: "B", to: "A", amount: 10, currency: "CAD" }],
    );
    const balances = calculateBalances(doc);
    expect(balances.A.CAD).toBe(40);
    expect(balances.B.CAD).toBe(0);
    expect(balances.C.CAD).toBe(-40);
    expect(sumBalances(balances, "CAD")).toBeCloseTo(0, 8);
  });

  it("keeps two currencies for the same pair fully independent", () => {
    const doc = makeDoc([
      { paid_by: "A", amount: 100, currency: "CAD", splits: equalSplit(100, ["A", "B"]) },
      { paid_by: "B", amount: 40, currency: "USD", splits: equalSplit(40, ["A", "B"]) },
    ]);
    const balances = calculateBalances(doc);
    expect(balances.A).toEqual({ CAD: 50, USD: -20 });
    expect(balances.B).toEqual({ CAD: -50, USD: 20 });
  });

  it("applies a settlement in a currency with no matching expense (currency-seeding regression)", () => {
    const doc = makeDoc(
      [{ paid_by: "A", amount: 100, currency: "CAD", splits: equalSplit(100, ["A", "B"]) }],
      [{ from: "B", to: "A", amount: 30, currency: "EUR" }],
    );
    const balances = calculateBalances(doc);
    // EUR has no expense at all, but the settlement's effect must still show up.
    expect(balances.A.EUR).toBe(-30);
    expect(balances.B.EUR).toBe(30);
  });

  it("applies settlements even when the only expense in that currency is on_hold", () => {
    const doc = makeDoc(
      [{ paid_by: "A", amount: 50, currency: "CAD", on_hold: true, splits: equalSplit(50, ["A", "B"]) }],
      [{ from: "B", to: "A", amount: 20, currency: "CAD" }],
    );
    const balances = calculateBalances(doc);
    expect(balances.A.CAD).toBe(-20);
    expect(balances.B.CAD).toBe(20);
  });

  it("applies both legs of a currency exchange and nets to zero per currency", () => {
    const doc = {
      members: ["A", "B"],
      expenses: [] as any[],
      settlements: [] as any[],
      exchanges: [{ party_a: "A", currency_a: "CAD", amount_a: 100, party_b: "B", currency_b: "USD", amount_b: 75, rate: 0.75 }],
    };
    const balances = calculateBalances(doc);
    expect(balances.A).toEqual({ CAD: -100, USD: 75 });
    expect(balances.B).toEqual({ CAD: 100, USD: -75 });
    expect(sumBalances(balances, "CAD")).toBeCloseTo(0, 8);
    expect(sumBalances(balances, "USD")).toBeCloseTo(0, 8);
  });

  it("holds the sum-to-zero invariant across a mix of expenses, settlements, and exchanges", () => {
    const doc = {
      members: ["A", "B", "C"],
      expenses: [
        { paid_by: "A", amount: 90, currency: "CAD", splits: equalSplit(90, ["A", "B", "C"]) },
        {
          paid_by: "B",
          amount: 45,
          currency: "CAD",
          splits: [
            { user_id: "A", percentage: 20 },
            { user_id: "B", percentage: 30 },
            { user_id: "C", percentage: 50 },
          ],
        },
        {
          paid_by: "C",
          amount: 60,
          currency: "CAD",
          splits: [
            { user_id: "A", amount_owed: 10 },
            { user_id: "B", amount_owed: 20 },
            { user_id: "C", amount_owed: 30 },
          ],
        },
      ],
      settlements: [{ from: "A", to: "C", amount: 15, currency: "CAD" }],
      exchanges: [{ party_a: "A", currency_a: "CAD", amount_a: 25, party_b: "B", currency_b: "USD", amount_b: 18, rate: 0.72 }],
    };
    const balances = calculateBalances(doc);
    expect(sumBalances(balances, "CAD")).toBeCloseTo(0, 8);
    expect(sumBalances(balances, "USD")).toBeCloseTo(0, 8);
  });
});

describe("calculateMinimumTransfers (isolated)", () => {
  it("settles a simple 2-person case in one transfer", () => {
    const transfers = calculateMinimumTransfers({ A: { CAD: 50 }, B: { CAD: -50 } });
    expect(transfers).toEqual([{ from: "B", to: "A", amount: 50, currency: "CAD" }]);
  });

  it("minimizes transactions across multiple creditors and debtors", () => {
    // A=100, B=50 (creditors); C=-30, D=-60, E=-60 (debtors). 5 nonzero
    // holders -> at most 4 transactions (n-1) to fully settle.
    const balances = { A: { CAD: 100 }, B: { CAD: 50 }, C: { CAD: -30 }, D: { CAD: -60 }, E: { CAD: -60 } };
    const transfers = calculateMinimumTransfers(balances);

    const totalTransferred = transfers.reduce((acc, t) => acc + t.amount, 0);
    expect(totalTransferred).toBeCloseTo(150, 8);
    expect(transfers.length).toBeLessThanOrEqual(4);

    expect(sortTransfers(transfers)).toEqual(sortTransfers([
      { from: "D", to: "A", amount: 60, currency: "CAD" },
      { from: "E", to: "A", amount: 40, currency: "CAD" },
      { from: "E", to: "B", amount: 20, currency: "CAD" },
      { from: "C", to: "B", amount: 30, currency: "CAD" },
    ]));
  });

  it("handles tied debtor amounts against a single creditor", () => {
    const balances = { A: { CAD: 100 }, B: { CAD: -50 }, C: { CAD: -50 } };
    const transfers = calculateMinimumTransfers(balances);
    const total = transfers.reduce((acc, t) => acc + t.amount, 0);
    expect(total).toBeCloseTo(100, 8);
    expect(transfers.length).toBeLessThanOrEqual(2);
    expect(sortTransfers(transfers)).toEqual(sortTransfers([
      { from: "B", to: "A", amount: 50, currency: "CAD" },
      { from: "C", to: "A", amount: 50, currency: "CAD" },
    ]));
  });

  it("treats balances within the 0.01 epsilon as already settled", () => {
    const transfers = calculateMinimumTransfers({ A: { CAD: 0.005 }, B: { CAD: -0.005 } });
    expect(transfers).toEqual([]);
  });

  it("produces independent transfer sets per currency", () => {
    const balances = { A: { CAD: 50, USD: -20 }, B: { CAD: -50, USD: 20 } };
    const transfers = sortTransfers(calculateMinimumTransfers(balances));
    expect(transfers).toEqual([
      { from: "B", to: "A", amount: 50, currency: "CAD" },
      { from: "A", to: "B", amount: 20, currency: "USD" },
    ]);
  });

  it("returns no transfers when all balances are zero", () => {
    expect(calculateMinimumTransfers({ A: { CAD: 0 }, B: { CAD: 0 } })).toEqual([]);
  });
});
