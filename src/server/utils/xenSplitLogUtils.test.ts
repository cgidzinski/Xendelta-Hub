import { describe, it, expect } from "vitest";
import { diffFields, normaliseLogValue, collectLogUserIds, EXPENSE_LOG_FIELDS } from "./xenSplitLogUtils";

const A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const C = "cccccccccccccccccccccccc";

describe("normaliseLogValue", () => {
  it("collapses blank values to null", () => {
    expect(normaliseLogValue(undefined)).toBeNull();
    expect(normaliseLogValue(null)).toBeNull();
    expect(normaliseLogValue("")).toBeNull();
  });

  it("turns dates into ISO strings", () => {
    expect(normaliseLogValue(new Date("2026-03-01T00:00:00.000Z"))).toBe("2026-03-01T00:00:00.000Z");
  });

  it("reduces splits to their user id and amounts", () => {
    expect(normaliseLogValue([{ user_id: A, amount_owed: 5, percentage: null, extra: 1 }])).toEqual([{ user_id: A, amount_owed: 5 }]);
  });

  it("unwraps values that expose toObject (mongoose arrays)", () => {
    const fake = { toObject: () => ["USD", "EUR"] };
    expect(normaliseLogValue(fake)).toEqual(["USD", "EUR"]);
  });
});

describe("diffFields", () => {
  const base = {
    title: "Groceries",
    amount: 40,
    currency: "CAD",
    paid_by: A,
    date: new Date("2026-03-01T00:00:00.000Z"),
    category: undefined,
    notes: "",
    split_type: "equal",
    splits: [{ user_id: A, amount_owed: 20 }, { user_id: B, amount_owed: 20 }],
    on_hold: false,
  };

  it("reports nothing when nothing changed", () => {
    expect(diffFields(base, { ...base, date: new Date(base.date), notes: null }, EXPENSE_LOG_FIELDS)).toEqual([]);
  });

  it("reports each changed field with before and after", () => {
    const after = { ...base, amount: 42, title: "Food", splits: [{ user_id: A, amount_owed: 21 }, { user_id: B, amount_owed: 21 }] };
    expect(diffFields(base, after, EXPENSE_LOG_FIELDS)).toEqual([
      { field: "title", from: "Groceries", to: "Food" },
      { field: "amount", from: 40, to: 42 },
      {
        field: "splits",
        from: [{ user_id: A, amount_owed: 20 }, { user_id: B, amount_owed: 20 }],
        to: [{ user_id: A, amount_owed: 21 }, { user_id: B, amount_owed: 21 }],
      },
    ]);
  });

  it("treats a date moved to another day as a change", () => {
    const changes = diffFields(base, { ...base, date: new Date("2026-03-02T00:00:00.000Z") }, ["date"]);
    expect(changes).toEqual([{ field: "date", from: "2026-03-01T00:00:00.000Z", to: "2026-03-02T00:00:00.000Z" }]);
  });

  it("ignores fields it wasn't asked about", () => {
    expect(diffFields({ a: 1, title: "x" }, { a: 2, title: "x" }, ["title"])).toEqual([]);
  });
});

describe("collectLogUserIds", () => {
  it("gathers the actor, meta user fields and ids inside payer/split changes", () => {
    const ids = collectLogUserIds({
      actor_id: A,
      meta: { from: B, amount: 10, currency: "CAD" },
      changes: [
        { field: "paid_by", from: A, to: C },
        { field: "splits", from: [{ user_id: B }], to: [{ user_id: C }] },
        { field: "title", from: "x", to: "y" },
      ],
    });
    expect(ids.sort()).toEqual([A, B, C]);
  });

  it("skips a null actor and non-id values", () => {
    expect(collectLogUserIds({ actor_id: null, meta: { user_id: "not-an-id" } })).toEqual([]);
  });
});
