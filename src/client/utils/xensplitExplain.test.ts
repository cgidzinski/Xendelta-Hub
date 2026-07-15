import { describe, it, expect } from "vitest";
import { currenciesInGroup, computeDirectDebts, computeBalanceBreakdown } from "./xensplitExplain";
import type { XenSplit, XenSplitExpense, XenSplitSettlement, XenSplitExchange, XenSplitMember } from "../hooks/xensplit/types";

function member(user_id: string, username: string): XenSplitMember {
  return { user_id, username, avatar: null, joined_at: "2025-01-01T00:00:00.000Z" };
}

function expense(overrides: Partial<XenSplitExpense> & Pick<XenSplitExpense, "paid_by" | "amount" | "currency" | "splits">): XenSplitExpense {
  return {
    _id: Math.random().toString(36).slice(2),
    title: "Expense",
    split_type: "equal",
    date: "2025-06-01T00:00:00.000Z",
    created_at: "2025-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function settlement(overrides: Partial<XenSplitSettlement> & Pick<XenSplitSettlement, "from" | "to" | "amount" | "currency">): XenSplitSettlement {
  return { _id: Math.random().toString(36).slice(2), settled_at: "2025-06-02T00:00:00.000Z", ...overrides };
}

function exchange(overrides: Partial<XenSplitExchange> & Pick<XenSplitExchange, "party_a" | "currency_a" | "amount_a" | "party_b" | "currency_b" | "amount_b">): XenSplitExchange {
  return { _id: Math.random().toString(36).slice(2), rate: 1, date: "2025-06-03T00:00:00.000Z", created_at: "2025-06-03T00:00:00.000Z", ...overrides };
}

function group(overrides: Partial<XenSplit> & { members: XenSplitMember[] }): XenSplit {
  return {
    _id: "group1",
    name: "Test Group",
    default_currency: "CAD",
    secondary_currencies: [],
    created_by: overrides.members[0]?.user_id ?? "A",
    created_at: "2025-01-01T00:00:00.000Z",
    expenses: [],
    settlements: [],
    exchanges: [],
    ...overrides,
  };
}

function equalSplit(participants: string[]) {
  return participants.map((user_id) => ({ user_id }));
}

describe("currenciesInGroup", () => {
  it("sorts the default currency first even when it's alphabetically later", () => {
    const g = group({
      members: [member("A", "Alice")],
      default_currency: "USD",
      expenses: [expense({ paid_by: "A", amount: 10, currency: "CAD", splits: [] }), expense({ paid_by: "A", amount: 10, currency: "USD", splits: [] })],
      settlements: [settlement({ from: "A", to: "A", amount: 1, currency: "EUR" })],
    });
    expect(currenciesInGroup(g)).toEqual(["USD", "CAD", "EUR"]);
  });

  it("collects currencies from expenses, settlements, and exchanges combined", () => {
    const g = group({
      members: [member("A", "Alice"), member("B", "Bob")],
      default_currency: "CAD",
      expenses: [expense({ paid_by: "A", amount: 10, currency: "CAD", splits: [] })],
      settlements: [settlement({ from: "A", to: "B", amount: 5, currency: "GBP" })],
      exchanges: [exchange({ party_a: "A", currency_a: "USD", amount_a: 10, party_b: "B", currency_b: "EUR", amount_b: 8 })],
    });
    expect(currenciesInGroup(g)).toEqual(["CAD", "EUR", "GBP", "USD"]);
  });

  it("excludes an on_hold expense's currency unless it's referenced elsewhere", () => {
    const g = group({
      members: [member("A", "Alice")],
      default_currency: "CAD",
      expenses: [expense({ paid_by: "A", amount: 10, currency: "JPY", on_hold: true, splits: [] })],
    });
    expect(currenciesInGroup(g)).toEqual(["CAD"]);
  });

  it("returns just the default currency for a group with no financial activity", () => {
    const g = group({ members: [member("A", "Alice")], default_currency: "USD" });
    expect(currenciesInGroup(g)).toEqual(["USD"]);
  });
});

describe("computeDirectDebts", () => {
  it("computes a correct netted pairwise debt for a basic equal-split expense", () => {
    const g = group({
      members: [member("Alice", "Alice"), member("Bob", "Bob")],
      expenses: [expense({ paid_by: "Bob", amount: 20, currency: "CAD", splits: equalSplit(["Alice", "Bob"]) })],
    });
    expect(computeDirectDebts(g, "CAD")).toEqual([{ from: "Alice", to: "Bob", amount: 10, currency: "CAD" }]);
  });

  it("lets an over-settlement reverse the direction of a direct debt", () => {
    const g = group({
      members: [member("Alice", "Alice"), member("Bob", "Bob")],
      expenses: [expense({ paid_by: "Bob", amount: 20, currency: "CAD", splits: equalSplit(["Alice", "Bob"]) })],
      settlements: [settlement({ from: "Alice", to: "Bob", amount: 15, currency: "CAD" })],
    });
    // Alice owed Bob $10; a $15 settlement over-corrects, flipping the debt to Bob owing Alice $5.
    expect(computeDirectDebts(g, "CAD")).toEqual([{ from: "Bob", to: "Alice", amount: 5, currency: "CAD" }]);
  });

  it("produces correct pairwise debts for both legs of an exchange", () => {
    const g = group({
      members: [member("Alice", "Alice"), member("Bob", "Bob")],
      exchanges: [exchange({ party_a: "Alice", currency_a: "CAD", amount_a: 30, party_b: "Bob", currency_b: "USD", amount_b: 25 })],
    });
    expect(computeDirectDebts(g, "CAD")).toEqual([{ from: "Alice", to: "Bob", amount: 30, currency: "CAD" }]);
    expect(computeDirectDebts(g, "USD")).toEqual([{ from: "Bob", to: "Alice", amount: 25, currency: "USD" }]);
  });

  it("nets multiple expenses between the same pair, flipping sign when the net reverses", () => {
    const g = group({
      members: [member("Alice", "Alice"), member("Bob", "Bob")],
      expenses: [
        expense({ paid_by: "Bob", amount: 20, currency: "CAD", splits: equalSplit(["Alice", "Bob"]) }), // Alice owes Bob 10
        expense({ paid_by: "Alice", amount: 50, currency: "CAD", splits: [{ user_id: "Bob", amount_owed: 50 }] }), // Bob owes Alice 50
      ],
    });
    expect(computeDirectDebts(g, "CAD")).toEqual([{ from: "Bob", to: "Alice", amount: 40, currency: "CAD" }]);
  });

  it("excludes on_hold expenses and expenses in a different currency", () => {
    const g = group({
      members: [member("Alice", "Alice"), member("Bob", "Bob")],
      expenses: [
        expense({ paid_by: "Alice", amount: 100, currency: "CAD", on_hold: true, splits: equalSplit(["Alice", "Bob"]) }),
        expense({ paid_by: "Alice", amount: 100, currency: "USD", splits: equalSplit(["Alice", "Bob"]) }),
      ],
    });
    expect(computeDirectDebts(g, "CAD")).toEqual([]);
  });

  it("treats a residual under the 0.01 threshold as fully settled", () => {
    const g = group({
      members: [member("Alice", "Alice"), member("Bob", "Bob")],
      expenses: [expense({ paid_by: "Alice", amount: 10.005, currency: "CAD", splits: [{ user_id: "Bob", amount_owed: 10.005 }] })],
      settlements: [settlement({ from: "Bob", to: "Alice", amount: 10, currency: "CAD" })],
    });
    expect(computeDirectDebts(g, "CAD")).toEqual([]);
  });
});

describe("computeBalanceBreakdown", () => {
  it("shows the payer's paid line as amount minus their own share", () => {
    const g = group({
      members: [member("Alice", "Alice"), member("Bob", "Bob"), member("Charlie", "Charlie")],
      expenses: [expense({ paid_by: "Alice", amount: 90, currency: "CAD", title: "Dinner", splits: equalSplit(["Alice", "Bob", "Charlie"]) })],
    });
    const lines = computeBalanceBreakdown(g, "Alice", "CAD");
    expect(lines).toEqual([{ kind: "paid", label: 'Paid for "Dinner"', hint: "Covered the others' shares", amount: 60, date: expect.any(String) }]);
  });

  it("shows a non-payer's share line as negative", () => {
    const g = group({
      members: [member("Alice", "Alice"), member("Bob", "Bob"), member("Charlie", "Charlie")],
      expenses: [expense({ paid_by: "Alice", amount: 90, currency: "CAD", title: "Dinner", splits: equalSplit(["Alice", "Bob", "Charlie"]) })],
    });
    const lines = computeBalanceBreakdown(g, "Bob", "CAD");
    expect(lines).toEqual([{ kind: "share", label: 'Share of "Dinner"', hint: "Alice paid — this share is owed to them", amount: -30, date: expect.any(String) }]);
  });

  it("signs a paid settlement positive and a received settlement negative, with correct labels", () => {
    const g = group({
      members: [member("Alice", "Alice"), member("Bob", "Bob")],
      settlements: [settlement({ from: "Alice", to: "Bob", amount: 20, currency: "CAD" })],
    });
    expect(computeBalanceBreakdown(g, "Alice", "CAD")).toEqual([
      { kind: "settlement", label: "Paid Bob back", hint: "A settlement that cancelled out a debt", amount: 20, date: expect.any(String) },
    ]);
    expect(computeBalanceBreakdown(g, "Bob", "CAD")).toEqual([
      { kind: "settlement", label: "Alice paid them back", hint: "A settlement that cancelled out a debt", amount: -20, date: expect.any(String) },
    ]);
  });

  it("produces correct exchange lines for both parties and both currency legs", () => {
    const g = group({
      members: [member("Alice", "Alice"), member("Bob", "Bob")],
      exchanges: [exchange({ party_a: "Alice", currency_a: "CAD", amount_a: 40, party_b: "Bob", currency_b: "USD", amount_b: 30 })],
    });
    expect(computeBalanceBreakdown(g, "Alice", "CAD")).toEqual([
      { kind: "exchange", label: "Exchange with Bob", hint: "Owes Bob 40 CAD", amount: -40, date: expect.any(String) },
    ]);
    expect(computeBalanceBreakdown(g, "Bob", "CAD")).toEqual([
      { kind: "exchange", label: "Exchange with Alice", hint: "Alice owes them 40 CAD", amount: 40, date: expect.any(String) },
    ]);
    expect(computeBalanceBreakdown(g, "Alice", "USD")).toEqual([
      { kind: "exchange", label: "Exchange with Bob", hint: "Bob owes them 30 USD", amount: 30, date: expect.any(String) },
    ]);
    expect(computeBalanceBreakdown(g, "Bob", "USD")).toEqual([
      { kind: "exchange", label: "Exchange with Alice", hint: "Owes Alice 30 USD", amount: -30, date: expect.any(String) },
    ]);
  });

  it("sums to each member's independently hand-computed net balance, and nets to zero across the group", () => {
    // Alice pays 90 (equal 3-way): paid line +60, others' shares -30 each.
    // Bob pays 30 (exact 3-way, 10 each): paid line +20, others' shares -10 each.
    // Settlement: Alice pays Bob 5 -> Alice +5, Bob -5.
    // Exchange: Alice (party_a, CAD leg) owes Charlie (party_b) 8 CAD; Charlie owes Alice 6 USD (not counted in CAD).
    const g = group({
      members: [member("Alice", "Alice"), member("Bob", "Bob"), member("Charlie", "Charlie")],
      expenses: [
        expense({ paid_by: "Alice", amount: 90, currency: "CAD", title: "Dinner", splits: equalSplit(["Alice", "Bob", "Charlie"]) }),
        expense({
          paid_by: "Bob",
          amount: 30,
          currency: "CAD",
          title: "Groceries",
          splits: [{ user_id: "Alice", amount_owed: 10 }, { user_id: "Bob", amount_owed: 10 }, { user_id: "Charlie", amount_owed: 10 }],
        }),
      ],
      settlements: [settlement({ from: "Alice", to: "Bob", amount: 5, currency: "CAD" })],
      exchanges: [exchange({ party_a: "Alice", currency_a: "CAD", amount_a: 8, party_b: "Charlie", currency_b: "USD", amount_b: 6 })],
    });

    const sum = (userId: string) => computeBalanceBreakdown(g, userId, "CAD").reduce((acc, l) => acc + l.amount, 0);
    const aliceNet = sum("Alice");
    const bobNet = sum("Bob");
    const charlieNet = sum("Charlie");

    expect(aliceNet).toBeCloseTo(47, 8); // 60 - 10 + 5 - 8
    expect(bobNet).toBeCloseTo(-15, 8); // -30 + 20 - 5
    expect(charlieNet).toBeCloseTo(-32, 8); // -30 - 10 + 8
    expect(aliceNet + bobNet + charlieNet).toBeCloseTo(0, 8);
  });

  it("sorts lines most-recent-first", () => {
    const g = group({
      members: [member("Alice", "Alice"), member("Bob", "Bob")],
      expenses: [
        expense({ paid_by: "Alice", amount: 10, currency: "CAD", title: "Old", date: "2025-01-01T00:00:00.000Z", splits: [{ user_id: "Bob", amount_owed: 10 }] }),
        expense({ paid_by: "Alice", amount: 20, currency: "CAD", title: "New", date: "2025-06-01T00:00:00.000Z", splits: [{ user_id: "Bob", amount_owed: 20 }] }),
      ],
    });
    const labels = computeBalanceBreakdown(g, "Alice", "CAD").map((l) => l.label);
    expect(labels).toEqual(['Paid for "New"', 'Paid for "Old"']);
  });
});
