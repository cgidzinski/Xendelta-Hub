import { describe, it, expect } from "vitest";
import {
  resolveShares,
  budgetPeriodRange,
  computeImportHash,
  normalizeDescription,
  roundMoney,
} from "./xenBudgetUtils";
import { tzMonthKey, tzDayKey, tzMonthStartUtc, zonedWallToUtc } from "./statsRange";

const A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const C = "cccccccccccccccccccccccc";

const sum = (shares: { amount: number }[]) => roundMoney(shares.reduce((a, s) => a + s.amount, 0));

describe("resolveShares", () => {
  it("splits evenly when the amount divides cleanly", () => {
    const shares = resolveShares("equal", 90, [{ user_id: A }, { user_id: B }, { user_id: C }], []);
    expect(shares.map((s) => s.amount)).toEqual([30, 30, 30]);
    expect(sum(shares)).toBe(90);
  });

  it("puts the rounding residual on the last share so an uneven split still reconciles", () => {
    const shares = resolveShares("equal", 10, [{ user_id: A }, { user_id: B }, { user_id: C }], []);
    expect(shares.map((s) => s.amount)).toEqual([3.33, 3.33, 3.34]);
    expect(sum(shares)).toBe(10);
  });

  it("falls back to all members when no participants are given", () => {
    const shares = resolveShares("equal", 50, [], [A, B]);
    expect(shares.map((s) => s.user_id)).toEqual([A, B]);
    expect(sum(shares)).toBe(50);
  });

  it("honours exact shares and absorbs any shortfall into the last one", () => {
    const shares = resolveShares(
      "exact",
      100,
      [{ user_id: A, amount: 70 }, { user_id: B, amount: 25 }],
      [],
    );
    expect(shares.map((s) => s.amount)).toEqual([70, 30]);
    expect(sum(shares)).toBe(100);
  });

  it("converts percentages to amounts that reconcile", () => {
    const shares = resolveShares(
      "percent",
      90,
      [{ user_id: A, percentage: 55.5 }, { user_id: B, percentage: 33.3 }, { user_id: C, percentage: 11.2 }],
      [],
    );
    expect(sum(shares)).toBe(90);
  });

  it("reconciles a percentage split that cannot land on whole cents", () => {
    const shares = resolveShares(
      "percent",
      10,
      [{ user_id: A, percentage: 33.33 }, { user_id: B, percentage: 33.33 }, { user_id: C, percentage: 33.34 }],
      [],
    );
    expect(sum(shares)).toBe(10);
  });

  it("returns nothing for an item with no participants", () => {
    expect(resolveShares("equal", 25, [], [])).toEqual([]);
  });
});

