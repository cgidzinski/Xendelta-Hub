import { describe, it, expect } from "vitest";
import {
  normalizeMerchant, classifyFrequency, priceLevels, detectRecurring, monthlyCommitted,
  merchantMatchPattern, type RecurringInputItem,
} from "./xenBudgetRecurring";

/** A run of `count` charges starting at `start`, `everyDays` apart. */
function series(
  description: string, amount: number, start: string, everyDays: number, count: number,
  amountAt?: (index: number) => number,
): RecurringInputItem[] {
  const from = new Date(start).getTime();
  return Array.from({ length: count }, (_, i) => ({
    date: new Date(from + i * everyDays * 86_400_000),
    amount: amountAt ? amountAt(i) : amount,
    description,
  }));
}

/** Monthly charges that land on the same day-of-month, the way a real subscription does. */
function monthly(
  description: string, amount: number, startIso: string, count: number,
  amountAt?: (index: number) => number,
): RecurringInputItem[] {
  const start = new Date(startIso);
  return Array.from({ length: count }, (_, i) => ({
    date: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, start.getUTCDate())),
    amount: amountAt ? amountAt(i) : amount,
    description,
  }));
}

describe("normalizeMerchant", () => {
  it("strips processor prefixes", () => {
    expect(normalizeMerchant("SQ *COFFEE SHOP")).toBe("COFFEE SHOP");
    expect(normalizeMerchant("TST* COFFEE SHOP")).toBe("COFFEE SHOP");
    expect(normalizeMerchant("PAYPAL *SPOTIFY")).toBe("SPOTIFY");
  });

  it("strips a prefix stacked on another", () => {
    expect(normalizeMerchant("POS SQ *COFFEE SHOP")).toBe("COFFEE SHOP");
  });

  it("collapses the varying reference number that makes each charge look unique", () => {
    expect(normalizeMerchant("NETFLIX.COM 8829472")).toBe("NETFLIX COM");
    expect(normalizeMerchant("NETFLIX.COM 1120038")).toBe("NETFLIX COM");
  });

  it("keeps short digit runs that are part of the name", () => {
    expect(normalizeMerchant("7-ELEVEN #221")).toBe("7 ELEVEN");
    expect(normalizeMerchant("STORE 22")).toBe("STORE 22");
  });

  it("does not eat a merchant whose real name starts like a prefix", () => {
    expect(normalizeMerchant("SPA WORLD")).toBe("SPA WORLD");
  });

  it("normalises punctuation and case so variants group together", () => {
    expect(normalizeMerchant("netflix.com")).toBe(normalizeMerchant("NETFLIX COM"));
  });
});

describe("classifyFrequency", () => {
  it("recognises a clean monthly cadence", () => {
    expect(classifyFrequency([31, 28, 31, 30])).toBe("monthly");
  });

  it("recognises weekly, biweekly, quarterly and yearly", () => {
    expect(classifyFrequency([7, 7, 7])).toBe("weekly");
    expect(classifyFrequency([14, 14, 15])).toBe("biweekly");
    expect(classifyFrequency([91, 92, 90])).toBe("quarterly");
    expect(classifyFrequency([365, 366])).toBe("yearly");
  });

  it("refuses to classify irregular gaps rather than guessing", () => {
    // A shop visited "every week or two": the median is near 7, the gaps disagree.
    expect(classifyFrequency([3, 12, 5, 19, 7])).toBeNull();
  });

  it("returns null for a gap that matches no cadence", () => {
    expect(classifyFrequency([50, 51, 49])).toBeNull();
  });

  it("tolerates one doubled gap in an otherwise clean series", () => {
    // A skipped month or a card reissue must not disqualify the series.
    expect(classifyFrequency([30, 31, 61, 30, 31])).toBe("monthly");
  });

  it("needs at least two gaps to say anything", () => {
    expect(classifyFrequency([30])).toBeNull();
  });
});

