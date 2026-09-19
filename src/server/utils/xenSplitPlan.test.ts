import { describe, it, expect } from "vitest";
import { calculateBalances, calculateMinimumTransfers, currentPlan, recordPlan, seedPlan } from "./xenSplitUtils";
import type { Expense, Settlement, Transfer } from "./xenSplitUtils";

// The routes wrap every balance-moving mutation in seedPlan(group) ... mutate ...
// recordPlan(group). These tests drive that same sequence over a plain object
// standing in for the mongoose document, because the churn only shows up across a
// chain of mutations — a single call in isolation can't reproduce it.
type FakeGroup = {
  members: string[];
  expenses: Expense[];
  settlements: Settlement[];
  exchanges: any[];
  settlement_plan?: Transfer[];
};

function makeGroup(expenses: Expense[], members: string[]): FakeGroup {
  return { members, expenses, settlements: [], exchanges: [] };
}

/** What a route does: seed from the pre-mutation state, mutate, re-record. */
function mutate(group: FakeGroup, apply: (g: FakeGroup) => void): FakeGroup {
  seedPlan(group);
  apply(group);
  recordPlan(group);
  return group;
}

const settle = (from: string, to: string, amount: number, currency = "CAD") =>
  (g: FakeGroup) => { g.settlements.push({ from, to, amount, currency }); };

// You +90, Ann +110, Cy +70, Bo -140, Dee -130 — the fixture from the churn
// regression test in ./xenSplitUtils.test.ts.
const EXPENSES: Expense[] = [
  { paid_by: "You", amount: 90, currency: "CAD", splits: [{ user_id: "Bo", amount_owed: 50 }, { user_id: "Dee", amount_owed: 40 }] },
  { paid_by: "Ann", amount: 110, currency: "CAD", splits: [{ user_id: "Bo", amount_owed: 55 }, { user_id: "Dee", amount_owed: 55 }] },
  { paid_by: "Cy", amount: 70, currency: "CAD", splits: [{ user_id: "Bo", amount_owed: 35 }, { user_id: "Dee", amount_owed: 35 }] },
];
const MEMBERS = ["You", "Ann", "Cy", "Bo", "Dee"];

const owedBy = (plan: Transfer[], id: string) => plan.filter((t) => t.from === id);
const rowsNotInvolving = (plan: Transfer[], id: string) =>
  plan.filter((t) => t.from !== id && t.to !== id)
    .sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));

