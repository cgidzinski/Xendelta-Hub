import { describe, it, expect } from "vitest";
import { summarizeGoal, serializeGoal, serializeGoals } from "./xenBudgetGoals";

function contribution(amount: number, over: Record<string, any> = {}) {
  return {
    _id: `c${amount}`,
    amount,
    date: new Date("2026-03-01T00:00:00.000Z"),
    user_id: "u1",
    created_at: new Date("2026-03-01T00:00:00.000Z"),
    ...over,
  };
}

function goal(contributions: any[], over: Record<string, any> = {}) {
  return {
    _id: "g1",
    name: "New car",
    description: "Something with four doors",
    target_amount: 20000,
    currency: "CAD",
    status: "active",
    contributions,
    created_by: "u1",
    ...over,
  };
}

describe("summarizeGoal", () => {
  it("sums a plain run of deposits", () => {
    const summary = summarizeGoal(goal([contribution(500), contribution(250)]));
    expect(summary.saved).toBe(750);
    expect(summary.contribution_count).toBe(2);
  });

  it("nets withdrawals off, since the ledger is signed", () => {
    const summary = summarizeGoal(goal([contribution(500), contribution(-125.5)]));
    expect(summary.saved).toBe(374.5);
    // A withdrawal is still a ledger entry - the count is movements, not deposits.
    expect(summary.contribution_count).toBe(2);
  });

  it("rounds the running total to cents rather than carrying float drift", () => {
    const summary = summarizeGoal(goal([contribution(0.1), contribution(0.2)]));
    expect(summary.saved).toBe(0.3);
  });

  it("reports an empty goal as zero, not as undefined", () => {
    const summary = summarizeGoal(goal([]));
    expect(summary.saved).toBe(0);
    expect(summary.contribution_count).toBe(0);
    expect(summary.by_person).toEqual([]);
    expect(summary.last_contribution_at).toBeUndefined();
  });

  it("tolerates a goal with no contributions array at all", () => {
    expect(summarizeGoal({ name: "New car" }).saved).toBe(0);
  });

  it("groups by person, biggest first, netting each person's withdrawals", () => {
    const summary = summarizeGoal(goal([
      contribution(100, { user_id: "u1" }),
      contribution(400, { user_id: "u2" }),
      contribution(-50, { user_id: "u2" }),
      contribution(200, { user_id: "u1" }),
    ]));
    expect(summary.by_person).toEqual([
      { user_id: "u2", amount: 350 },
      { user_id: "u1", amount: 300 },
    ]);
  });

  it("takes the latest date, whatever order the ledger is stored in", () => {
    const summary = summarizeGoal(goal([
      contribution(100, { date: new Date("2026-05-04T00:00:00.000Z") }),
      contribution(100, { date: new Date("2026-01-09T00:00:00.000Z") }),
    ]));
    expect(summary.last_contribution_at).toBe("2026-05-04T00:00:00.000Z");
  });

  it("ignores an unparseable date rather than reporting one", () => {
    const summary = summarizeGoal(goal([contribution(100, { date: "not a date" })]));
    expect(summary.saved).toBe(100);
    expect(summary.last_contribution_at).toBeUndefined();
  });
});

describe("serializeGoal", () => {
  it("carries the totals but not the ledger when contributions are excluded", () => {
    const wire = serializeGoal(goal([contribution(500)]), false);
    expect(wire.saved).toBe(500);
    expect(wire.contribution_count).toBe(1);
    expect(wire.contributions).toBeUndefined();
  });

  it("includes the ledger with ISO dates when asked for it", () => {
    const wire = serializeGoal(goal([contribution(500)]), true);
    expect(wire.contributions).toHaveLength(1);
    expect(wire.contributions[0].date).toBe("2026-03-01T00:00:00.000Z");
    expect(wire.contributions[0].amount).toBe(500);
  });

  it("stringifies the id of a linked item so the client can match it to one", () => {
    const wire = serializeGoal(
      goal([contribution(500, { item_id: { toString: () => "item-1" } })]), true,
    );
    expect(wire.contributions[0].item_id).toBe("item-1");
  });

  it("defaults a goal stored before status existed to active", () => {
    expect(serializeGoal(goal([], { status: undefined }), false).status).toBe("active");
  });
});

describe("serializeGoals", () => {
  it("maps a list, and treats a missing one as empty", () => {
    expect(serializeGoals([goal([contribution(10)]), goal([])], false).map((g) => g.saved))
      .toEqual([10, 0]);
    expect(serializeGoals(undefined, false)).toEqual([]);
  });
});