describe("priceLevels", () => {
  it("treats a steady price as one level", () => {
    expect(priceLevels([16.99, 16.99, 16.99])).toHaveLength(1);
  });

  it("splits where the price rises and stays risen", () => {
    const levels = priceLevels([11.99, 11.99, 13.99, 13.99]);
    expect(levels).toHaveLength(2);
    expect(levels[1]).toEqual({ amount: 13.99, startIndex: 2 });
  });

  it("gives a varying amount a level per charge", () => {
    expect(priceLevels([12.4, 87.2, 33.1, 55.9])).toHaveLength(4);
  });
});

describe("detectRecurring", () => {
  const now = new Date("2026-08-26T00:00:00.000Z");

  it("detects a clean monthly subscription", () => {
    const found = detectRecurring(monthly("NETFLIX.COM 8829472", 16.99, "2026-01-15", 8), now);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      merchant: "NETFLIX COM",
      amount: 16.99,
      frequency: "monthly",
      occurrences: 8,
      monthly_equivalent: 16.99,
      status: "active",
    });
    expect(found[0].price_changes).toEqual([]);
  });

  it("keeps a price rise as one series and reports the change", () => {
    const found = detectRecurring(
      monthly("SPOTIFY", 0, "2026-01-10", 8, (i) => (i < 3 ? 11.99 : 13.99)),
      now,
    );
    expect(found).toHaveLength(1);
    // The CURRENT price, not an average across the rise.
    expect(found[0].amount).toBe(13.99);
    expect(found[0].price_changes).toEqual([
      { date: "2026-04-10T00:00:00.000Z", from: 11.99, to: 13.99 },
    ]);
  });

  it("does not classify an irregular merchant", () => {
    const visits: RecurringInputItem[] = [
      { date: new Date("2026-06-02"), amount: 41.2, description: "SOBEYS #1120" },
      { date: new Date("2026-06-14"), amount: 112.9, description: "SOBEYS #1120" },
      { date: new Date("2026-06-19"), amount: 12.4, description: "SOBEYS #1120" },
      { date: new Date("2026-07-08"), amount: 88.35, description: "SOBEYS #1120" },
      { date: new Date("2026-07-15"), amount: 23.1, description: "SOBEYS #1120" },
    ];
    expect(detectRecurring(visits, now)).toEqual([]);
  });

  it("rejects a regular cadence whose amount is different every time", () => {
    // Weekly gaps, but a shop rather than a subscription — the price levels give it away.
    const shop = series("FARMERS MARKET", 0, "2026-05-01", 7, 8, (i) => 20 + i * 11);
    expect(detectRecurring(shop, now)).toEqual([]);
  });

  it("needs at least three occurrences", () => {
    expect(detectRecurring(monthly("GYM", 45, "2026-06-01", 2), now)).toEqual([]);
  });

  it("clamps the next expected date to the end of a short month", () => {
    // Jan 31 -> Feb 28 -> Mar 31: advanceDate clamps per-occurrence, never cumulatively.
    const found = detectRecurring([
      { date: new Date(Date.UTC(2026, 0, 31)), amount: 20, description: "RENT" },
      { date: new Date(Date.UTC(2026, 1, 28)), amount: 20, description: "RENT" },
      { date: new Date(Date.UTC(2026, 2, 31)), amount: 20, description: "RENT" },
      { date: new Date(Date.UTC(2026, 3, 30)), amount: 20, description: "RENT" },
    ], new Date("2026-05-02T00:00:00.000Z"));
    expect(found).toHaveLength(1);
    expect(found[0].next_expected).toBe("2026-05-30T00:00:00.000Z");
  });

  it("marks a series whose charge has not landed as missing", () => {
    // Last charge Jan 15, so February's is six weeks overdue but not yet abandoned.
    const found = detectRecurring(
      monthly("DISNEY PLUS", 11.99, "2025-10-15", 4),
      new Date("2026-02-28T00:00:00.000Z"),
    );
    expect(found[0].status).toBe("missing");
  });

  it("marks a long-silent series as ended", () => {
    const found = detectRecurring(monthly("OLD GYM", 45, "2025-01-05", 5), now);
    expect(found[0].status).toBe("ended");
  });

  it("groups the same merchant across differing reference numbers", () => {
    const items = monthly("NETFLIX.COM", 16.99, "2026-01-15", 6)
      .map((item, i) => ({ ...item, description: `NETFLIX.COM ${1000000 + i * 7717}` }));
    const found = detectRecurring(items, now);
    expect(found).toHaveLength(1);
    expect(found[0].occurrences).toBe(6);
  });

  it("sorts by monthly cost, so a yearly renewal does not outrank the monthly bills", () => {
    const found = detectRecurring([
      ...monthly("INTERNET", 90, "2026-01-08", 8),
      ...series("DOMAIN RENEWAL", 240, "2023-03-01", 365, 4),
    ], now);
    expect(found.map((s) => s.merchant)).toEqual(["INTERNET", "DOMAIN RENEWAL"]);
    expect(found[1].monthly_equivalent).toBe(20);
  });

  it("carries the categories seen on the series, most recent first", () => {
    const items = monthly("NETFLIX", 16.99, "2026-01-15", 4).map((item, i) => ({
      ...item,
      categories: i < 2 ? [{ name: "Other" }] : [{ name: "Entertainment" }],
    }));
    expect(detectRecurring(items, now)[0].categories).toEqual(["Entertainment", "Other"]);
  });

  it("skips a description that normalises away to nothing", () => {
    expect(detectRecurring(monthly("99999999", 10, "2026-01-05", 5), now)).toEqual([]);
  });
});

