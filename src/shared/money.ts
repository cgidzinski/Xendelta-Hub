// Money helpers shared by the server and the client: how amounts are rounded and how they are shown.
//
// Imported by both sides, so it stays free of Node and DOM APIs (Intl is available in both).
//
// Amounts are stored as plain decimal numbers (e.g. 12.5), rounded to 2 places. A production
// check found no stored amount with float noise, so that is deliberate: see `npm run db:stats`.
// JPY has no minor unit but is still rounded to 2 places here, as it always has been; whole-yen
// amounts are unaffected.

// ---------------------------------------------------------------------------------------------
// Rounding. There are TWO behaviours, on purpose. They agree on almost every input but not on
// half-cents: for 0.015, roundMoney gives 0.02 and roundMoneyExact gives 0.01 (about 4% of
// three-decimal inputs differ). Picking one and "tidying" the other would move cents in existing
// data, so both are kept, named for what they do, and pinned by money.test.ts.
// ---------------------------------------------------------------------------------------------

/**
 * Round to 2 decimal places as `Math.round(amount * 100) / 100` (0.015 -> 0.02). This is what
 * XenBudget has always used for stored amounts and what every client-side display calculation
 * uses. Use this for all new code.
 */
export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Round to 2 decimal places using the exact binary value of the number (`toFixed`), so 0.015 is
 * 0.01 because that double is really 0.01499999999999999944.
 *
 * XenSplit's balance engine, exchange conversion and the Explain view use this. Server and client
 * run the same engine, so they agree with each other; changing it would shift balances and
 * settlement suggestions by a cent in existing groups. Do not use it in new code.
 */
export function roundMoneyExact(amount: number): number {
  return Number(amount.toFixed(2));
}

// ---------------------------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------------------------

export interface FormatMoneyOptions {
  /**
   * "code": the default symbol display, which prefixes the country for dollar currencies
   * (CA$12.50, US$12.50). XenSplit shows this because a group can mix dollars.
   * "narrow": the bare symbol ($12.50, ¥1,000). XenBudget shows this: a book has one currency.
   */
  symbol?: "code" | "narrow";
  /** Fewer/more decimals than the currency's default. */
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  /** 1.2K style, for chart axes and tight spaces. */
  compact?: boolean;
  /** undefined = en-US (stable output). null = the browser's own locale (client only). */
  locale?: string | null;
}

export function formatMoney(amount: number, currency: string, options: FormatMoneyOptions = {}): string {
  const { symbol = "code", minimumFractionDigits, maximumFractionDigits, compact, locale } = options;
  return new Intl.NumberFormat(locale === null ? undefined : (locale ?? "en-US"), {
    style: "currency",
    currency,
    ...(symbol === "narrow" ? { currencyDisplay: "narrowSymbol" as const } : {}),
    ...(compact ? { notation: "compact" as const } : {}),
    ...(minimumFractionDigits !== undefined ? { minimumFractionDigits } : {}),
    ...(maximumFractionDigits !== undefined ? { maximumFractionDigits } : {}),
  }).format(amount);
}

/** The symbol for a currency ("$", "¥", "R$", ...), in the same style as formatMoney. */
export function currencySymbol(currency: string, symbol: "code" | "narrow" = "code"): string {
  return (
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      ...(symbol === "narrow" ? { currencyDisplay: "narrowSymbol" as const } : {}),
    })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? currency
  );
}