describe("settlement plan recording", () => {
  it("seeds from the list the member was looking at, not the one after their payment", () => {
    const group = makeGroup(EXPENSES, MEMBERS);
    expect(group.settlement_plan).toBeUndefined();

    mutate(group, settle("Bo", "You", 30));

    // Without seeding, the first settlement in a group that predates anchoring
    // would anchor to the already-churned routing and the fix would never engage.
    expect(owedBy(group.settlement_plan!, "Bo")).toEqual([{ from: "Bo", to: "Ann", amount: 110, currency: "CAD" }]);
  });

  it("does not re-seed once a plan exists", () => {
    const group = makeGroup(EXPENSES, MEMBERS);
    mutate(group, settle("Bo", "You", 30));
    const afterFirst = group.settlement_plan;

    seedPlan(group);
    expect(group.settlement_plan).toBe(afterFirst);
  });

  // The reported bug, end to end: Bo pays the row he was shown and expects to be
  // closer to out, not pulled into a payment with someone new.
  it("lets a member pay down the rows they were shown and settle all the way out", () => {
    const group = makeGroup(EXPENSES, MEMBERS);
    seedPlan(group);
    const shown = [...group.settlement_plan!];
    expect(owedBy(shown, "Bo")).toEqual([
      { from: "Bo", to: "Ann", amount: 110, currency: "CAD" },
      { from: "Bo", to: "You", amount: 30, currency: "CAD" },
    ]);

    mutate(group, settle("Bo", "You", 30));
    expect(owedBy(group.settlement_plan!, "Bo")).toEqual([{ from: "Bo", to: "Ann", amount: 110, currency: "CAD" }]);
    expect(rowsNotInvolving(group.settlement_plan!, "Bo")).toEqual(rowsNotInvolving(shown, "Bo"));

    mutate(group, settle("Bo", "Ann", 110));
    expect(group.settlement_plan!.filter((t) => t.from === "Bo" || t.to === "Bo")).toEqual([]);

    // And he stays out — recomputing again doesn't drag him back in.
    expect(currentPlan(group).filter((t) => t.from === "Bo" || t.to === "Bo")).toEqual([]);
  });

  it("never introduces a counterparty the member had no row with", () => {
    const group = makeGroup(EXPENSES, MEMBERS);
    seedPlan(group);
    const shownPairs = new Set(group.settlement_plan!.map((t) => `${t.from}->${t.to}`));

    mutate(group, settle("Bo", "You", 30));
    mutate(group, settle("Dee", "Cy", 40));

    for (const t of group.settlement_plan!) {
      expect(shownPairs).toContain(`${t.from}->${t.to}`);
    }
  });

  it("restores the row when a settlement is undone", () => {
    const group = makeGroup(EXPENSES, MEMBERS);
    seedPlan(group);
    const shown = [...group.settlement_plan!];

    mutate(group, settle("Bo", "You", 30));
    mutate(group, (g) => { g.settlements = []; });

    expect(owedBy(group.settlement_plan!, "Bo")).toEqual(owedBy(shown, "Bo"));
  });

  // The best-effort boundary: a new creditor nobody has a recorded row with has to
  // be paid by somebody, so pass 3 opens a row. That is a real new obligation, not
  // the re-cut this module exists to prevent — pinned so the distinction is explicit.
  it("opens a new row when an expense leaves a creditor no recorded row can pay", () => {
    const group = makeGroup(EXPENSES, MEMBERS);
    mutate(group, settle("Bo", "You", 30));
    const before = [...group.settlement_plan!];

    mutate(group, (g) => {
      g.members = [...g.members, "Zed"];
      g.expenses.push({ paid_by: "Zed", amount: 20, currency: "CAD", splits: [{ user_id: "Cy", amount_owed: 20 }] });
    });

    // Cy stays a net creditor here, so the $20 is routed from an actual debtor.
    const toZed = group.settlement_plan!.filter((t) => t.to === "Zed");
    expect(toZed).toHaveLength(1);
    expect(toZed[0].amount).toBeCloseTo(20, 2);

    // Bo, who settled and was never party to the new expense, is left alone.
    expect(owedBy(group.settlement_plan!, "Bo")).toEqual(owedBy(before, "Bo"));
  });

  // Note calculateBalances keeps an entry for anyone who paid an expense or holds a
  // split, whether or not they are still in `members` (balances.ts:96-101) — so
  // removing Cy does not erase Cy's credit while Cy's expense is still in the group.
  // That is pre-existing and deliberately untouched here; what matters is that the
  // plan stays a faithful routing of whatever balances come back.
  it("keeps the plan conserved when a member is removed", () => {
    const group = makeGroup(EXPENSES, MEMBERS);
    seedPlan(group);
    const before = [...group.settlement_plan!];

    mutate(group, (g) => { g.members = g.members.filter((m) => m !== "Cy"); });

    const balances = calculateBalances({ ...group, exchanges: [] } as any);
    for (const id of Object.keys(balances)) {
      const net = group.settlement_plan!.reduce(
        (acc, t) => acc + (t.to === id ? t.amount : 0) - (t.from === id ? t.amount : 0), 0);
      expect(net).toBeCloseTo(balances[id].CAD ?? 0, 2);
    }
    // Nobody is pulled into a pairing the recorded plan didn't already have.
    const pairs = new Set(before.map((t) => `${t.from}->${t.to}`));
    for (const t of group.settlement_plan!) expect(pairs).toContain(`${t.from}->${t.to}`);
  });

  it("matches the plain solver for a group that has never recorded a plan", () => {
    const group = makeGroup(EXPENSES, MEMBERS);
    expect(currentPlan(group)).toEqual(calculateMinimumTransfers(calculateBalances({ ...group, exchanges: [] })));
  });

  it("accepts populated member documents as well as raw ids", () => {
    const populated = { ...makeGroup(EXPENSES, MEMBERS), members: MEMBERS.map((id) => ({ _id: id })) };
    expect(currentPlan(populated)).toEqual(currentPlan(makeGroup(EXPENSES, MEMBERS)));
  });
});
