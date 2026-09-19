import { describe, it, expect } from "vitest";
import { calculateBalances, calculateMinimumTransfers } from "./balances";
import type { BalanceMap, Expense, Settlement, Transfer, XenSplitDocument } from "./balances";
import { calculateAnchoredTransfers } from "./anchor";

function equalSplit(amount: number, participants: string[]) {
  return participants.map((user_id) => ({ user_id, amount_owed: amount / participants.length }));
}

function makeDoc(expenses: Expense[], settlements: Settlement[] = [], members?: string[]): XenSplitDocument {
  const inferred = new Set<string>();
  for (const e of expenses) {
    inferred.add(e.paid_by);
    for (const s of e.splits) inferred.add(s.user_id);
  }
  return { members: members ?? [...inferred], expenses, settlements, exchanges: [] };
}

function sortTransfers(transfers: Transfer[]): Transfer[] {
  return [...transfers].sort((a, b) =>
    a.currency !== b.currency ? a.currency.localeCompare(b.currency)
      : a.from !== b.from ? a.from.localeCompare(b.from)
        : a.to.localeCompare(b.to)
  );
}

const anchoredFor = (doc: XenSplitDocument, anchor: Transfer[]) =>
  calculateAnchoredTransfers(calculateBalances(doc), anchor);

// The fixture from the churn regression test in src/server/utils/xenSplitUtils.test.ts:
// three creditors front costs for Bo and Dee, giving nets of
// You +90, Ann +110, Cy +70, Bo -140, Dee -130.
const CHURN_EXPENSES: Expense[] = [
  { paid_by: "You", amount: 90, currency: "CAD", splits: [{ user_id: "Bo", amount_owed: 50 }, { user_id: "Dee", amount_owed: 40 }] },
  { paid_by: "Ann", amount: 110, currency: "CAD", splits: [{ user_id: "Bo", amount_owed: 55 }, { user_id: "Dee", amount_owed: 55 }] },
  { paid_by: "Cy", amount: 70, currency: "CAD", splits: [{ user_id: "Bo", amount_owed: 35 }, { user_id: "Dee", amount_owed: 35 }] },
];
const CHURN_MEMBERS = ["You", "Ann", "Cy", "Bo", "Dee"];

