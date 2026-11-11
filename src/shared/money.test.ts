import { describe, it, expect } from "vitest";
import { roundMoney, roundMoneyExact, formatMoney, currencySymbol } from "./money";

describe("roundMoney (the behaviour everything new should use)", () => {
  it("rounds to two places", () => {
    expect(roundMoney(12.345)).toBe(12.35);
    expect(roundMoney(12.344)).toBe(12.34);
    expect(roundMoney(0)).toBe(0);
    expect(roundMoney(100)).toBe(100);
  });

  it("rounds half-cents up where the multiplication lands on the half (0.015 -> 0.02)", () => {
    expect(roundMoney(0.015)).toBe(0.02);
    expect(roundMoney(0.045)).toBe(0.05);
  });

  it("is identical to the formula the codebase used before it was shared", () => {
    for (let k = -50_000; k <= 50_000; k += 7) {
      const x = k / 1000;
      expect(roundMoney(x)).toBe(Math.round(x * 100) / 100);
    }
  });
});

describe("roundMoneyExact (XenSplit's long-standing behaviour, kept as it was)", () => {
  it("matches toFixed(2)", () => {
    for (let k = -50_000; k <= 50_000; k += 7) {
      const x = k / 1000;
      expect(roundMoneyExact(x)).toBe(Number(x.toFixed(2)));
    }
  });

  it("DIFFERS from roundMoney on some half-cents: pinned so nobody 'tidies' one into the other", () => {
    // 0.015 is 0.01499999999999999944 in binary: toFixed rounds down, Math.round(x * 100) rounds up.
    expect(roundMoneyExact(0.015)).toBe(0.01);
    expect(roundMoney(0.015)).toBe(0.02);
    expect(roundMoneyExact(0.045)).toBe(0.04);
    expect(roundMoney(0.045)).toBe(0.05);
    // and they treat a negative half-cent differently too
    expect(roundMoneyExact(-0.005)).toBe(-0.01);
    expect(roundMoney(-0.005) === 0).toBe(true); // Math.round(-0.5) is -0
  });

  it("agrees with roundMoney on amounts that are already cents", () => {
    for (let c = 0; c < 100_000; c += 13) expect(roundMoneyExact(c / 100)).toBe(roundMoney(c / 100));
  });
});

describe("formatMoney", () => {
  it("shows the country for dollar currencies by default (XenSplit groups can mix dollars)", () => {
    expect(formatMoney(1234.5, "CAD")).toBe("CA$1,234.50");
    expect(formatMoney(1234.5, "USD")).toBe("$1,234.50");
  });

  it("shows the bare symbol when asked (XenBudget books have one currency)", () => {
    expect(formatMoney(1234.5, "CAD", { symbol: "narrow" })).toBe("$1,234.50");
    expect(formatMoney(1000, "JPY", { symbol: "narrow" })).toBe("¥1,000");
  });

  it("handles a zero-decimal currency", () => {
    expect(formatMoney(1000, "JPY")).toBe("¥1,000");
  });

  it("supports the compact and whole-amount variants the XenBudget report uses", () => {
    expect(formatMoney(12_400, "CAD", { symbol: "narrow", compact: true, maximumFractionDigits: 1 })).toBe("$12.4K");
    expect(formatMoney(840.4, "CAD", { symbol: "narrow", maximumFractionDigits: 0 })).toBe("$840");
    expect(formatMoney(12.5, "CAD", { symbol: "narrow", minimumFractionDigits: 0, maximumFractionDigits: 2 })).toBe(
      "$12.5",
    );
    expect(formatMoney(12, "CAD", { symbol: "narrow", minimumFractionDigits: 0, maximumFractionDigits: 2 })).toBe(
      "$12",
    );
  });

  it("formats negative amounts", () => {
    expect(formatMoney(-5, "CAD", { symbol: "narrow" })).toBe("-$5.00");
  });
});

describe("currencySymbol", () => {
  it("returns the symbol in either style", () => {
    expect(currencySymbol("CAD")).toBe("CA$");
    expect(currencySymbol("CAD", "narrow")).toBe("$");
    expect(currencySymbol("JPY", "narrow")).toBe("¥");
    expect(currencySymbol("BRL", "narrow")).toBe("R$");
  });
});