describe("budgetPeriodRange", () => {
  const TZ = "America/Toronto";

  it("runs calendar months when the budget is anchored on the 1st", () => {
    const range = budgetPeriodRange(
      { period: "monthly", start_date: "2026-01-01T05:00:00.000Z" },
      new Date("2026-08-21T12:00:00.000Z"),
      TZ,
    );
    expect(tzDayKey(range.from, TZ)).toBe("2026-08-01");
    expect(tzDayKey(range.to, TZ)).toBe("2026-09-01");
  });

  it("runs 15th-to-15th when the budget is anchored mid-month", () => {
    const anchored = { period: "monthly" as const, start_date: "2026-01-15T05:00:00.000Z" };
    const before = budgetPeriodRange(anchored, new Date("2026-08-10T12:00:00.000Z"), TZ);
    expect(tzDayKey(before.from, TZ)).toBe("2026-07-15");
    expect(tzDayKey(before.to, TZ)).toBe("2026-08-15");

    const after = budgetPeriodRange(anchored, new Date("2026-08-20T12:00:00.000Z"), TZ);
    expect(tzDayKey(after.from, TZ)).toBe("2026-08-15");
    expect(tzDayKey(after.to, TZ)).toBe("2026-09-15");
  });

  it("clamps a 31st anchor into short months instead of skipping them", () => {
    // February has no 31st; the period must still exist, ending on the 28th.
    const range = budgetPeriodRange(
      { period: "monthly", start_date: "2026-01-31T05:00:00.000Z" },
      new Date("2026-02-15T12:00:00.000Z"),
      TZ,
    );
    expect(tzDayKey(range.from, TZ)).toBe("2026-01-31");
    expect(tzDayKey(range.to, TZ)).toBe("2026-02-28");
  });

  it("steps quarterly budgets three months at a time from the anchor", () => {
    const range = budgetPeriodRange(
      { period: "quarterly", start_date: "2026-01-01T05:00:00.000Z" },
      new Date("2026-08-21T12:00:00.000Z"),
      TZ,
    );
    expect(tzDayKey(range.from, TZ)).toBe("2026-07-01");
    expect(tzDayKey(range.to, TZ)).toBe("2026-10-01");
  });

  it("steps yearly budgets from the anchor, not the calendar year", () => {
    const range = budgetPeriodRange(
      { period: "yearly", start_date: "2025-04-01T04:00:00.000Z" },
      new Date("2026-08-21T12:00:00.000Z"),
      TZ,
    );
    expect(tzDayKey(range.from, TZ)).toBe("2026-04-01");
    expect(tzDayKey(range.to, TZ)).toBe("2027-04-01");
  });

  it("runs weekly budgets from the anchor's weekday", () => {
    // 2026-01-05 is a Monday; 2026-08-21 is a Friday, so the period starts Mon 2026-08-17.
    const range = budgetPeriodRange(
      { period: "weekly", start_date: "2026-01-05T05:00:00.000Z" },
      new Date("2026-08-21T12:00:00.000Z"),
      TZ,
    );
    expect(tzDayKey(range.from, TZ)).toBe("2026-08-17");
    expect(tzDayKey(range.to, TZ)).toBe("2026-08-24");
  });

  it("uses the explicit window for a custom budget", () => {
    const from = "2026-03-01T05:00:00.000Z";
    const to = "2026-06-01T04:00:00.000Z";
    const range = budgetPeriodRange({ period: "custom", start_date: from, end_date: to }, new Date(), TZ);
    expect(range.from.toISOString()).toBe(new Date(from).toISOString());
    expect(range.to.toISOString()).toBe(new Date(to).toISOString());
  });

  it("produces a period boundary at local midnight, not UTC midnight", () => {
    // Toronto is UTC-4 in August, so the period starts at 04:00 UTC.
    const range = budgetPeriodRange(
      { period: "monthly", start_date: "2026-01-01T05:00:00.000Z" },
      new Date("2026-08-21T12:00:00.000Z"),
      TZ,
    );
    expect(range.from.toISOString()).toBe("2026-08-01T04:00:00.000Z");
  });
});

describe("timezone keys", () => {
  const TZ = "America/Toronto";

  it("files a late-night instant into the local month, not the UTC one", () => {
    // 2026-09-01T02:00Z is still 22:00 on Aug 31 in Toronto.
    const instant = new Date("2026-09-01T02:00:00.000Z");
    expect(instant.toISOString().slice(0, 7)).toBe("2026-09");
    expect(tzMonthKey(instant, TZ)).toBe("2026-08");
  });

  it("files an early-morning instant into the local day", () => {
    expect(tzDayKey(new Date("2026-09-01T02:00:00.000Z"), TZ)).toBe("2026-08-31");
  });

  it("starts the month at local midnight", () => {
    expect(tzMonthStartUtc(new Date("2026-08-21T12:00:00.000Z"), TZ).toISOString())
      .toBe("2026-08-01T04:00:00.000Z");
  });

  it("round-trips a wall-clock date through the zone it came from", () => {
    const utc = zonedWallToUtc("2026-12-25", TZ);
    // December is UTC-5 in Toronto.
    expect(utc.toISOString()).toBe("2026-12-25T05:00:00.000Z");
    expect(tzDayKey(utc, TZ)).toBe("2026-12-25");
  });
});

describe("import hashing", () => {
  it("collapses the whitespace and case noise in bank descriptions", () => {
    expect(normalizeDescription("  STARBUCKS   #1234  ")).toBe("starbucks #1234");
  });

  it("matches the same transaction across re-imports", () => {
    const a = computeImportHash("2026-08-01T00:00:00.000Z", 42.1, "STARBUCKS  #1234");
    const b = computeImportHash(new Date("2026-08-01T18:30:00.000Z"), 42.1, " starbucks #1234 ");
    expect(a).toBe(b);
  });

  it("distinguishes a different amount, date or payee", () => {
    const base = computeImportHash("2026-08-01", 42.1, "Groceries");
    expect(computeImportHash("2026-08-01", 42.11, "Groceries")).not.toBe(base);
    expect(computeImportHash("2026-08-02", 42.1, "Groceries")).not.toBe(base);
    expect(computeImportHash("2026-08-01", 42.1, "Gas")).not.toBe(base);
  });
});

describe("roundMoney", () => {
  it("pins float arithmetic to cents", () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(10 / 3)).toBe(3.33);
  });
});