describe("monthlyCommitted", () => {
  const now = new Date("2026-08-26T00:00:00.000Z");

  it("adds up what the live series cost per month", () => {
    const found = detectRecurring([
      ...monthly("NETFLIX", 16.99, "2026-01-15", 8),
      ...monthly("INTERNET", 90, "2026-01-08", 8),
    ], now);
    expect(monthlyCommitted(found)).toBe(106.99);
  });

  it("leaves out a series that has stopped, but still counts one that is merely late", () => {
    const found = detectRecurring([
      ...monthly("NETFLIX", 16.99, "2026-01-15", 8),   // active
      ...monthly("OLD GYM", 45, "2025-01-05", 5),      // ended
    ], now);
    expect(found.map((s) => s.status).sort()).toEqual(["active", "ended"]);
    expect(monthlyCommitted(found)).toBe(16.99);
  });
});

describe("merchantMatchPattern", () => {
  const matches = (merchant: string, description: string) =>
    new RegExp(merchantMatchPattern(merchant), "i").test(description);

  it("finds the merchant back in the raw description it was normalised from", () => {
    // The whole point: the dot the normaliser turned into a space is still a dot on disk.
    expect(matches("NETFLIX COM", "NETFLIX.COM 8829472")).toBe(true);
    expect(matches("NETFLIX COM", "NETFLIX.COM 1120038")).toBe(true);
  });

  it("matches whichever separator the original used", () => {
    expect(matches("NETFLIX COM", "NETFLIX COM")).toBe(true);
    expect(matches("NETFLIX COM", "NETFLIXCOM")).toBe(true);
  });

  it("finds a merchant behind a processor prefix", () => {
    expect(matches("COFFEE SHOP", "SQ *COFFEE SHOP")).toBe(true);
    expect(matches("7 ELEVEN", "7-ELEVEN #221")).toBe(true);
  });

  it("does not match inside a longer word", () => {
    expect(matches("APPLE", "PINEAPPLE FARMS")).toBe(false);
    expect(matches("APPLE", "APPLE.COM/BILL")).toBe(true);
  });

  it("does not match a different merchant", () => {
    expect(matches("NETFLIX COM", "SPOTIFY USA")).toBe(false);
  });

  it("treats regex metacharacters in a merchant name as literal", () => {
    // Normalisation strips most of these, but the escape has to hold regardless — an
    // unescaped one would either throw or match far too much.
    expect(() => new RegExp(merchantMatchPattern("A+B (C)"))).not.toThrow();
    expect(matches("A+B", "A+B STORE")).toBe(true);
  });

  it("returns an empty pattern for a name that normalises away to nothing", () => {
    expect(merchantMatchPattern("99999999")).toBe("");
  });
});
