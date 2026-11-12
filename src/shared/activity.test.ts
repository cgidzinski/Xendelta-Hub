import { describe, it, expect } from "vitest";
import { ACTIVITY, activityLink, activityText, isActivityVerb, type ActivityVerb, type FeedEntry } from "./activity";

const entry = (verb: ActivityVerb, over: Partial<FeedEntry> = {}): FeedEntry => ({
  id: "1",
  ids: ["1"],
  verb,
  app: verb.split(".")[0],
  actor: { id: "u1", username: "Alex" },
  object: { type: "expense", id: "e1", label: "Dinner" },
  space: { app: verb.split(".")[0], id: "s1", label: "Trip" },
  data: { amount: 12.5, currency: "CAD" },
  count: 1,
  createdAt: new Date().toISOString(),
  ...over,
});

describe("activity verbs", () => {
  it("every verb names its app, reads as text and links somewhere", () => {
    for (const verb of Object.keys(ACTIVITY) as ActivityVerb[]) {
      const e = entry(verb);
      expect(ACTIVITY[verb].app, verb).toBe(verb.split(".")[0]);
      expect(activityText(e).length, verb).toBeGreaterThan(0);
      expect(activityLink(e), verb).toMatch(/^\/internal/);
    }
  });

  it("uses the aggregate wording once events merge, and falls back to the single wording without one", () => {
    expect(
      activityText(entry("xensplit.expense_created", { count: 3, data: { total: 40, currency: "CAD" } })),
    ).toContain("added 3 expenses");
    // member_added has no aggregate wording
    expect(activityText(entry("xensplit.member_added", { count: 2 }))).toContain("added you to");
  });

  it("recognises only defined verbs", () => {
    expect(isActivityVerb("xensplit.expense_created")).toBe(true);
    expect(isActivityVerb("nope.nothing")).toBe(false);
  });
});
