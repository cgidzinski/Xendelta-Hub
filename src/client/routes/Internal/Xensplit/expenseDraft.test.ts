import { describe, it, expect } from "vitest";
import { canSubmit, draftFromExpense, emptyDraft, splitValidity, splitsFor } from "./expenseDraft";
import type { XenSplitExpense, XenSplitMember } from "../../../hooks/xensplit/types";

const members = [
  { user_id: "a", username: "Ann", avatar: null },
  { user_id: "b", username: "Bo", avatar: "b.png" },
] as unknown as XenSplitMember[];
const p = (id: string) => ({ _id: id, username: id, avatar: null });

describe("splitsFor", () => {
  it("equal: just the people", () => {
    expect(splitsFor(emptyDraft({ splitType: "equal", participants: [p("a"), p("b")] }))).toEqual([
      { user_id: "a" },
      { user_id: "b" },
    ]);
  });
  it("exact: parses each amount, missing means 0", () => {
    expect(
      splitsFor(emptyDraft({ splitType: "exact", participants: [p("a"), p("b")], exactSplits: { a: "12.5" } })),
    ).toEqual([
      { user_id: "a", amount_owed: 12.5 },
      { user_id: "b", amount_owed: 0 },
    ]);
  });
  it("percent: parses each percentage", () => {
    expect(
      splitsFor(emptyDraft({ splitType: "percent", participants: [p("a")], percentSplits: { a: "100" } })),
    ).toEqual([{ user_id: "a", percentage: 100 }]);
  });
});

describe("splitValidity / canSubmit", () => {
  it("exact amounts must add up to the total (to the cent)", () => {
    const base = { splitType: "exact" as const, participants: [p("a"), p("b")], amount: "30" };
    expect(splitValidity({ ...base, exactSplits: { a: "10", b: "20" }, percentSplits: {} }).exactOk).toBe(true);
    expect(splitValidity({ ...base, exactSplits: { a: "10", b: "19" }, percentSplits: {} }).exactOk).toBe(false);
  });
  it("percentages must add up to 100", () => {
    const base = { splitType: "percent" as const, participants: [p("a"), p("b")], amount: "30", exactSplits: {} };
    expect(splitValidity({ ...base, percentSplits: { a: "60", b: "40" } }).percentOk).toBe(true);
    expect(splitValidity({ ...base, percentSplits: { a: "60", b: "30" } }).percentOk).toBe(false);
  });
  it("is not checked for other split types or before anyone is selected", () => {
    expect(splitValidity(emptyDraft({ splitType: "equal", amount: "5" }))).toEqual({ exactOk: true, percentOk: true });
    expect(splitValidity(emptyDraft({ splitType: "exact", amount: "5" })).exactOk).toBe(true);
  });
  it("needs a title, amount and payer", () => {
    expect(canSubmit(emptyDraft())).toBe(false);
    expect(canSubmit(emptyDraft({ title: " x ", amount: "5", paidBy: "a" }))).toBe(true);
    expect(canSubmit(emptyDraft({ title: "   ", amount: "5", paidBy: "a" }))).toBe(false);
  });
});

describe("draftFromExpense", () => {
  const expense = {
    _id: "e1",
    title: "Dinner",
    notes: "n",
    amount: 42.5,
    currency: "USD",
    paid_by: "b",
    split_type: "exact",
    splits: [
      { user_id: "a", amount_owed: 10 },
      { user_id: "b", amount_owed: 32.5 },
      { user_id: "gone", amount_owed: 0 },
    ],
    date: "2026-05-01T12:00:00.000Z",
    category: "food",
    on_hold: true,
  } as unknown as XenSplitExpense;

  it("loads fields, resolves the payer and participants from members, and skips people who left", () => {
    const d = draftFromExpense(expense, members);
    expect(d).toMatchObject({
      title: "Dinner",
      notes: "n",
      amount: "42.5",
      currency: "USD",
      paidBy: "b",
      splitType: "exact",
      category: "food",
      onHold: true,
    });
    expect(d.paidByUser).toEqual({ _id: "b", username: "Bo", avatar: "b.png" });
    expect(d.participants.map((x) => x._id)).toEqual(["a", "b"]);
    expect(d.exactSplits).toEqual({ a: "10", b: "32.5", gone: "0" });
    expect(d.date.toISOString()).toBe("2026-05-01T12:00:00.000Z");
  });

  it("a recurring genesis clears the hold and carries the schedule", () => {
    const series = {
      frequency: "weekly",
      end_date: "2026-12-31T00:00:00.000Z",
      max_occurrences: 5,
      active: false,
    } as never;
    const d = draftFromExpense(expense, members, series);
    expect(d).toMatchObject({
      isRecurring: true,
      onHold: false,
      frequency: "weekly",
      maxOccurrences: "5",
      seriesActive: false,
    });
    expect(d.recurringEndDate?.toISOString()).toBe("2026-12-31T00:00:00.000Z");
  });

  it("has no payer when they have since left the group", () => {
    expect(draftFromExpense({ ...expense, paid_by: "gone" } as XenSplitExpense, members).paidByUser).toBeNull();
  });
});
