import { describe, it, expect } from "vitest";
import { calculateBalances, calculateMinimumTransfers } from "./balances";
import type { Expense, Settlement, XenSplitDocument } from "./balances";
import { computeDirectDebts, participantsOf } from "./debts";

function makeDoc(expenses: Expense[], settlements: Settlement[] = [], members?: string[]): XenSplitDocument {
  const inferred = new Set<string>();
  for (const e of expenses) {
    inferred.add(e.paid_by);
    for (const s of e.splits) inferred.add(s.user_id);
  }
  return { members: members ?? [...inferred], expenses, settlements, exchanges: [] };
}

const sortDebts = <T extends { from: string; to: string; currency: string }>(debts: T[]) =>
  [...debts].sort((a, b) =>
    a.currency !== b.currency ? a.currency.localeCompare(b.currency)
      : a.from !== b.from ? a.from.localeCompare(b.from)
        : a.to.localeCompare(b.to));

const rowsFor = (doc: XenSplitDocument, id: string) =>
  sortDebts(computeDirectDebts(doc).filter((d) => d.from === id || d.to === id))
    .map((d) => `${d.from}->${d.to} $${d.amount}`);

// "I owed one person, then a settlement happened and now I'm in 4 payments."
// Me -100 to A; B -90 split across C, D and E.
const MEMBERS = ["Me", "A", "B", "C", "D", "E"];
const EXPENSES: Expense[] = [
  { paid_by: "A", amount: 100, currency: "CAD", splits: [{ user_id: "Me", amount_owed: 100 }] },
  { paid_by: "C", amount: 30, currency: "CAD", splits: [{ user_id: "B", amount_owed: 30 }] },
  { paid_by: "D", amount: 30, currency: "CAD", splits: [{ user_id: "B", amount_owed: 30 }] },
  { paid_by: "E", amount: 30, currency: "CAD", splits: [{ user_id: "B", amount_owed: 30 }] },
];
const withSettlements = (settlements: Settlement[]) => makeDoc(EXPENSES, settlements, MEMBERS);

