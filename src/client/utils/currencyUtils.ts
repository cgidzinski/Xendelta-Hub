export const ALL_CURRENCIES = ["CAD", "USD", "JPY", "EUR", "GBP", "AUD", "CNY", "INR", "MXN", "BRL"];

export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount);
}

export function getCurrencySymbol(currency: string): string {
  return (
    new Intl.NumberFormat("en-US", { style: "currency", currency })
      .formatToParts(0)
      .find((p) => p.type === "currency")?.value ?? currency
  );
}

export function getSortedCurrencies(defaultCurrency?: string): string[] {
  if (!defaultCurrency) return ALL_CURRENCIES;
  return [defaultCurrency, ...ALL_CURRENCIES.filter((c) => c !== defaultCurrency)];
}

// Accepts only digits and a single decimal separator (comma normalized to dot).
// Returns the sanitized string, or null if the keystroke should be rejected.
export function sanitizeAmount(raw: string): string | null {
  const normalized = raw.replace(/,/g, ".");
  if (!/^\d*\.?\d*$/.test(normalized)) return null;
  return normalized;
}
