import { describe, it, expect } from "vitest";
import { rewindBefore, excludedSettlementIds, type RewindDocument } from "./rewind";
import { calculateBalances, calculateMinimumTransfers } from "./balances";

function expense(overrides: Partial<RewindDocument["expenses"][number]> & { paid_by: string; amount: number }) {
  return {
    currency: "CAD",
    splits: [] as { user_id: string; amount_owed?: number }[],
    created_at: "2025-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function settlement(overrides: Partial<RewindDocument["settlements"][number]> & { _id: string; from: string; to: string; amount: number }) {
  return { currency: "CAD", settled_at: "2025-06-02T00:00:00.000Z", ...overrides };
}

function doc(overrides: Partial<RewindDocument> & { members: string[] }): RewindDocument {
  return { expenses: [], settlements: [], exchanges: [], ...overrides };
}

describe("excludedSettlementIds", () => {
  it("excludes the named settlement and everything recorded after it", () => {
    const d = doc({
      members: ["A", "B"],
      settlements: [
        settlement({ _id: "old", from: "B", to: "A", amount: 10, settled_at: "2025-06-01T00:00:00.000Z" }),
        settlement({ _id: "mid", from: "B", to: "A", amount: 20, settled_at: "2025-06-05T00:00:00.000Z" }),
        settlement({ _id: "new", from: "B", to: "A", amount: 30, settled_at: "2025-06-09T00:00:00.000Z" }),
      ],
    });
    expect(excludedSettlementIds(d, "mid")).toEqual(new Set(["mid", "new"]));
  });

  it("is empty for an unknown settlement id", () => {
    const d = doc({ members: ["A", "B"], settlements: [settlement({ _id: "only", from: "B", to: "A", amount: 10 })] });
    expect(excludedSettlementIds(d, "nope").size).toBe(0);
  });
});

describe("rewindBefore", () => {
  it("returns the document untouched when the settlement isn't found", () => {
    const d = doc({ members: ["A", "B"], settlements: [settlement({ _id: "s1", from: "B", to: "A", amount: 10 })] });
    expect(rewindBefore(d, "missing")).toBe(d);
  });

  it("keeps older settlements and drops the cut one and newer", () => {
    const d = doc({
      members: ["A", "B"],
      settlements: [
        settlement({ _id: "new", from: "B", to: "A", amount: 30, settled_at: "2025-06-09T00:00:00.000Z" }),
        settlement({ _id: "old", from: "B", to: "A", amount: 10, settled_at: "2025-06-01T00:00:00.000Z" }),
        settlement({ _id: "mid", from: "B", to: "A", amount: 20, settled_at: "2025-06-05T00:00:00.000Z" }),
      ],
    });
    expect(rewindBefore(d, "mid").settlements.map((s) => s._id)).toEqual(["old"]);
  });

  it("cuts expenses on created_at, not on a backdated date", () => {
    // A recurring occurrence carries an old `date` but is entered later; it must
    // not appear in a rewind to before it was entered.
    const d = doc({
      members: ["A", "B"],
      expenses: [
        expense({ paid_by: "A", amount: 10, created_at: "2025-06-01T00:00:00.000Z", date: "2025-06-01T00:00:00.000Z" } as never),
        expense({ paid_by: "A", amount: 99, created_at: "2025-06-20T00:00:00.000Z", date: "2025-01-01T00:00:00.000Z" } as never),
      ],
      settlements: [settlement({ _id: "cut", from: "B", to: "A", amount: 5, settled_at: "2025-06-10T00:00:00.000Z" })],
    });
    expect(rewindBefore(d, "cut").expenses.map((e) => e.amount)).toEqual([10]);
  });

  it("keeps an entry that has no created_at at all", () => {
    const d = doc({
      members: ["A", "B"],
      expenses: [{ paid_by: "A", amount: 10, currency: "CAD", splits: [] }],
      settlements: [settlement({ _id: "cut", from: "B", to: "A", amount: 5 })],
    });
    expect(rewindBefore(d, "cut").expenses).toHaveLength(1);
  });

  it("cuts deterministically when settled_at values are identical", () => {
    const sameInstant = "2025-06-05T00:00:00.000Z";
    const d = doc({
      members: ["A", "B"],
      settlements: [
        settlement({ _id: "first", from: "B", to: "A", amount: 10, settled_at: sameInstant }),
        settlement({ _id: "second", from: "B", to: "A", amount: 20, settled_at: sameInstant }),
        settlement({ _id: "third", from: "B", to: "A", amount: 30, settled_at: sameInstant }),
      ],
    });
    // Array order breaks the tie: later entries are "newer", so a rewind to
    // "second" keeps "first" only — and repeats give the same answer.
    expect(rewindBefore(d, "second").settlements.map((s) => s._id)).toEqual(["first"]);
    expect(rewindBefore(d, "second").settlements.map((s) => s._id)).toEqual(["first"]);
    expect(excludedSettlementIds(d, "second")).toEqual(new Set(["second", "third"]));
  });

  it("drops exchanges recorded after the cut", () => {
    const d = doc({
      members: ["A", "B"],
      exchanges: [
        { party_a: "A", currency_a: "CAD", amount_a: 10, party_b: "B", currency_b: "USD", amount_b: 7, rate: 0.7, created_at: "2025-06-01T00:00:00.000Z" },
        { party_a: "A", currency_a: "CAD", amount_a: 50, party_b: "B", currency_b: "USD", amount_b: 35, rate: 0.7, created_at: "2025-06-20T00:00:00.000Z" },
      ],
      settlements: [settlement({ _id: "cut", from: "B", to: "A", amount: 5, settled_at: "2025-06-10T00:00:00.000Z" })],
    });
    expect(rewindBefore(d, "cut").exchanges?.map((e) => e.amount_a)).toEqual([10]);
  });

  it("reproduces the pending list as it stood before a settlement", () => {
    // The scenario from the regression test: Bo is shown owing You $30, pays it,
    // and comes back owing $60. Rewinding past that payment must restore the $30.
    const expenses = [
      expense({ paid_by: "You", amount: 90, splits: [{ user_id: "Bo", amount_owed: 50 }, { user_id: "Dee", amount_owed: 40 }] }),
      expense({ paid_by: "Ann", amount: 110, splits: [{ user_id: "Bo", amount_owed: 55 }, { user_id: "Dee", amount_owed: 55 }] }),
      expense({ paid_by: "Cy", amount: 70, splits: [{ user_id: "Bo", amount_owed: 35 }, { user_id: "Dee", amount_owed: 35 }] }),
    ];
    const members = ["You", "Ann", "Cy", "Bo", "Dee"];
    const pendingFor = (d: RewindDocument) =>
      calculateMinimumTransfers(calculateBalances(d)).find((t) => t.from === "Bo" && t.to === "You");

    const beforePayment = doc({ members, expenses });
    expect(pendingFor(beforePayment)?.amount).toBe(30);

    const afterPayment = doc({
      members,
      expenses,
      settlements: [settlement({ _id: "bo-paid", from: "Bo", to: "You", amount: 30, settled_at: "2025-06-10T00:00:00.000Z" })],
    });
    expect(pendingFor(afterPayment)?.amount).toBe(60);

    // The whole point of the feature: rewinding past the payment shows the $30 back.
    expect(pendingFor(rewindBefore(afterPayment, "bo-paid"))?.amount).toBe(30);
  });
});
