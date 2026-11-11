import { formatMoney, currencySymbol } from "@shared/money";

// XenBudget-local currency formatting.
//
// XenBudget shows amounts with just the currency symbol ($, ¥, €, £, ₹, R$ ...), rather than the
// country-prefixed form (CA$, US$, A$ ...) that XenSplit uses because its groups can mix dollars.
// A book has a single currency, so the bare symbol is unambiguous.
export function formatCurrency(amount: number, currency: string): string {
  return formatMoney(amount, currency, { symbol: "narrow" });
}

export function getCurrencySymbol(currency: string): string {
  return currencySymbol(currency, "narrow");
}
