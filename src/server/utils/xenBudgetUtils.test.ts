import { describe, it, expect } from "vitest";
import {
  resolveShares,
  resolveCategories,
  budgetPeriodRange,
  previousPeriodRanges,
  computeImportHash,
  normalizeDescription,
  roundMoney,
  seedPeriods,
  isoWeekKey,
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

describe("resolveCategories", () => {
  it("gives a lone category the whole amount", () => {
    const cats = resolveCategories("equal", 312.4, [{ name: "Groceries" }]);
    expect(cats).toEqual([{ name: "Groceries", amount: 312.4, percentage: undefined }]);
  });

  it("splits a purchase across categories by percentage", () => {
    const cats = resolveCategories("percent", 312.4, [
      { name: "Groceries", percentage: 70 },
      { name: "Household", percentage: 30 },
    ]);
    expect(cats.map((c) => c.amount)).toEqual([218.68, 93.72]);
    expect(sum(cats)).toBe(312.4);
  });

  it("puts the rounding residual on the last category, exactly as it does for people", () => {
    // The per-category rollup sums these independently, so they must reconcile with the
    // item to the penny or the report stops adding up.
    const cats = resolveCategories("equal", 10, [
      { name: "A" }, { name: "B" }, { name: "C" },
    ]);
    expect(cats.map((c) => c.amount)).toEqual([3.33, 3.33, 3.34]);
    expect(sum(cats)).toBe(10);
  });

  it("honours exact amounts and absorbs the shortfall", () => {
    const cats = resolveCategories("exact", 100, [
      { name: "A", amount: 70 }, { name: "B", amount: 25 },
    ]);
    expect(cats.map((c) => c.amount)).toEqual([70, 30]);
    expect(sum(cats)).toBe(100);
  });

  it("leaves an item with no categories uncategorised rather than spreading it", () => {
    // Unlike shares there is no sensible fallback set: nobody said what this purchase
    // was, and inventing an answer would put money in categories the user never chose.
    expect(resolveCategories("equal", 50, [])).toEqual([]);
  });
});

describe("budgetPeriodRange", () => {
  it("runs calendar months regardless of when the budget was created", () => {
    const range = budgetPeriodRange(
      { period: "monthly", start_date: "2026-01-15T05:00:00.000Z" },
      new Date("2026-08-21T12:00:00.000Z"),
    );
    expect(range.from.toISOString().slice(0, 10)).toBe("2026-08-01");
    expect(range.to.toISOString().slice(0, 10)).toBe("2026-09-01");
  });

  it("always starts on the 1st, even in short months", () => {
    const range = budgetPeriodRange(
      { period: "monthly", start_date: "2026-01-31T05:00:00.000Z" },
      new Date("2026-02-15T12:00:00.000Z"),
    );
    expect(range.from.toISOString().slice(0, 10)).toBe("2026-02-01");
    expect(range.to.toISOString().slice(0, 10)).toBe("2026-03-01");
  });

  it("steps quarterly budgets to the calendar quarter, not an anchor", () => {
    const range = budgetPeriodRange(
      { period: "quarterly", start_date: "2026-05-01T05:00:00.000Z" },
      new Date("2026-08-21T12:00:00.000Z"),
    );
    expect(range.from.toISOString().slice(0, 10)).toBe("2026-07-01");
    expect(range.to.toISOString().slice(0, 10)).toBe("2026-10-01");
  });

  it("runs yearly budgets Jan 1 to Jan 1, not from the anchor", () => {
    const range = budgetPeriodRange(
      { period: "yearly", start_date: "2025-04-01T04:00:00.000Z" },
      new Date("2026-08-21T12:00:00.000Z"),
    );
    expect(range.from.toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(range.to.toISOString().slice(0, 10)).toBe("2027-01-01");
  });

  it("runs weekly budgets Monday-to-Monday, not from the anchor's weekday", () => {
    // 2026-08-21 is a Friday, so the ISO week it falls in starts Mon 2026-08-17.
    const range = budgetPeriodRange(
      { period: "weekly", start_date: "2026-01-07T05:00:00.000Z" },
      new Date("2026-08-21T12:00:00.000Z"),
    );
    expect(range.from.toISOString().slice(0, 10)).toBe("2026-08-17");
    expect(range.to.toISOString().slice(0, 10)).toBe("2026-08-24");
  });

  it("uses the explicit window for a custom budget", () => {
    const from = "2026-03-01T05:00:00.000Z";
    const to = "2026-06-01T04:00:00.000Z";
    const range = budgetPeriodRange({ period: "custom", start_date: from, end_date: to }, new Date());
    expect(range.from.toISOString()).toBe(new Date(from).toISOString());
    expect(range.to.toISOString()).toBe(new Date(to).toISOString());
  });

  it("produces a period boundary at UTC midnight", () => {
    const range = budgetPeriodRange(
      { period: "monthly", start_date: "2026-01-01T05:00:00.000Z" },
      new Date("2026-08-21T12:00:00.000Z"),
    );
    expect(range.from.toISOString()).toBe("2026-08-01T00:00:00.000Z");
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

describe("seedPeriods", () => {
  it("emits every month in the range, including ones with no spending", () => {
    const keys = seedPeriods(
      new Date("2026-06-01T04:00:00.000Z"),
      new Date("2026-09-15T12:00:00.000Z"),
      "month",
    );
    expect(keys).toEqual(["2026-06", "2026-07", "2026-08", "2026-09"]);
  });

  it("emits days without duplicating any", () => {
    const keys = seedPeriods(
      new Date("2026-08-01T04:00:00.000Z"),
      new Date("2026-08-04T12:00:00.000Z"),
      "day",
    );
    expect(keys).toEqual(["2026-08-01", "2026-08-02", "2026-08-03", "2026-08-04"]);
  });

  it("collapses a week's days into one week key", () => {
    const keys = seedPeriods(
      new Date("2026-08-17T04:00:00.000Z"),
      new Date("2026-08-30T12:00:00.000Z"),
      "week",
    );
    expect(keys).toEqual(["2026-W34", "2026-W35"]);
  });

  it("buckets by the UTC day, so a date-only boundary starts a new period", () => {
    const keys = seedPeriods(
      new Date("2026-08-30T04:00:00.000Z"),
      new Date("2026-09-01T02:00:00.000Z"),
      "month",
    );
    expect(keys).toEqual(["2026-08", "2026-09"]);
  });

  it("returns nothing for an inverted range", () => {
    expect(seedPeriods(new Date("2026-09-01"), new Date("2026-08-01"), "month")).toEqual([]);
  });

  it("covers a single-instant range with one bucket", () => {
    const d = new Date("2026-08-21T12:00:00.000Z");
    expect(seedPeriods(d, d, "month")).toEqual(["2026-08"]);
  });
});

describe("isoWeekKey", () => {
  // These must agree with Mongo's $dateToString "%G-W%V" or the seeded buckets never
  // join the aggregated ones and every period renders empty.
  it("pads the week number to two digits", () => {
    expect(isoWeekKey(2026, 1, 5)).toBe("2026-W02");
  });

  it("uses the ISO year of the week's Thursday, not the calendar year", () => {
    // 2027-01-01 is a Friday, in the week whose Thursday is 2026-12-31.
    expect(isoWeekKey(2027, 1, 1)).toBe("2026-W53");
  });

  it("puts a late-December date in week 1 of the next ISO year when it belongs there", () => {
    // 2024-12-30 is a Monday, in the week whose Thursday is 2025-01-02.
    expect(isoWeekKey(2024, 12, 30)).toBe("2025-W01");
  });

  it("starts the week on Monday", () => {
    expect(isoWeekKey(2026, 8, 17)).toBe(isoWeekKey(2026, 8, 23));   // Mon..Sun
    expect(isoWeekKey(2026, 8, 24)).not.toBe(isoWeekKey(2026, 8, 23));
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

describe("previousPeriodRanges", () => {
  const iso = (r: { from: Date; to: Date }) =>
    [r.from.toISOString().slice(0, 10), r.to.toISOString().slice(0, 10)];

  it("walks back whole calendar months, oldest first", () => {
    const ranges = previousPeriodRanges(
      { period: "monthly" }, new Date("2026-08-14T00:00:00.000Z"), 3,
    );
    expect(ranges.map(iso)).toEqual([
      ["2026-06-01", "2026-07-01"],
      ["2026-07-01", "2026-08-01"],
      ["2026-08-01", "2026-09-01"],
    ]);
  });

  it("ends with the window `asOf` falls in, so the last column is the live one", () => {
    const ranges = previousPeriodRanges(
      { period: "monthly" }, new Date("2026-08-14T00:00:00.000Z"), 6,
    );
    expect(iso(ranges[ranges.length - 1])).toEqual(["2026-08-01", "2026-09-01"]);
  });

  it("crosses a year boundary without drifting", () => {
    const ranges = previousPeriodRanges(
      { period: "monthly" }, new Date("2026-01-20T00:00:00.000Z"), 3,
    );
    expect(ranges.map(iso)).toEqual([
      ["2025-11-01", "2025-12-01"],
      ["2025-12-01", "2026-01-01"],
      ["2026-01-01", "2026-02-01"],
    ]);
  });

  it("steps a quarterly budget three months at a time", () => {
    const ranges = previousPeriodRanges(
      { period: "quarterly" }, new Date("2026-08-14T00:00:00.000Z"), 3,
    );
    expect(ranges.map(iso)).toEqual([
      ["2026-01-01", "2026-04-01"],
      ["2026-04-01", "2026-07-01"],
      ["2026-07-01", "2026-10-01"],
    ]);
  });

  it("steps a yearly budget a year at a time", () => {
    const ranges = previousPeriodRanges(
      { period: "yearly" }, new Date("2026-08-14T00:00:00.000Z"), 2,
    );
    expect(ranges.map(iso)).toEqual([
      ["2025-01-01", "2026-01-01"],
      ["2026-01-01", "2027-01-01"],
    ]);
  });

  it("steps a weekly budget Monday to Monday", () => {
    // 2026-08-14 is a Friday; its ISO week starts Monday the 10th.
    const ranges = previousPeriodRanges(
      { period: "weekly" }, new Date("2026-08-14T00:00:00.000Z"), 3,
    );
    expect(ranges.map(iso)).toEqual([
      ["2026-07-27", "2026-08-03"],
      ["2026-08-03", "2026-08-10"],
      ["2026-08-10", "2026-08-17"],
    ]);
  });

  it("agrees with budgetPeriodRange on the window it shares with it", () => {
    const asOf = new Date("2026-08-14T00:00:00.000Z");
    const ranges = previousPeriodRanges({ period: "monthly" }, asOf, 4);
    const current = budgetPeriodRange({ period: "monthly" }, asOf);
    expect(iso(ranges[ranges.length - 1])).toEqual(iso(current));
  });

  it("gives a one-off budget no history, since it has no repeating window", () => {
    expect(previousPeriodRanges(
      { period: "custom", start_date: "2026-01-01", end_date: "2026-03-01" },
      new Date("2026-08-14T00:00:00.000Z"), 6,
    )).toEqual([]);
  });

  it("returns nothing for a count of zero, which is what makes history opt-in", () => {
    expect(previousPeriodRanges({ period: "monthly" }, new Date(), 0)).toEqual([]);
    expect(previousPeriodRanges({ period: "monthly" }, new Date(), -3)).toEqual([]);
  });

  it("hands back exactly `count` windows, with no gaps between them", () => {
    const ranges = previousPeriodRanges(
      { period: "monthly" }, new Date("2026-08-14T00:00:00.000Z"), 12,
    );
    expect(ranges).toHaveLength(12);
    ranges.slice(1).forEach((r, i) => {
      expect(r.from.getTime()).toBe(ranges[i].to.getTime());
    });
  });
});
