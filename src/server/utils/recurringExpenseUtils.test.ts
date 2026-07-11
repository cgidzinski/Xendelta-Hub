import { describe, it, expect } from "vitest";
import { advanceDate } from "./recurringExpenseUtils";

const utc = (iso: string) => new Date(iso);

describe("advanceDate", () => {
  it("returns the anchor itself for occurrence 0", () => {
    const anchor = utc("2026-07-11T14:30:00.000Z");
    for (const f of ["30s", "daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"] as const) {
      expect(advanceDate(anchor, f, 0).toISOString()).toBe(anchor.toISOString());
    }
  });

  it("advances the 30s test frequency by exact 30-second periods", () => {
    const anchor = utc("2026-01-01T09:00:00.000Z");
    expect(advanceDate(anchor, "30s", 1).toISOString()).toBe("2026-01-01T09:00:30.000Z");
    expect(advanceDate(anchor, "30s", 120).toISOString()).toBe("2026-01-01T10:00:00.000Z");
  });

  it("advances daily by exact 24h periods", () => {
    const anchor = utc("2026-01-01T09:00:00.000Z");
    expect(advanceDate(anchor, "daily", 1).toISOString()).toBe("2026-01-02T09:00:00.000Z");
    expect(advanceDate(anchor, "daily", 31).toISOString()).toBe("2026-02-01T09:00:00.000Z");
    expect(advanceDate(anchor, "daily", 365).toISOString()).toBe("2027-01-01T09:00:00.000Z");
  });

  it("advances weekly and biweekly", () => {
    const anchor = utc("2026-01-05T00:00:00.000Z"); // a Monday
    expect(advanceDate(anchor, "weekly", 1).toISOString()).toBe("2026-01-12T00:00:00.000Z");
    expect(advanceDate(anchor, "weekly", 4).toISOString()).toBe("2026-02-02T00:00:00.000Z");
    expect(advanceDate(anchor, "biweekly", 1).toISOString()).toBe("2026-01-19T00:00:00.000Z");
    expect(advanceDate(anchor, "biweekly", 3).toISOString()).toBe("2026-02-16T00:00:00.000Z");
  });

  it("clamps monthly day-of-month per occurrence without cumulative drift", () => {
    const anchor = utc("2026-01-31T12:00:00.000Z");
    expect(advanceDate(anchor, "monthly", 1).toISOString()).toBe("2026-02-28T12:00:00.000Z");
    expect(advanceDate(anchor, "monthly", 2).toISOString()).toBe("2026-03-31T12:00:00.000Z");
    expect(advanceDate(anchor, "monthly", 3).toISOString()).toBe("2026-04-30T12:00:00.000Z");
    expect(advanceDate(anchor, "monthly", 12).toISOString()).toBe("2027-01-31T12:00:00.000Z");
    // large n stays anchored to the 31st
    expect(advanceDate(anchor, "monthly", 120).toISOString()).toBe("2036-01-31T12:00:00.000Z");
  });

  it("clamps to Feb 29 in leap years", () => {
    const anchor = utc("2027-12-31T08:00:00.000Z");
    expect(advanceDate(anchor, "monthly", 2).toISOString()).toBe("2028-02-29T08:00:00.000Z");
  });

  it("advances quarterly as 3-month periods with clamping", () => {
    const anchor = utc("2026-11-30T10:00:00.000Z");
    expect(advanceDate(anchor, "quarterly", 1).toISOString()).toBe("2027-02-28T10:00:00.000Z");
    expect(advanceDate(anchor, "quarterly", 2).toISOString()).toBe("2027-05-30T10:00:00.000Z");
    expect(advanceDate(anchor, "quarterly", 4).toISOString()).toBe("2027-11-30T10:00:00.000Z");
  });

  it("handles yearly Feb 29 anchors", () => {
    const anchor = utc("2024-02-29T00:00:00.000Z");
    expect(advanceDate(anchor, "yearly", 1).toISOString()).toBe("2025-02-28T00:00:00.000Z");
    expect(advanceDate(anchor, "yearly", 4).toISOString()).toBe("2028-02-29T00:00:00.000Z");
  });

  it("crosses year boundaries for month-based frequencies", () => {
    const anchor = utc("2026-11-15T23:45:00.000Z");
    expect(advanceDate(anchor, "monthly", 2).toISOString()).toBe("2027-01-15T23:45:00.000Z");
    expect(advanceDate(anchor, "quarterly", 1).toISOString()).toBe("2027-02-15T23:45:00.000Z");
  });

  it("preserves the anchor's UTC time-of-day including milliseconds", () => {
    const anchor = utc("2026-03-31T17:05:09.123Z");
    expect(advanceDate(anchor, "monthly", 1).toISOString()).toBe("2026-04-30T17:05:09.123Z");
    expect(advanceDate(anchor, "yearly", 1).toISOString()).toBe("2027-03-31T17:05:09.123Z");
  });
});