describe("computeDirectDebts as the pending list", () => {
  // The reported bug. Under the simplified routing each of these shattered "Me"'s
  // single row into as many as four, because meshing net balances lets one
  // member's payment re-cut another member's payments.
  describe("somebody else's payment never touches my row", () => {
    const cases: [string, Settlement[]][] = [
      ["B pays A off-plan, and A was my creditor", [{ from: "B", to: "A", amount: 90, currency: "CAD" }]],
      ["B pays A a smaller off-plan amount", [{ from: "B", to: "A", amount: 30, currency: "CAD" }]],
      ["B pays the person B actually owes", [{ from: "B", to: "C", amount: 30, currency: "CAD" }]],
      ["B pays everyone B owes", [
        { from: "B", to: "C", amount: 30, currency: "CAD" },
        { from: "B", to: "D", amount: 30, currency: "CAD" },
        { from: "B", to: "E", amount: 30, currency: "CAD" },
      ]],
    ];

    it.each(cases)("%s", (_label, settlements) => {
      expect(rowsFor(withSettlements(settlements), "Me")).toEqual(["Me->A $100"]);
    });

    it("lands an overpayment on the two people who made it", () => {
      // B handed A $90 without owing it, so A owes B back — and nobody else moves.
      const debts = computeDirectDebts(withSettlements([{ from: "B", to: "A", amount: 90, currency: "CAD" }]));
      expect(debts).toContainEqual({ from: "A", to: "B", amount: 90, currency: "CAD" });
    });
  });

  describe("my own payments only ever shrink my rows", () => {
    it("reduces the row I paid against", () => {
      expect(rowsFor(withSettlements([{ from: "Me", to: "A", amount: 40, currency: "CAD" }]), "Me")).toEqual(["Me->A $60"]);
    });

    it("clears me out entirely when I pay it off", () => {
      expect(rowsFor(withSettlements([{ from: "Me", to: "A", amount: 100, currency: "CAD" }]), "Me")).toEqual([]);
    });

    it("keeps me out once I am out", () => {
      const paid = withSettlements([
        { from: "Me", to: "A", amount: 100, currency: "CAD" },
        { from: "B", to: "C", amount: 30, currency: "CAD" },
        { from: "B", to: "A", amount: 15, currency: "CAD" },
      ]);
      expect(rowsFor(paid, "Me")).toEqual([]);
    });
  });

  it("routes exactly each participant's net balance", () => {
    const doc = withSettlements([{ from: "B", to: "A", amount: 90, currency: "CAD" }]);
    const balances = calculateBalances(doc);
    const net: { [id: string]: number } = {};
    for (const d of computeDirectDebts(doc)) {
      net[d.from] = (net[d.from] ?? 0) - d.amount;
      net[d.to] = (net[d.to] ?? 0) + d.amount;
    }
    for (const id of Object.keys(balances)) {
      expect(net[id] ?? 0).toBeCloseTo(balances[id].CAD ?? 0, 2);
    }
  });

  it("covers every currency when none is named", () => {
    const doc = makeDoc([
      { paid_by: "A", amount: 60, currency: "CAD", splits: [{ user_id: "B", amount_owed: 60 }] },
      { paid_by: "B", amount: 40, currency: "USD", splits: [{ user_id: "A", amount_owed: 40 }] },
    ]);
    expect(sortDebts(computeDirectDebts(doc))).toEqual(sortDebts([
      { from: "B", to: "A", amount: 60, currency: "CAD" },
      { from: "A", to: "B", amount: 40, currency: "USD" },
    ]));
    // Naming one currency must not net it against the other.
    expect(computeDirectDebts(doc, "CAD")).toEqual([{ from: "B", to: "A", amount: 60, currency: "CAD" }]);
  });

  it("keeps a removed member's debts on the list", () => {
    // calculateBalances holds a position for anyone who paid or holds a split, and
    // a member can be removed while carrying a balance — enumerating pairs from
    // `members` alone would drop these while the balances above still showed them.
    const doc = makeDoc(EXPENSES, [], ["Me", "B", "C", "D", "E"]);
    expect(participantsOf(doc)).toContain("A");
    expect(rowsFor(doc, "Me")).toEqual(["Me->A $100"]);
  });

  it("ignores on_hold expenses", () => {
    const doc = makeDoc([
      { paid_by: "A", amount: 50, currency: "CAD", on_hold: true, splits: [{ user_id: "B", amount_owed: 50 }] },
      { paid_by: "A", amount: 20, currency: "CAD", splits: [{ user_id: "B", amount_owed: 20 }] },
    ]);
    expect(computeDirectDebts(doc)).toEqual([{ from: "B", to: "A", amount: 20, currency: "CAD" }]);
  });

  it("drops residuals inside the 0.01 epsilon", () => {
    const doc = makeDoc(
      [{ paid_by: "A", amount: 10.005, currency: "CAD", splits: [{ user_id: "B", amount_owed: 10.005 }] }],
      [{ from: "B", to: "A", amount: 10, currency: "CAD" }]);
    expect(computeDirectDebts(doc)).toEqual([]);
  });

  it("costs more payments than the simplified routing, as expected", () => {
    // The accepted trade-off, pinned so a future change to it is deliberate. A
    // chain of debts is the worst case: simplification collapses it to one
    // payment, while the pairwise list keeps every link people actually created.
    const doc = makeDoc([
      { paid_by: "B", amount: 30, currency: "CAD", splits: [{ user_id: "A", amount_owed: 30 }] },
      { paid_by: "C", amount: 30, currency: "CAD", splits: [{ user_id: "B", amount_owed: 30 }] },
      { paid_by: "D", amount: 30, currency: "CAD", splits: [{ user_id: "C", amount_owed: 30 }] },
    ]);
    expect(calculateMinimumTransfers(calculateBalances(doc))).toEqual([
      { from: "A", to: "D", amount: 30, currency: "CAD" },
    ]);
    expect(computeDirectDebts(doc)).toHaveLength(3);
  });
});