describe("calculateAnchoredTransfers", () => {
  describe("no anchor", () => {
    const cases: [string, XenSplitDocument][] = [
      ["a simple two-person debt", makeDoc([{ paid_by: "A", amount: 50, currency: "CAD", splits: equalSplit(50, ["A", "B"]) }])],
      ["a three-way split", makeDoc([{ paid_by: "A", amount: 90, currency: "CAD", splits: equalSplit(90, ["A", "B", "C"]) }])],
      ["tied debtors", makeDoc([{ paid_by: "A", amount: 60, currency: "CAD", splits: equalSplit(60, ["A", "B", "C"]) }])],
      ["the churn fixture", makeDoc(CHURN_EXPENSES, [], CHURN_MEMBERS)],
      ["multiple currencies", makeDoc([
        { paid_by: "A", amount: 60, currency: "CAD", splits: equalSplit(60, ["A", "B"]) },
        { paid_by: "B", amount: 40, currency: "USD", splits: equalSplit(40, ["A", "B"]) },
      ])],
    ];

    it.each(cases)("falls through to the plain solver for %s", (_label, doc) => {
      const balances = calculateBalances(doc);
      expect(calculateAnchoredTransfers(balances, [])).toEqual(calculateMinimumTransfers(balances));
    });

    it("treats a missing anchor the same as an empty one", () => {
      const balances = calculateBalances(makeDoc(CHURN_EXPENSES, [], CHURN_MEMBERS));
      expect(calculateAnchoredTransfers(balances)).toEqual(calculateMinimumTransfers(balances));
    });
  });

  // The defect this module exists for. Unanchored, paying the $30 that was shown
  // hands Bo back "pay You $60" plus a brand-new "pay Cy $50" — see the regression
  // test in src/server/utils/xenSplitUtils.test.ts.
  describe("settling a recorded edge", () => {
    const doc = makeDoc(CHURN_EXPENSES, [], CHURN_MEMBERS);
    const anchor = calculateMinimumTransfers(calculateBalances(doc));
    const settled = makeDoc(CHURN_EXPENSES, [{ from: "Bo", to: "You", amount: 30, currency: "CAD" }], CHURN_MEMBERS);

    it("shows Bo the $30 to You that the plain solver would", () => {
      expect(anchor).toContainEqual({ from: "Bo", to: "You", amount: 30, currency: "CAD" });
    });

    it("removes the row that was paid instead of re-cutting it larger", () => {
      const after = anchoredFor(settled, anchor);
      expect(after.filter((t) => t.from === "Bo" && t.to === "You")).toEqual([]);
      expect(after).toContainEqual({ from: "Bo", to: "Ann", amount: 110, currency: "CAD" });
    });

    it("brings nobody new into a settlement", () => {
      const pairs = new Set(anchor.map((t) => `${t.from}->${t.to}`));
      for (const t of anchoredFor(settled, anchor)) {
        expect(pairs).toContain(`${t.from}->${t.to}`);
      }
    });

    it("leaves every row not involving the payer byte-identical", () => {
      const untouched = (transfers: Transfer[]) => sortTransfers(transfers.filter((t) => t.from !== "Bo" && t.to !== "Bo"));
      expect(untouched(anchoredFor(settled, anchor))).toEqual(untouched(anchor));
    });

    it("lets Bo settle all the way out and stay out", () => {
      const allPaid = makeDoc(CHURN_EXPENSES, [
        { from: "Bo", to: "You", amount: 30, currency: "CAD" },
        { from: "Bo", to: "Ann", amount: 110, currency: "CAD" },
      ], CHURN_MEMBERS);
      const after = anchoredFor(allPaid, anchor);
      expect(after.filter((t) => t.from === "Bo" || t.to === "Bo")).toEqual([]);
    });
  });

  it("shrinks a row on a partial payment rather than removing it", () => {
    const expenses: Expense[] = [{ paid_by: "A", amount: 90, currency: "CAD", splits: equalSplit(90, ["A", "B", "C"]) }];
    const anchor = calculateMinimumTransfers(calculateBalances(makeDoc(expenses)));
    const after = anchoredFor(makeDoc(expenses, [{ from: "B", to: "A", amount: 10, currency: "CAD" }]), anchor);
    expect(after).toContainEqual({ from: "B", to: "A", amount: 20, currency: "CAD" });
    expect(after).toContainEqual({ from: "C", to: "A", amount: 30, currency: "CAD" });
  });

  // The cap stops *re-routing* from inflating an edge; it cannot hide debt that
  // genuinely grew. An undersized anchor must still leave a list that settles the
  // group, so the extra rides the same pair rather than being dropped.
  it("still routes the full debt when the anchor is smaller than it", () => {
    // B owes A $45, but the anchor only ever committed B to $10.
    const doc = makeDoc([{ paid_by: "A", amount: 90, currency: "CAD", splits: equalSplit(90, ["A", "B"]) }]);
    const after = calculateAnchoredTransfers(calculateBalances(doc), [{ from: "B", to: "A", amount: 10, currency: "CAD" }]);
    expect(after).toEqual([{ from: "B", to: "A", amount: 45, currency: "CAD" }]);
  });

  it("drops an anchored edge whose direction has since reversed", () => {
    // The anchor says A pays B, but B now owes A.
    const doc = makeDoc([{ paid_by: "A", amount: 80, currency: "CAD", splits: equalSplit(80, ["A", "B"]) }]);
    const after = calculateAnchoredTransfers(calculateBalances(doc), [{ from: "A", to: "B", amount: 25, currency: "CAD" }]);
    expect(after).toEqual([{ from: "B", to: "A", amount: 40, currency: "CAD" }]);
  });

  it("skips an anchored edge naming someone who no longer carries a balance", () => {
    const doc = makeDoc([{ paid_by: "A", amount: 60, currency: "CAD", splits: equalSplit(60, ["A", "B"]) }]);
    const after = calculateAnchoredTransfers(calculateBalances(doc), [
      { from: "Gone", to: "A", amount: 30, currency: "CAD" },
      { from: "B", to: "A", amount: 30, currency: "CAD" },
    ]);
    expect(after).toEqual([{ from: "B", to: "A", amount: 30, currency: "CAD" }]);
  });

  it("does open a new row when an expense genuinely connects two members", () => {
    // Anchor links only B->A. A new expense makes C a debtor of A, which no
    // existing relationship can carry, so pass 3 has to place it.
    const doc = makeDoc([
      { paid_by: "A", amount: 60, currency: "CAD", splits: equalSplit(60, ["A", "B"]) },
      { paid_by: "A", amount: 40, currency: "CAD", splits: equalSplit(40, ["A", "C"]) },
    ]);
    const after = anchoredFor(doc, [{ from: "B", to: "A", amount: 30, currency: "CAD" }]);
    expect(sortTransfers(after)).toEqual([
      { from: "B", to: "A", amount: 30, currency: "CAD" },
      { from: "C", to: "A", amount: 20, currency: "CAD" },
    ]);
  });

  it("is independent of the order the anchor arrives in", () => {
    const doc = makeDoc(CHURN_EXPENSES, [{ from: "Bo", to: "You", amount: 30, currency: "CAD" }], CHURN_MEMBERS);
    const anchor = calculateMinimumTransfers(calculateBalances(makeDoc(CHURN_EXPENSES, [], CHURN_MEMBERS)));
    const reversed = [...anchor].reverse();
    expect(anchoredFor(doc, reversed)).toEqual(anchoredFor(doc, anchor));
  });

  it("keeps an anchor in one currency from steering another", () => {
    const doc = makeDoc([
      { paid_by: "A", amount: 60, currency: "CAD", splits: equalSplit(60, ["A", "B"]) },
      { paid_by: "C", amount: 40, currency: "USD", splits: equalSplit(40, ["C", "D"]) },
    ]);
    const balances = calculateBalances(doc);
    const anchored = calculateAnchoredTransfers(balances, [{ from: "B", to: "A", amount: 30, currency: "CAD" }]);
    expect(sortTransfers(anchored.filter((t) => t.currency === "USD")))
      .toEqual(sortTransfers(calculateMinimumTransfers(balances).filter((t) => t.currency === "USD")));
  });

  it("routes exactly each member's net balance, however it is anchored", () => {
    const doc = makeDoc(CHURN_EXPENSES, [{ from: "Bo", to: "You", amount: 30, currency: "CAD" }], CHURN_MEMBERS);
    const balances: BalanceMap = calculateBalances(doc);
    const anchor = calculateMinimumTransfers(calculateBalances(makeDoc(CHURN_EXPENSES, [], CHURN_MEMBERS)));

    const net: { [id: string]: number } = {};
    for (const t of anchoredFor(doc, anchor)) {
      net[t.from] = (net[t.from] ?? 0) - t.amount;
      net[t.to] = (net[t.to] ?? 0) + t.amount;
    }
    for (const member of CHURN_MEMBERS) {
      expect(net[member] ?? 0).toBeCloseTo(balances[member].CAD, 2);
    }
  });
});
