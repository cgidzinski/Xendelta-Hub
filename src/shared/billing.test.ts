import { describe, it, expect } from "vitest";
import {
  COST_CENTERS,
  billedRate,
  billingMonth,
  ceilGems,
  communitiesBilled,
  costOf,
  everythingFree,
  formatGems,
  monthProgress,
  previousBillingMonth,
  statementOf,
  type CostCenter,
} from "./billing";

const metered = (over: Partial<CostCenter> = {}): CostCenter => ({
  id: "downloads",
  label: "Downloads",
  description: "",
  unit: "byte",
  displayUnit: "GB",
  unitsPerDisplayUnit: 1_000_000_000,
  costRate: 10,
  payer: "account",
  status: "metered",
  provider: "cloud_storage",
  ...over,
});

describe("the registry", () => {
  it("starts with every center free, so nothing is charged and Donate stays hidden", () => {
    expect(everythingFree()).toBe(true);
    expect(communitiesBilled()).toBe(false);
    for (const c of COST_CENTERS) expect(billedRate(c)).toBe(0);
  });

  it("has unique ids and positive unit sizes", () => {
    expect(new Set(COST_CENTERS.map((c) => c.id)).size).toBe(COST_CENTERS.length);
    for (const c of COST_CENTERS) expect(c.unitsPerDisplayUnit).toBeGreaterThan(0);
  });

  it("never bills the house's centers", () => {
    expect(billedRate(metered({ payer: "house" }))).toBe(0);
  });
});

describe("rates", () => {
  it("adds the margin to the cost rate", () => {
    expect(billedRate(metered(), 1.25)).toBe(12.5);
    expect(costOf(metered(), 500_000_000, 1.25)).toBe(6.25);
  });

  it("knows when something is being charged", () => {
    expect(everythingFree([metered()])).toBe(false);
    expect(communitiesBilled([metered()])).toBe(true);
  });
});

describe("statementOf", () => {
  it("is empty and owes nothing with no usage", () => {
    const s = statementOf([], 300);
    expect(s).toMatchObject({ lines: [], usageGems: 0, freeTierLeft: 300, amountDue: 0 });
  });

  it("lists a free center's usage at 0 gems", () => {
    const s = statementOf([{ center: "storage", units: 5_000_000_000 }], 300);
    expect(s.lines).toHaveLength(1);
    expect(s.lines[0]).toMatchObject({ center: "storage", gems: 0, rate: 0 });
    expect(s.amountDue).toBe(0);
  });

  it("skips unknown and house centers", () => {
    const s = statementOf(
      [
        { center: "nope", units: 1 },
        { center: "email", units: 10 },
      ],
      0,
    );
    expect(s.lines).toEqual([]);
  });

  it("adds repeated usage of one center together", () => {
    const s = statementOf(
      [
        { center: "storage", units: 1 },
        { center: "storage", units: 2 },
      ],
      0,
    );
    expect(s.lines[0].units).toBe(3);
  });
});

describe("rounding", () => {
  it("rounds what is paid up to a whole gem, once, and ignores float noise", () => {
    expect(ceilGems(0)).toBe(0);
    expect(ceilGems(0.01)).toBe(1);
    expect(ceilGems(2.0000000000001)).toBe(2);
    expect(ceilGems(0.1 + 0.2 + 0.7)).toBe(1);
    expect(ceilGems(2.4)).toBe(3);
  });

  it("shows one decimal, rounded up", () => {
    expect(formatGems(0)).toBe("0 gems");
    expect(formatGems(0.04)).toBe("less than 0.1 gems");
    expect(formatGems(0.1 + 0.2)).toBe("0.3 gems");
    expect(formatGems(0.31)).toBe("0.4 gems");
    expect(formatGems(1)).toBe("1 gem");
    expect(formatGems(1234.56)).toBe("1,234.6 gems");
  });
});

describe("months", () => {
  it("names months in UTC and steps back across a year", () => {
    expect(billingMonth(new Date(Date.UTC(2026, 10, 30, 23, 59)))).toBe("2026-11");
    expect(previousBillingMonth("2026-01")).toBe("2025-12");
  });

  it("measures how far through the month we are", () => {
    expect(monthProgress("2026-11", new Date(Date.UTC(2026, 10, 1)))).toBe(0);
    expect(monthProgress("2026-11", new Date(Date.UTC(2026, 10, 16)))).toBe(0.5);
    expect(monthProgress("2026-10", new Date(Date.UTC(2026, 10, 16)))).toBe(1);
  });
});
