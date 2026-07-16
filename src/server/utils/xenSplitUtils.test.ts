import { describe, it, expect } from "vitest";
import { calculateBalances, calculateMinimumTransfers, resolveSplits } from "./xenSplitUtils";

interface TestExpense {
  paid_by: string;
  amount: number;
  currency: string;
  on_hold?: boolean;
  splits: { user_id: string; amount_owed?: number; percentage?: number }[];
}

interface TestSettlement {
  from: string;
  to: string;
  amount: number;
  currency: string;
}

interface TestExchange {
  party_a: string;
  currency_a: string;
  amount_a: number;
  party_b: string;
  currency_b: string;
  amount_b: number;
  rate: number;
}

interface TestDoc {
  members: string[];
  expenses: TestExpense[];
  settlements: TestSettlement[];
  exchanges?: TestExchange[];
}

function equalSplit(amount: number, participants: string[]) {
  return participants.map((user_id) => ({ user_id, amount_owed: amount / participants.length }));
}

function makeDoc(expenses: TestExpense[], settlements: TestSettlement[] = [], members?: string[], exchanges: TestExchange[] = []): TestDoc {
  const inferredMembers = new Set<string>();
  for (const e of expenses) {
    inferredMembers.add(e.paid_by);
    for (const s of e.splits) inferredMembers.add(s.user_id);
  }
  for (const ex of exchanges) {
    inferredMembers.add(ex.party_a);
    inferredMembers.add(ex.party_b);
  }
  return { members: members ?? [...inferredMembers], expenses, settlements, exchanges };
}

// Sort transfers for order-independent comparison.
function sortTransfers<T extends { from: string; to: string; currency: string }>(transfers: T[]): T[] {
  return [...transfers].sort((a, b) =>
    a.currency !== b.currency ? a.currency.localeCompare(b.currency)
      : a.from !== b.from ? a.from.localeCompare(b.from)
        : a.to.localeCompare(b.to)
  );
}

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
